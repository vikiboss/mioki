import { version } from '../../../package.json' with { type: 'json' }
import { definePlugin } from '../../plugin'
import { createCmd, dedent, unique } from '../../utils'
import { isEventOwner, isEventOwnerOrAdmin } from '../../runtime/mioki-context'
import { buildMiokiStatus, formatMiokiStatus } from './status'

import type { MessageSegment } from '../../adapter'
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
    const displayPrefix = prefix.replace(/\\\\/g, '\\')
    const statusAdminOnly = ctx.config.status_permission === 'admin-only'

    const collectBots = (): typeof ctx.bots => ctx.bots
    const collectAdapters = (): { name: string; version?: string }[] => {
      const seen = new Set<string>()
      const list: { name: string; version?: string }[] = []
      for (const bot of ctx.bots) {
        if (seen.has(String(bot.adapter))) continue
        seen.add(String(bot.adapter))
        const adapter = ctx.getAdapter(bot.adapter)
        list.push({ name: bot.adapter, version: adapter?.version })
      }
      return list
    }

    const getStatus = async (): Promise<MiokiStatus> => {
      const enabled = ctx.plugins.list().length
      const total = ctx.plugins.list().length + ctx.plugins.localPlugins().length
      return await buildMiokiStatus({
        bots: collectBots(),
        adapters: collectAdapters(),
        enabledPlugins: enabled,
        totalPlugins: total,
      })
    }

    const atTarget = (event: MessageEvent): string | undefined => {
      const at = event.message.find((seg): seg is MessageSegment & { data: Record<string, unknown> } => seg.type === 'at')
      const qq = at?.data?.qq ?? at?.data?.target
      return qq != null ? String(qq) : undefined
    }

    ctx.handle('message', async (event) => {
      const ev = event as MessageEvent
      const text = ev.message.text()

      if (!cmdPrefix.test(text)) return

      if (statusAdminOnly && !isEventOwnerOrAdmin(ev)) return

      if (text.replace(cmdPrefix, '').trim() === '状态') {
        await ev.reply(await formatMiokiStatus(await getStatus()))
        return
      }

      if (!isEventOwner(ev)) return

      const { cmd, params } = createCmd(text)
      if (!cmd) return

      const subCmd = cmd.replace(cmdPrefix, '').replace(/\s+/g, '')
      const target = params[0]

      switch (subCmd) {
        case '帮助': {
          await ev.reply(
            dedent(`
              〓 💡 mioki 帮助 〓
              ${displayPrefix}插件 👉 框架插件管理
              ${displayPrefix}状态 👉 显示框架状态
              ${displayPrefix}设置 👉 框架设置管理
              ${displayPrefix}帮助 👉 显示帮助信息
              ${displayPrefix}退出 👉 退出框架进程
            `).trim(),
          )
          break
        }

        case '插件': {
          if (CORE_PLUGINS.includes(target)) {
            await ev.reply('内置插件无法操作')
            return
          }

          switch (target) {
            case '列表': {
              const enabled = ctx.plugins.list()
              const plugins = unique([...ctx.plugins.localPlugins(), ...enabled.map((e) => e.name)])
                .map((name) => {
                  const entry = enabled.find((e) => e.name === name)
                  const tag = entry ? '🟢' : '🔴'
                  const type = entry?.type === 'builtin' ? '[内置]' : '[用户]'
                  return `${tag} ${type} ${name}`
                })
                .toSorted((pre, next) => {
                  const weight = (str: string): number => {
                    let w = 0
                    if (str.includes('🟢')) w += 10
                    if (str.includes('[内置]')) w += 1
                    return w
                  }
                  return weight(next) - weight(pre) || pre.localeCompare(next)
                })

              await ev.reply(
                dedent(`
                  〓 插件列表 〓
                  ${plugins.join('\n')}
                  共 ${plugins.length} 个，启用 ${enabled.length} 个
                `).trim(),
              )
              break
            }

            case '启用': {
              const pluginName = params[1]
              if (!pluginName) {
                await ev.reply('请指定插件 ID')
                return
              }
              try {
                await ctx.plugins.enable(pluginName)
              } catch (err) {
                await ev.reply(`插件 ${pluginName} 启用失败：${err instanceof Error ? err.message : '未知错误'}`)
                return
              }
              await ctx.updateConfig((c) => {
                c.plugins = [...c.plugins, pluginName]
              })
              await ev.reply(`插件 ${pluginName} 启用成功`)
              break
            }

            case '禁用': {
              const pluginName = params[1]
              if (!pluginName) {
                await ev.reply('请指定插件 ID')
                return
              }
              try {
                await ctx.plugins.disable(pluginName)
              } catch (err) {
                await ev.reply(err instanceof Error ? err.message : String(err))
                return
              }
              await ctx.updateConfig((c) => {
                c.plugins = c.plugins.filter((name) => name !== pluginName)
              })
              await ev.reply(`插件 ${pluginName} 已禁用`)
              break
            }

            case '重载': {
              const pluginName = params[1]
              if (!pluginName) {
                await ev.reply('请指定插件 ID')
                return
              }
              try {
                await ctx.plugins.reload(pluginName)
              } catch (err) {
                await ev.reply(err instanceof Error ? err.message : String(err))
                return
              }
              await ctx.updateConfig((c) => {
                c.plugins = [...c.plugins, pluginName]
              })
              await ev.reply(`插件 ${pluginName} 已重载`)
              break
            }

            default: {
              await ev.reply(
                dedent(`
                  〓 🧩 mioki 插件 〓
                  ${displayPrefix}插件 列表
                  ${displayPrefix}插件 启用 <插件 ID>
                  ${displayPrefix}插件 禁用 <插件 ID>
                  ${displayPrefix}插件 重载 <插件 ID>
                `).trim(),
              )
              break
            }
          }
          break
        }

        case '设置': {
          const action = target
          switch (action) {
            case '详情': {
              await ev.reply(
                dedent(`
                  〓 设置详情 〓
                  主人: ${ctx.config.owners.join(', ') || '(无)'}
                  管理: ${ctx.config.admins.join(', ') || '(无)'}
                  启用插件: ${ctx.config.plugins.join(', ') || '(无)'}
                `).trim(),
              )
              break
            }

            case '加主人':
            case '添加主人': {
              const uid = params[1] ?? atTarget(ev)
              if (!uid) {
                await ev.reply('请指定主人 QQ/AT')
                return
              }
              const userId = String(uid)
              if (ctx.config.owners.includes(userId)) {
                await ev.reply(`主人 ${uid} 已存在`)
                return
              }
              await ctx.updateConfig((c) => {
                c.owners = [...c.owners, userId]
              })
              await ev.reply(`已添加主人 ${uid}`)
              break
            }

            case '删主人':
            case '删除主人': {
              const uid = params[1] ?? atTarget(ev)
              if (!uid) {
                await ev.reply('请指定主人 QQ/AT')
                return
              }
              const userId = String(uid)
              if (userId === ctx.config.owners[0]) {
                await ev.reply('不能删除第一主人')
                return
              }
              if (!ctx.config.owners.includes(userId)) {
                await ev.reply(`主人 ${uid} 不存在`)
                return
              }
              await ctx.updateConfig((c) => {
                c.owners = c.owners.filter((id) => id !== userId)
              })
              await ev.reply(`已删除主人 ${uid}`)
              break
            }

            case '加管理':
            case '添加管理': {
              const uid = params[1] ?? atTarget(ev)
              if (!uid) {
                await ev.reply('请指定管理 QQ/AT')
                return
              }
              const userId = String(uid)
              if (ctx.config.admins.includes(userId)) {
                await ev.reply(`管理 ${uid} 已存在`)
                return
              }
              await ctx.updateConfig((c) => {
                c.admins = [...c.admins, userId]
              })
              await ev.reply(`已添加管理 ${uid}`)
              break
            }

            case '删管理':
            case '删除管理': {
              const uid = params[1] ?? atTarget(ev)
              if (!uid) {
                await ev.reply('请指定管理 QQ/AT')
                return
              }
              const userId = String(uid)
              if (!ctx.config.admins.includes(userId)) {
                await ev.reply(`管理 ${uid} 不存在`)
                return
              }
              await ctx.updateConfig((c) => {
                c.admins = c.admins.filter((id) => id !== userId)
              })
              await ev.reply(`已删除管理 ${uid}`)
              break
            }

            default: {
              await ev.reply(
                dedent(`
                  〓 ⚙️ mioki 设置 〓
                  ${displayPrefix}设置 详情
                  ${displayPrefix}设置 [加/删]主人 <QQ/AT>
                  ${displayPrefix}设置 [加/删]管理 <QQ/AT>
                `).trim(),
              )
              break
            }
          }
          break
        }

        case '退出': {
          await ev.reply('またね～')
          ctx.logger.info('接收到退出指令，即将退出... 如需自动重启，请使用 pm2 部署。')
          process.exit(0)
        }
      }
    })
  },
})

export default core
export { buildMiokiStatus, formatMiokiStatus, registerStatusProvider, setStatusFormatter } from './status'
