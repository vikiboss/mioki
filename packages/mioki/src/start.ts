import fs from 'node:fs'
import path from 'node:path'
import { hrtime } from 'node:process'
import * as cfg from './config'
import { NapCat } from 'napcat-sdk'
import { version } from '../package.json'
import * as utils from './utils'
import * as actions from './actions'
import { logger } from './logger'
import { colors } from 'consola/utils'
import { BUILTIN_PLUGINS } from './builtins'
import { enablePlugin, ensurePluginDir, getAbsPluginDir, runtimePlugins } from './plugin'

import type { MiokiPlugin } from './plugin'
import type { MiokiConfig } from './config'

export interface StartOptions {
  cwd?: string
  config?: Partial<MiokiConfig>
  configFile?: string
}

export interface ExtendedNapCat extends NapCat {
  bot_id: number
  app_name: string
  app_version: string
  name?: string
}

export const connectedBots: Map<number, ExtendedNapCat> = new Map()

async function connectBot(config: cfg.NapCatInstanceConfig, index: number): Promise<ExtendedNapCat | null> {
  const { protocol = 'ws', port = 3001, host = 'localhost', token = '', name } = config
  const botName = name || `Bot${index + 1}`
  const wsUrl = colors.green(`${protocol}://${host}:${port}${token ? '?access_token=***' : ''}`)

  logger.info(`>>> 正在连接 ${colors.cyan(botName)}: ${wsUrl}`)

  const napcat = new NapCat({ token, protocol, host, port, logger })

  return new Promise((resolve) => {
    napcat.on('ws.close', () => {
      logger.warn(`${colors.yellow(botName)} WS 连接已关闭`)
    })

    napcat.on('ws.error', (err) => {
      logger.error(`${colors.red(botName)} WS 连接错误: ${err}`)
    })

    napcat.once('napcat.connected', ({ user_id, nickname, app_name, app_version }) => {
      logger.info(
        `已连接到 ${colors.cyan(botName)}: ${colors.green(`${app_name}-v${app_version} ${nickname}(${user_id})`)}`,
      )

      if (connectedBots.has(user_id)) {
        const existingBot = connectedBots.get(user_id)!
        if (existingBot.name) {
          logger.warn(
            `${colors.yellow(botName)} (${user_id}) 与 ${colors.yellow(existingBot.name)} (${user_id}) QQ 号重复，将跳过`,
          )
        }
        napcat.close()
        resolve(null)
        return
      }

      const extendedNapCat = napcat as ExtendedNapCat

      extendedNapCat.bot_id = user_id
      extendedNapCat.app_name = app_name
      extendedNapCat.app_version = app_version
      extendedNapCat.name = botName

      resolve(extendedNapCat)
    })

    napcat.run().catch((err) => {
      logger.error(`${colors.red(botName)} 连接失败: ${err.message}`)
      resolve(null)
    })
  })
}

