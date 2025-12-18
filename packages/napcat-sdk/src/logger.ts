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
  error: console.error.bind(console, '[ERROR]'),
  warn: console.warn.bind(console, '[WARN]'),
  info: console.info.bind(console, '[INFO]'),
  debug: console.debug.bind(console, '[DEBUG]'),
  trace: console.trace.bind(console, '[TRACE]'),
}
