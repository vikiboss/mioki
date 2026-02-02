import { version } from '../../../package.json' with { type: 'json' }
import { getMiokiStatus, formatMiokiStatus, type MiokiStatus } from './status'
import { definePlugin, enablePlugin, findLocalPlugins, getAbsPluginDir, runtimePlugins } from '../..'

import type { Sendable } from 'napcat-sdk'
import type { Arrayable, Awaitable, MiokiPlugin } from '../..'

export const CORE_PLUGINS = ['mioki-core']
export type StatusFormatter = (status: MiokiStatus) => Awaitable<Arrayable<Sendable>>
export * from './status'

export interface MiokiCoreServiceContrib {
  /** 获取框架和系统的实时状态 */
  getMiokiStatus(): Promise<MiokiStatus>
  /** 格式化框架状态字符串 */
  formatMiokiStatus(status: MiokiStatus): Promise<string>
  /** 自定义框架状态格式化函数 */
  customFormatMiokiStatus(formatter: StatusFormatter): void
}

const core: MiokiPlugin = definePlugin({
  name: 'mioki-core',
  version,
  priority: 8,
  setup(ctx) {
    const prefix = (ctx.botConfig.prefix ?? '#').replace(/[-_.^$?[\]{}]/g, '\\$&')

    const cmdPrefix = new RegExp(`^${prefix}`)
    const displayPrefix = prefix.replace(/\\\\/g, '\\')
    const statusAdminOnly = ctx.botConfig.status_permission === 'admin-only'

    let statusFormatter = (status: MiokiStatus): Awaitable<Arrayable<Sendable>> => formatMiokiStatus(status)

    ctx.addService('getMiokiStatus', () => getMiokiStatus(ctx.bots))
    ctx.addService('formatMiokiStatus', (status: MiokiStatus) => formatMiokiStatus(status))
    ctx.addService('customFormatMiokiStatus', (formatter: StatusFormatter) => (statusFormatter = formatter))

    ctx.handle('message', (e) =>
      ctx.runWithErrorHandler(async () => {
        const text = ctx.text(e)

        if (!cmdPrefix.test(text)) return

        if (statusAdminOnly && !ctx.hasRight(e)) return

        if (text.replace(cmdPrefix, '') === '状态') {
          const status = await statusFormatter(await getMiokiStatus(ctx.bots))
          await e.reply(status)
          return
        }

        if (!ctx.isOwner(e)) return

        const { cmd, params, ..._options } = ctx.createCmd(text)

        if (!cmd) return

        const [subCmd, target, ..._subParams] = params

        switch (cmd?.replace(cmdPrefix, '')?.replace(/\s+/g, '')) {
          case '帮助': {
            await e.reply(
              ctx
                .dedent(
                  `
              〓 💡 mioki 帮助 〓
              ${displayPrefix}插件 👉 框架插件管理
              ${displayPrefix}状态 👉 显示框架状态
              ${displayPrefix}设置 👉 框架设置管理
              ${displayPrefix}帮助 👉 显示帮助信息
              ${displayPrefix}退出 👉 退出框架进程
              `,
                )
                .trim(),
            )
            break
          }

          case '插件': {
            if (CORE_PLUGINS.includes(target)) {
              await e.reply('内置插件无法操作', true)
              return
            }

            switch (subCmd) {
              case '列表': {
                const localPlugins = await findLocalPlugins()

                const plugins = ctx
                  .unique([...localPlugins.map((e) => e.name), ...runtimePlugins.keys()])
                  .map((name) => {
                    const isEnable = runtimePlugins.get(name)
                    const tag = isEnable ? '🟢' : '🔴'
                    const type = isEnable && isEnable?.type === 'builtin' ? '[内置]' : '[用户]'
                    return `${tag} ${type} ${name}`
                  })
                  .toSorted((pre, next) => {
                    function weight(str: string) {
                      let w = 0
                      if (str.includes('🟢')) w += 10
                      if (str.includes('[内置]')) w += 1
                      return w
                    }

                    const preWeight = weight(pre)
                    const nextWeight = weight(next)

                    return nextWeight - preWeight || pre.localeCompare(next)
                  })

                await e.reply(
                  ctx
                    .dedent(
                      `
                    〓 插件列表 〓
                    ${plugins.join('\n')}
                    共 ${plugins.length} 个，启用 ${runtimePlugins.size} 个
                    `,
                    )
                    .trim(),
                )

                break
              }
              case '启用': {
                if (!target) {
                  await e.reply('请指定插件 ID', true)
                  return
                }

                if (runtimePlugins.has(target)) {
                  await e.reply(`插件 ${target} 已经是启用状态`, true)
                  return
                }

                const pluginPath = ctx.path.join(getAbsPluginDir(), target)

                if (!ctx.fs.existsSync(pluginPath)) {
                  await e.reply(`插件 ${target} 不存在`, true)
                  return
                }

                try {
                  const plugin = (await ctx.jiti.import(pluginPath, { default: true })) as MiokiPlugin

                  if (plugin.name !== target) {
                    const tip = `[插件目录名称: ${target}] 和插件代码中设置的 [name: ${plugin.name}] 不一致，可能导致重载异常，请修改后重启。`
                    ctx.logger.warn(tip)
                    ctx.noticeMainOwner(tip)
                  }

                  await enablePlugin(ctx.bots, plugin)
                } catch (err: any) {
                  await e.reply(`插件 ${target} 启用失败：${err?.message || '未知错误'}`, true)
                  return
                }

                await ctx.updateBotConfig((c) => (c.plugins = [...ctx.botConfig.plugins, target]))

                await e.reply(`插件 ${target} 启用成功`, true)

                break
              }

              case '禁用': {
                if (!target) {
                  await e.reply('请指定插件 ID', true)
                  return
                }

                const plugin = runtimePlugins.get(target)

                if (!plugin) {
                  await e.reply(`插件 ${target} 不存在`, true)
                  return
                }

                try {
                  await plugin.disable()
                } catch (err: any) {
                  await e.reply(err?.message, true)
                  break
                }

                await ctx.updateBotConfig((c) => (c.plugins = ctx.botConfig.plugins.filter((name) => name !== target)))

                ctx.logger.info(`禁用插件 => ${target}`)

                await e.reply(`插件 ${target} 已禁用`, true)

                break
              }

              case '重载': {
                if (!target) {
                  await e.reply('请指定插件 ID', true)
                  return
                }

                let isOff = false
                const plugin = runtimePlugins.get(target)

                try {
                  if (plugin) {
                    await plugin.disable()
                  }

                  const pluginPath = ctx.path.join(getAbsPluginDir(), target)

                  if (!ctx.fs.existsSync(pluginPath)) {
                    await e.reply(`插件 ${target} 不存在`, true)
                    return
                  }

                  if (!plugin) {
                    isOff = true
                    // await e.reply(`插件 ${target} 还未启用，尝试直接启用...`, true)
                  }

                  const importedPlugin = (await ctx.jiti.import(pluginPath, { default: true })) as MiokiPlugin

                  if (importedPlugin.name !== target) {
                    const tip = `插件目录名称: ${target} 和插件代码中设置的 name: ${importedPlugin.name} 不一致，可能导致重载异常，请修改后重启。`
                    ctx.logger.warn(tip)
                    ctx.noticeMainOwner(tip)
                  }

                  await enablePlugin(ctx.bots, importedPlugin)
                } catch (err: any) {
                  await e.reply(err?.message, true)
                  await ctx.updateBotConfig((c) => (c.plugins = c.plugins.filter((name) => name !== target)))
                  break
                }

                await ctx.updateBotConfig((c) => (c.plugins = [...c.plugins, target]))

                await e.reply(`插件 ${target} 已${isOff ? '直接启用' : '重载'}`, true)

                break
              }
              default: {
                await e.reply(
                  ctx
                    .dedent(
                      `
                  〓 🧩 mioki 插件 〓
                  ${displayPrefix}插件 列表
                  ${displayPrefix}插件 启用 <插件 ID>
                  ${displayPrefix}插件 禁用 <插件 ID>
                  ${displayPrefix}插件 重载 <插件 ID>
                  `,
                    )
                    .trim(),
                )
                break
              }
            }
            break
          }

          case '设置': {
            switch (subCmd) {
              case '详情': {
                await e.reply(
                  ctx
                    .dedent(
                      `
                  〓 设置详情 〓
                  主人: ${ctx.botConfig.owners.join(', ')}
                  管理: ${ctx.botConfig.admins.join(', ').trim()}
                  启用插件: ${ctx.botConfig.plugins.join(', ').trim()}
                  `,
                    )
                    .trim(),
                )
                break
              }

              case '加主人':
              case '添加主人': {
                const inputUid = Number.parseInt(target)
                const uid = Number.isNaN(inputUid) ? +(e.message.find((e) => e.type === 'at')?.qq || 0) : inputUid || 0

                if (!uid || Number.isNaN(uid)) {
                  await e.reply('请指定主人 QQ/AT', true)
                  return
                }

                if (ctx.botConfig.owners.includes(uid)) {
                  await e.reply(`主人 ${uid} 已存在`, true)
                  return
                }

                await ctx.updateBotConfig((c) => (c.owners = [...c.owners, uid]))

                await e.reply(`已添加主人 ${uid}`, true)

                break
              }

              case '删主人':
              case '删除主人': {
                const inputUid = Number.parseInt(target)
                const uid = Number.isNaN(inputUid) ? +(e.message.find((e) => e.type === 'at')?.qq || 0) : inputUid || 0

                if (!uid || Number.isNaN(uid)) {
                  await e.reply('请指定主人 QQ/AT', true)
                  return
                }

                if (uid === ctx.botConfig.admins[0]) {
                  await e.reply('不能删除第一主人', true)
                  return
                }

                const idx = ctx.botConfig.owners.indexOf(uid)

                if (idx === -1) {
                  await e.reply(`主人 ${uid} 不存在`, true)
                  return
                }

                await ctx.updateBotConfig((c) => c.owners.splice(idx, 1))

                await e.reply(`已删除主人 ${uid}`, true)

                break
              }
              case '加管理':
              case '添加管理': {
                const inputUid = Number.parseInt(target)
                const uid = Number.isNaN(inputUid) ? +(e.message.find((e) => e.type === 'at')?.qq || 0) : inputUid || 0

                if (!uid || Number.isNaN(uid)) {
                  await e.reply('请指定管理 QQ/AT', true)
                  return
                }

                if (ctx.botConfig.admins.includes(uid)) {
                  await e.reply(`管理 ${uid} 已存在`, true)
                  return
                }

                await ctx.updateBotConfig((c) => (c.admins = [...c.admins, uid]))

                await e.reply(`已添加管理 ${uid}`, true)

                break
              }
              case '删管理':
              case '删除管理': {
                const inputUid = Number.parseInt(target)
                const uid = Number.isNaN(inputUid) ? +(e.message.find((e) => e.type === 'at')?.qq || 0) : inputUid || 0

                if (!uid || Number.isNaN(uid)) {
                  await e.reply('请指定管理 QQ/AT', true)
                  return
                }

                const idx = ctx.botConfig.admins.indexOf(uid)

                if (idx === -1) {
                  await e.reply(`管理 ${uid} 不存在`, true)
                  return
                }

                await ctx.updateBotConfig((c) => c.admins.splice(idx, 1))

                await e.reply(`已删除管理 ${uid}`, true)

                break
              }
              default: {
                await e.reply(
                  ctx
                    .dedent(
                      `
                  〓 ⚙️ mioki 设置 〓
                  ${displayPrefix}设置 详情
                  ${displayPrefix}设置 [加/删]主人 <QQ/AT>
                  ${displayPrefix}设置 [加/删]管理 <QQ/AT>
                  `,
                    )
                    .trim(),
                )
                break
              }
            }
            break
          }

          case '退出': {
            await e.reply('またね～', true)
            ctx.logger.info('接收到退出指令，即将退出... 如需自动重启，请使用 pm2 部署。')
            process.exit(0)
          }
        }
      }, e),
    )
  },
})

export default core
