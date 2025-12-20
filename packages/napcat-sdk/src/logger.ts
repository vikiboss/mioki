import { styleText } from 'node:util'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace'

export type Logger = Record<LogLevel, (...args: unknown[]) => void>

export const noop = (): void => {}

export const ABSTRACT_LOGGER: Logger = {
  error: noop,
  warn: noop,
  info: noop,
  debug: noop,
  trace: noop,
}

export const CONSOLE_LOGGER: Logger = {
  error: console.error.bind(console, styleText('redBright', '[ERROR]')),
  warn: console.warn.bind(console, styleText('yellowBright', '[WARN]')),
  info: console.info.bind(console, styleText('greenBright', '[INFO]')),
  debug: console.debug.bind(console, styleText('blueBright', '[DEBUG]')),
  trace: console.debug.bind(console, styleText('dim', '[TRACE]')),
}
