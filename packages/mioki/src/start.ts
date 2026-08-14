import path from 'node:path'
import { createRuntime, setBuiltinPlugins } from './runtime/runtime'
import { createMiokiLogger, rootLogger } from './logger'
import { setWritableConfig, botConfig, setBotCwd } from './config'
import { version } from '../package.json'
import { getBuiltinPlugins } from './runtime/runtime'
import { unique } from './utils'
import { BUILTIN_PLUGINS } from './builtins'
import { colors } from 'consola/utils'

import type { MiokiPlugin } from './plugin'
import type { Logger } from './logger'

export interface StartOptions {
  cwd?: string
  logger?: Logger
  builtinPlugins?: readonly MiokiPlugin[]
}

export const start = async (options: StartOptions = {}): Promise<{ stop: (reason?: string) => Promise<void> }> => {
  const cwd = options.cwd ?? process.cwd()
  setBotCwd(cwd)
  setWritableConfig(true)

  const builtinPlugins = options.builtinPlugins ?? BUILTIN_PLUGINS
  setBuiltinPlugins(builtinPlugins)
  const logger = options.logger ?? rootLogger

  process.title = `mioki v${version}`

  const runtime = createRuntime({
    cwd,
    logger,
    builtinPlugins: getBuiltinPlugins(),
  })

  const pluginDir = path.resolve(cwd, botConfig.plugins_dir ?? 'plugins')
  logger.info(colors.dim('='.repeat(40)))
  logger.info(`欢迎使用 ${colors.bold(colors.redBright('mioki'))} 💓 ${colors.bold(colors.cyan(`v${version}`))}`)
  logger.info(colors.yellow(colors.underline('一个基于 NapCat 的插件式 QQ 机器人框架')))
  logger.info(colors.cyan('轻量 * 跨平台 * 插件式 * 热重载 * 注重开发体验'))
  logger.info(colors.dim('='.repeat(40)))
  logger.info(colors.dim(colors.italic('作者: Viki <hi@viki.moe> (https://github.com/vikiboss)')))
  logger.info(colors.dim(colors.italic('仓库: https://github.com/vikiboss/mioki')))
  logger.info(colors.dim(colors.italic('文档: https://mioki.viki.moe')))
  logger.info(colors.dim('='.repeat(40)))
  logger.info(`${colors.dim('工作目录: ')}${colors.blue(cwd)}`)
  logger.info(`${colors.dim('插件目录: ')}${colors.blue(pluginDir)}`)
  logger.info(`${colors.dim('配置文件: ')}${colors.blue(path.resolve(cwd, 'package.json'))}`)
  logger.info(`${colors.dim('启用插件: ')}${colors.blue(unique(botConfig.plugins).join(', ') || '(空)')}`)
  logger.info(
    `${colors.dim('适配器: ')}${colors.blue(Object.keys(botConfig.adapters ?? {}).join(', ') || '(无, zero-adapter 模式)')}`,
  )
  logger.info(colors.dim('='.repeat(40)))

  await runtime.start()

  const bots = runtime.bots
  if (bots.length > 0) {
    logger.info(`成功连接 ${bots.length} 个实例: ${bots.map((b) => b.bot_id).join(', ')}`)
  }
  logger.info(colors.dim('='.repeat(40)))
  logger.info(
    `mioki v${version} 启动完成，向机器人发送「${colors.magentaBright(`${botConfig.prefix}帮助`)}」查看消息指令`,
  )

  if (botConfig.online_push && botConfig.owners[0]) {
    const bot = runtime.bots[0]
    if (bot) {
      try {
        await bot.sendMessage({ type: 'private', user_id: botConfig.owners[0] }, `✅ mioki v${version} 已就绪`)
      } catch (err) {
        logger.warn('发送就绪通知失败', err)
      }
    }
  }
  return {
    stop: (reason) => runtime.shutdown(reason),
  }
}
