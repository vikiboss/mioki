export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export type Logger = Record<LogLevel, (...args: unknown[]) => void>

const LOG_LEVELS: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

const LOG_LEVEL_KEYS = Object.keys(LOG_LEVELS) as LogLevel[]

const noop = () => {}

export const ABSTRACT_LOGGER: Logger = Object.fromEntries(LOG_LEVEL_KEYS.map((level) => [level, noop])) as Logger

export const CONSOLE_LOGGER: Logger = Object.fromEntries(
  LOG_LEVEL_KEYS.map((level) => [
    level,
    (...args: unknown[]) => {
      console[level === 'fatal' ? 'error' : level](...args)
    },
  ]),
) as Logger