async function setupPlugins(napcat: NapCat, bots: ExtendedNapCat[]): Promise<void> {
  const plugin_dir = getAbsPluginDir()
  const mainBot = napcat

  ensurePluginDir()

  const plugins = cfg.botConfig.plugins
    .map((p) => ({ dirName: p, absPath: path.resolve(plugin_dir, p) }))
    .filter((p) => {
      if (!fs.existsSync(p.absPath)) {
        mainBot.logger.warn(`插件 ${colors.red(p.dirName)} 不存在，已忽略`)
        return false
      }

      return true
    })

  const failedImportPlugins: [string, string][] = []

  const promises = plugins.map(async ({ absPath, dirName }) => {
    try {
      const plugin = (await utils.jiti.import(absPath, { default: true })) as MiokiPlugin

      if (plugin.name !== dirName) {
        const tip = `插件目录名 [${colors.yellow(dirName)}] 和插件声明的 name [${colors.yellow(plugin.name)}] 不一致，可能导致重载异常，请修改一致后重启。`
        mainBot.logger.warn(tip)
        actions.noticeMainOwner(mainBot, tip)
      }
      return plugin
    } catch (e) {
      const err = utils.stringifyError(e)
      failedImportPlugins.push([dirName, err])
      return null
    }
  })

  const start = hrtime.bigint()
  const userPlugins = (await Promise.all(promises)).filter(Boolean) as MiokiPlugin[]
  const sortedUserPlugins = userPlugins.toSorted((prev, next) => (prev.priority ?? 100) - (next.priority ?? 100))

  if (failedImportPlugins.length) {
    const tip = `${colors.red(failedImportPlugins.length)} 个插件加载失败: \n\n${failedImportPlugins.map(([dirName, err]) => `${dirName}: ${err}`).join('\n\n')}`
    mainBot.logger.warn(tip)
    actions.noticeMainOwner(mainBot, tip)
  }

  const pluginGroups = new Map<number, MiokiPlugin[]>()
  for (const plugin of sortedUserPlugins) {
    const priority = plugin.priority ?? 100
    if (!pluginGroups.has(priority)) {
      pluginGroups.set(priority, [])
    }
    pluginGroups.get(priority)!.push(plugin)
  }

  const sortedGroups = Array.from(pluginGroups.entries()).toSorted(([a], [b]) => a - b)

  const failedEnablePlugins: [string, string][] = []

  try {
    mainBot.logger.info(`>>> 加载内置插件: ${BUILTIN_PLUGINS.map((p) => colors.cyan(p.name)).join(', ')}`)
    await Promise.all(BUILTIN_PLUGINS.map((p) => enablePlugin(bots, p, 'builtin')))

    mainBot.logger.info(
      `>>> 加载用户插件: ${sortedGroups.map(([priority, plugins]) => `优先级 ${colors.yellow(priority)} (${plugins.map((p) => colors.cyan(p.name)).join(', ')})`).join('，')}`,
    )
    for (const [_, plugins] of sortedGroups) {
      await Promise.all(
        plugins.map(async (p) => {
          try {
            await enablePlugin(bots, p, 'external')
          } catch (e) {
            failedEnablePlugins.push([p.name, utils.stringifyError(e)])
          }
        }),
      )
    }
  } catch (e: any) {
    mainBot.logger.error(e?.message)
    await actions.noticeMainOwner(mainBot, e?.message).catch(() => {
      mainBot.logger.error('发送插件启用失败通知失败')
    })
  }

  const end = hrtime.bigint()
  const costTime = Math.round(Number(end - start)) / 1_000_000
  const failedCount = failedImportPlugins.length + failedEnablePlugins.length

  const failedInfo =
    failedCount > 0
      ? `${colors.red(failedCount)} 个失败 (导入 ${colors.red(failedImportPlugins.length)}，启用 ${colors.red(failedEnablePlugins.length)})`
      : ''

  mainBot.logger.info(
    `成功加载了 ${colors.green(runtimePlugins.size)} 个插件，${failedInfo ? failedInfo : ''}总耗时 ${colors.green(costTime.toFixed(2))} 毫秒`,
  )

  mainBot.logger.info(
    colors.green(
      `mioki v${version} 启动完成，向机器人发送「${colors.magentaBright(`${cfg.botConfig.prefix}帮助`)}」查看消息指令`,
    ),
  )

  if (cfg.botConfig.online_push) {
    await actions.noticeMainOwner(mainBot, `✅ mioki v${version} 已就绪`).catch((err) => {
      mainBot.logger.error(`发送就绪通知失败: ${utils.stringifyError(err)}`)
    })
  }
}

