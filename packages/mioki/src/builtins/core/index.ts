import { version } from '../../../package.json' with { type: 'json' }
import { definePlugin } from '../../plugin'
import { createCmd } from '../../utils'
import { isEventOwner, isEventOwnerOrAdmin } from '../../runtime/mioki-context'
import { buildMiokiStatus, formatMiokiStatus } from './status'

import type { MessageEvent } from '../../adapter'
import type { MiokiStatus, StatusProvider } from './status'
import type { MiokiPlugin } from '../../plugin'

export type { MiokiStatus, StatusProvider } from './status'

export const CORE_PLUGINS = ['mioki-core']

export const formatMiokiStatusFn = formatMiokiStatus

const core: MiokiPlugin = definePlugin({
  name: 'mioki-core',
  version,
  priority: 8,
  description: 'mioki 内置核心插件',
  setup(ctx) {
    const prefix = (ctx.config.prefix ?? '#').replace(/[-_.^$?[\]{}()|\\]/g, '\\$&')
    const cmdPrefix = new RegExp(`^${prefix}`)
    const statusAdminOnly = ctx.config.status_permission === 'admin-only'

    const collectBots = (): typeof ctx.bots => ctx.bots
    const collectAdapters = (): { name: import('../../types').AdapterName; version?: string }[] => {
      const seen = new Set<string>()
      const list: { name: import('../../types').AdapterName; version?: string }[] = []
      for (const bot of ctx.bots) {
        if (seen.has(String(bot.adapter))) continue
        seen.add(String(bot.adapter))
        const runtime = (ctx as unknown as { runtime?: { getAdapter<T = unknown>(name: string): { version?: string } | undefined } }).runtime
        const adapter = runtime?.getAdapter(String(bot.adapter))
        list.push({ name: bot.adapter, version: adapter?.version })
      }
      return list
    }

    const getStatus = async (): Promise<MiokiStatus> => {
      const enabledPlugins = (ctx as unknown as { runtime?: { enabledPluginsCount?: () => number } }).runtime?.enabledPluginsCount?.() ?? 0
      const totalPlugins = enabledPlugins
      return await buildMiokiStatus({
        bots: collectBots(),
        adapters: collectAdapters(),
        enabledPlugins,
        totalPlugins,
      })
    }

    ctx.handle('message', (event) => {
      void (async () => {
        const ev = event as MessageEvent
        const text = ev.message.text()
        if (!cmdPrefix.test(text)) return
        const stripped = text.replace(cmdPrefix, '')
        const { cmd, params } = createCmd(stripped)
        const subCmd = cmd
        const target = params[0]

        if (statusAdminOnly && !isEventOwnerOrAdmin(ev)) return

        if (subCmd === '状态' || subCmd === 'status') {
          await ev.reply(await formatMiokiStatus(await getStatus()))
          return
        }

        if (!isEventOwner(ev)) return

        if (subCmd === '帮助' || subCmd === 'help') {
          await ev.reply(
            `💡 mioki 帮助\n${ctx.config.prefix ?? '#'}状态 - 显示框架状态\n${ctx.config.prefix ?? '#'}帮助 - 显示帮助信息\n${ctx.config.prefix ?? '#'}退出 - 退出框架进程`,
          )
          return
        }

        if (subCmd === '退出' || subCmd === 'exit') {
          await ev.reply('またね～')
          ctx.logger.info('接收到退出指令，即将退出...')
          process.exit(0)
        }

        if (subCmd === '设置' || subCmd === 'config') {
          const action = target
          if (action === '详情' || action === 'detail') {
            await ev.reply(
              `主人: ${ctx.config.owners.join(', ') || '(无)'}\n管理: ${ctx.config.admins.join(', ') || '(无)'}\n启用插件: ${ctx.config.plugins.join(', ') || '(无)'}`,
            )
            return
          }
          await ev.reply(
            `${ctx.config.prefix ?? '#'}设置 详情 - 查看当前设置`,
          )
          return
        }

        if (subCmd === '插件' || subCmd === 'plugin') {
          await ev.reply(`当前已启用插件: ${ctx.config.plugins.join(', ') || '(无)'}`)
        }
      })()
    })

  },
})

export default core
export { buildMiokiStatus, formatMiokiStatus, registerStatusProvider, setStatusFormatter } from './status'
