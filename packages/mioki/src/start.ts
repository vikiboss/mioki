import { createRuntime, setBuiltinPlugins } from './runtime/runtime'
import { createMiokiLogger, rootLogger } from './logger'
import { setWritableConfig, botConfig, setBotCwd } from './config'
import { version } from '../package.json'
import { getBuiltinPlugins } from './runtime/runtime'
import { unique } from './utils'
import { BUILTIN_PLUGINS } from './builtins'

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

  const runtime = createRuntime({
    cwd,
    logger,
    builtinPlugins: getBuiltinPlugins(),
  })

  logger.info('=' .repeat(40))
  logger.info(`欢迎使用 mioki v${version}`)
  logger.info('=' .repeat(40))
  logger.info(`工作目录: ${cwd}`)
  logger.info(`插件列表: ${unique(botConfig.plugins).join(', ') || '(空)'}`)
  logger.info(`适配器: ${Object.keys(botConfig.adapters ?? {}).join(', ') || '(无, zero-adapter 模式)'}`)
  logger.info('=' .repeat(40))

  await runtime.start()
  if (botConfig.online_push && botConfig.owners[0]) {
    const bot = runtime.bots[0]
    if (bot) {
      try {
        await bot.sendMessage(
          { type: 'private', user_id: botConfig.owners[0] } as never,
          `✅ mioki v${version} 已就绪`,
        )
      } catch (err) {
        logger.warn('发送就绪通知失败', err)
      }
    }
  }
  return {
    stop: (reason) => runtime.shutdown(reason),
  }
}