export async function start(options: StartOptions = {}): Promise<void> {
  cfg.initConfig(options)


  process.title = `mioki v${version}`

  const plugin_dir = getAbsPluginDir()

  logger.info(colors.dim('='.repeat(40)))
  logger.info(`欢迎使用 ${colors.bold(colors.redBright('mioki'))} 💓 ${colors.bold(colors.cyan(`v${version}`))}`)
  logger.info(colors.yellow(colors.underline(`一个基于 NapCat 的插件式 QQ 机器人框架`)))
  logger.info(colors.cyan(`轻量 * 跨平台 * 插件式 * 热重载 * 注重开发体验`))
  logger.info(colors.dim('='.repeat(40)))
  logger.info(colors.dim(colors.italic(`作者: Viki <hi@viki.moe> (https://github.com/vikiboss)`)))
  logger.info(colors.dim(colors.italic(`仓库: https://github.com/vikiboss/mioki`)))
  logger.info(colors.dim(colors.italic(`文档: https://mioki.viki.moe`)))
  logger.info(colors.dim('='.repeat(40)))
  logger.info(`${colors.dim('工作目录: ')}${colors.blue(cfg.BOT_CWD.value)}`)
  logger.info(`${colors.dim('插件目录: ')}${colors.blue(plugin_dir)}`)
  logger.info(`${colors.dim('配置文件: ')}${colors.blue(`${cfg.BOT_CWD.value}/package.json`)}`)
  logger.info(colors.dim('='.repeat(40)))

  const napcatConfigs = cfg.botConfig.napcat

  if (napcatConfigs.length === 0) {
    logger.warn('未配置任何 NapCat 实例，框架将以无实例模式启动')
    logger.info(
      colors.green(
        `mioki v${version} 启动完成，向机器人发送「${colors.magentaBright(`${cfg.botConfig.prefix}帮助`)}」查看消息指令`,
      ),
    )
    return
  }

  // 检查配置中是否有重复的 host:port
  const seenEndpoints = new Set<string>()
  const duplicateConfigs: string[] = []

  for (const config of napcatConfigs) {
    const { protocol = 'ws', host = 'localhost', port = 3001 } = config
    const endpoint = `${protocol}://${host}:${port}`

    if (seenEndpoints.has(endpoint)) {
      duplicateConfigs.push(`${config.name || '未命名'} (${endpoint})`)
    } else {
      seenEndpoints.add(endpoint)
    }
  }

  if (duplicateConfigs.length > 0) {
    logger.error(`检测到重复的 NapCat 实例配置:`)
    duplicateConfigs.forEach((dup) => logger.error(`  - ${dup}`))
    logger.error('请检查配置文件，确保每个实例的 host:port 组合唯一')
    process.exit(1)
  }

  logger.info(colors.dim('='.repeat(40)))
  logger.info(`>>> 正在连接 ${napcatConfigs.length} 个 NapCat 实例...`)

  const connectedBotResults = await Promise.all(napcatConfigs.map((config, index) => connectBot(config, index)))

  const bots = connectedBotResults.filter((b): b is ExtendedNapCat => b !== null)

  if (bots.length === 0) {
    logger.error('所有 NapCat 实例连接失败，框架无法启动')
    process.exit(1)
  }

  for (const bot of bots) {
    connectedBots.set(bot.bot_id, bot)
  }

  if (bots.length < napcatConfigs.length) {
    logger.warn(`${colors.yellow(napcatConfigs.length - bots.length)} 个 NapCat 实例连接失败`)
  }

  const botNames = bots.map((b) => `${b.name}(${b.bot_id})`).join(', ')
  logger.info(colors.green(`成功连接 ${bots.length} 个实例: ${botNames}`))
  logger.info(colors.dim('='.repeat(40)))

  const mainBot = bots[0]
  process.title = `mioki v${version} ${bots.map((b) => `${b.bot_id}`).join(', ')}`

  let lastNoticeTime = 0

  for (const bot of bots) {
    process.on('uncaughtException', async (err: any) => {
      const msg = utils.stringifyError(err)
      bot.logger.error(`uncaughtException, 出错了: ${msg}`)

      if (cfg.botConfig.error_push) {
        if (Date.now() - lastNoticeTime < 1_000) return
        lastNoticeTime = Date.now()
        await actions.noticeMainOwner(mainBot, `mioki 发生未捕获异常:\n\n${msg}`).catch(() => {
          mainBot.logger.error('发送未捕获异常通知失败')
        })
      }
    })

    process.on('unhandledRejection', async (err: any) => {
      const msg = utils.stringifyError(err)
      bot.logger.error(`unhandledRejection, 出错了: ${msg}`)

      if (cfg.botConfig.error_push) {
        if (Date.now() - lastNoticeTime < 1_000) return
        lastNoticeTime = Date.now()
        const date = new Date().toLocaleString()

        await actions.noticeMainOwner(mainBot, `【${date}】\n\nmioki 发生未处理异常:\n\n${msg}`).catch(() => {
          mainBot.logger.error('发送未处理异常通知失败')
        })
      }
    })
  }

  await setupPlugins(mainBot, bots)
}
