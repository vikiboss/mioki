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
export interface StartOptions {
  cwd?: string
}

export async function start(options: StartOptions = {}): Promise<void> {
  const { cwd = process.cwd() } = options

  if (cwd !== cfg.BOT_CWD.value) {
    cfg.updateBotCWD(path.resolve(cwd))
  }

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

  const { protocol = 'ws', port = 3001, host = 'localhost', token = '' } = cfg.botConfig.napcat || {}
  const wsUrl = colors.green(`${protocol}://${host}:${port}${token ? '?access_token=***' : ''}`)

  logger.info(`>>> 正在连接 NapCat 实例: ${wsUrl}`)

  const napcat = new NapCat({ token, protocol, host, port, logger })

  napcat.on('ws.close', () => {
    logger.error('WS 连接失败，请确保 token 配置正确且 NapCat 实例正常运行')
    process.exit(1)
  })

  napcat.on('napcat.connected', async ({ user_id, nickname, app_name, app_version }) => {
    logger.info(`已连接到 NapCat 实例: ${colors.green(`${app_name}-v${app_version} ${nickname}(${user_id})`)}`)

    process.title = `mioki v${version} ${app_name}-v${app_version}-${user_id}`

    let lastNoticeTime = 0

    process.on('uncaughtException', async (err: any) => {
      const msg = utils.stringifyError(err)
      napcat.logger.error(`uncaughtException, 出错了: ${msg}`)

      if (cfg.botConfig.error_push) {
        if (Date.now() - lastNoticeTime < 1_000) return
        lastNoticeTime = Date.now()
        await actions.noticeMainOwner(napcat, `mioki 发生未捕获异常:\n\n${msg}`).catch(() => {
          napcat.logger.error('发送未捕获异常通知失败')
        })
      }
    })

    process.on('unhandledRejection', async (err: any) => {
      const msg = utils.stringifyError(err)
      napcat.logger.error(`unhandledRejection, 出错了: ${msg}`)

      if (cfg.botConfig.error_push) {
        if (Date.now() - lastNoticeTime < 1_000) return
        lastNoticeTime = Date.now()
        const date = new Date().toLocaleString()

        await actions.noticeMainOwner(napcat, `【${date}】\n\nmioki 发生未处理异常:\n\n${msg}`).catch(() => {
          napcat.logger.error('发送未处理异常通知失败')
        })
      }
    })

    ensurePluginDir()

    const plugins = cfg.botConfig.plugins
      .map((p) => ({ dirName: p, absPath: path.resolve(plugin_dir, p) }))
      .filter((p) => {
        if (!fs.existsSync(p.absPath)) {
          napcat.logger.warn(`插件 ${colors.red(p.dirName)} 不存在，已忽略`)
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
          napcat.logger.warn(tip)
          actions.noticeMainOwner(napcat, tip)
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
      napcat.logger.warn(tip)
      actions.noticeMainOwner(napcat, tip)
    }

    // 按 priority 分组
    const pluginGroups = new Map<number, MiokiPlugin[]>()
    for (const plugin of sortedUserPlugins) {
      const priority = plugin.priority ?? 100
      if (!pluginGroups.has(priority)) {
        pluginGroups.set(priority, [])
      }
      pluginGroups.get(priority)!.push(plugin)
    }

    // 按 priority 排序分组
    const sortedGroups = Array.from(pluginGroups.entries()).toSorted(([a], [b]) => a - b)

    const failedEnablePlugins: [string, string][] = []

    try {
      // 加载内置插件
      napcat.logger.info(`>>> 加载内置插件: ${BUILTIN_PLUGINS.map((p) => colors.cyan(p.name)).join(', ')}`)
      await Promise.all(BUILTIN_PLUGINS.map((p) => enablePlugin(napcat, p, 'builtin')))

      // 按优先级分组并行加载用户插件，相同优先级的插件可以并行加载
      napcat.logger.info(
        `>>> 加载用户插件: ${sortedGroups.map(([priority, plugins]) => `优先级 ${colors.yellow(priority)} (${plugins.map((p) => colors.cyan(p.name)).join(', ')})`).join('，')}`,
      )
      for (const [_, plugins] of sortedGroups) {
        await Promise.all(
          plugins.map(async (p) => {
            try {
              await enablePlugin(napcat, p, 'external')
            } catch (e) {
              failedEnablePlugins.push([p.name, utils.stringifyError(e)])
            }
          }),
        )
      }
    } catch (e: any) {
      napcat.logger.error(e?.message)
      await actions.noticeMainOwner(napcat, e?.message).catch(() => {
        napcat.logger.error('发送插件启用失败通知失败')
      })
    }

    const end = hrtime.bigint()
    const costTime = Math.round(Number(end - start)) / 1_000_000
    const failedCount = failedImportPlugins.length + failedEnablePlugins.length

    const failedInfo =
      failedCount > 0
        ? `${colors.red(failedCount)} 个失败 (导入 ${colors.red(failedImportPlugins.length)}，启用 ${colors.red(failedEnablePlugins.length)})`
        : ''

    napcat.logger.info(
      `成功加载了 ${colors.green(runtimePlugins.size)} 个插件，${failedInfo ? failedInfo : ''}总耗时 ${colors.green(costTime.toFixed(2))} 毫秒`,
    )

    napcat.logger.info(
      colors.green(
        `mioki v${version} 启动完成，向机器人发送「${colors.magentaBright(`${cfg.botConfig.prefix}帮助`)}」查看消息指令`,
      ),
    )

    if (cfg.botConfig.online_push) {
      await actions.noticeMainOwner(napcat, `✅ mioki v${version} 已就绪`).catch((err) => {
        napcat.logger.error(`发送就绪通知失败: ${utils.stringifyError(err)}`)
      })
    }
  })

  await napcat.run()
}
