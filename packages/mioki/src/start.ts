import fs from 'node:fs'
import path from 'node:path'
import { hrtime } from 'node:process'
import * as cfg from './config'
import { NapCat } from 'napcat-sdk'
import { version } from '../package.json'
import * as utils from './utils'
import * as actions from './actions'
import { getMiokiLogger } from './logger'
import { BUILTIN_PLUGINS } from './builtins'
import { enablePlugin, ensurePluginDir, getAbsPluginDir, runtimePlugins } from './plugin'

import type { MiokiPlugin } from './plugin'

export interface StartOptions {
  cwd?: string
}

export async function start(options: StartOptions = {}): Promise<void> {
  const { cwd = process.cwd() } = options

  if (cwd !== cfg.BOT_CWD.value) {
    cfg.updateBotCWD(cwd)
  }

  process.title = `mioki v${version}`

  const logger = getMiokiLogger(cfg.botConfig.log_level || 'info')
  const plugin_dir = getAbsPluginDir()

  logger.info(`>>> mioki v${version} 启动中`)
  logger.info(`>>> 工作目录: ${cfg.BOT_CWD.value}`)
  logger.info(`>>> 插件目录: ${plugin_dir}`)

  const napcat = new NapCat({
    ...cfg.botConfig.napcat,
    logger,
  })

  napcat.on('napcat.connected', async ({ uin }) => {
    logger.info(`>>> 已连接到 NapCat 服务器`)
    logger.info(`>>> 当前登录 QQ 账号: ${uin}`)

    let lastNoticeTime = 0

    process.on('uncaughtException', async (err: any) => {
      napcat.logger.error('>>> uncaughtException, 出错了', err)
      if (Date.now() - lastNoticeTime < 1_000) return
      lastNoticeTime = Date.now()
      await actions.noticeMainOwner(napcat, `mioki 发生未捕获异常:\n\n${err?.message || '未知错误'}`)
    })

    process.on('unhandledRejection', async (err: any) => {
      napcat.logger.error('>>> unhandledRejection, 出错了', err)
      if (Date.now() - lastNoticeTime < 1_000) return
      lastNoticeTime = Date.now()
      const date = new Date().toLocaleString()
      await actions.noticeMainOwner(napcat, `【${date}】\n\nmioki 发生未处理异常:\n\n${err?.message || '未知错误'}`)
    })

    ensurePluginDir()

    const plugins = cfg.botConfig.plugins
      .map((p) => ({ dirName: p, absPath: path.resolve(plugin_dir, p) }))
      .filter((p) => {
        if (!fs.existsSync(p.absPath)) {
          napcat.logger.warn(`>>> 插件 ${p.dirName} 不存在，已忽略`)
          return false
        }

        return true
      })

    const failedImportPlugins: [string, string][] = []

    const promises = plugins.map(async ({ absPath, dirName }) => {
      try {
        const plugin = (await utils.jiti.import(absPath, { default: true })) as MiokiPlugin

        if (plugin.name !== dirName) {
          const tip = `>>> 插件目录名 [${dirName}] 和插件声明的 name [${plugin.name}] 不一致，可能导致重载异常，请修改一致后重启。`
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
      const tip = `>>> ${failedImportPlugins.length} 个插件加载失败: \n\n${failedImportPlugins.map(([dirName, err]) => `${dirName}: ${err}`).join('\n\n')}`
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
      napcat.logger.info(`>>> 加载内置插件: ${BUILTIN_PLUGINS.map((p) => p.name).join(', ')}`)
      await Promise.all(BUILTIN_PLUGINS.map((p) => enablePlugin(napcat, p, 'builtin')))

      // 按优先级分组并行加载用户插件，相同优先级的插件可以并行加载
      for (const [_, plugins] of sortedGroups) {
        await Promise.all(
          plugins.map(async (p) => {
            try {
              await enablePlugin(napcat, p, 'external')
            } catch (e) {
              const err = utils.stringifyError(e)
              failedEnablePlugins.push([p.name, err])
            }
          }),
        )
      }
    } catch (e: any) {
      napcat.logger.error(e?.message)
      actions.noticeMainOwner(napcat, e?.message)
    }

    const end = hrtime.bigint()
    const costTime = Math.round(Number(end - start)) / 1_000_000
    const failedCount = failedImportPlugins.length + failedEnablePlugins.length

    const failedInfo =
      failedCount > 0
        ? `${failedCount} 个失败 (导入 ${failedImportPlugins.length}，启用 ${failedImportPlugins.length})。`
        : ''

    napcat.logger.info(
      `>>> 成功加载了 ${runtimePlugins.size} 个插件。${failedInfo ? failedInfo : ''}总耗时 ${costTime} ms`,
    )

    if (cfg.botConfig.online_push) {
      await actions.noticeMainOwner(napcat, `✅ mioki v${version} 已就绪`)
    }
  })

  await napcat.run()
}
