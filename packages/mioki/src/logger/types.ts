export type LogLevel = 'silent' | 'error' | 'warn' | 'log' | 'info' | 'debug' | 'trace'

export interface Logger {
  readonly level: LogLevel
  error(...args: unknown[]): void
  warn(...args: unknown[]): void
  log(...args: unknown[]): void
  info(...args: unknown[]): void
  debug(...args: unknown[]): void
  trace(...args: unknown[]): void
  withTag(tag: string): Logger
  child(scope: Record<string, unknown>): Logger
}

export const LOG_LEVELS: readonly LogLevel[] = ['silent', 'error', 'warn', 'log', 'info', 'debug', 'trace']

export const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  silent: -1,
  error: 0,
  warn: 1,
  log: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

export const LOG_LEVEL_NUMERIC: Readonly<Record<LogLevel, number>> = {
  silent: -1,
  error: 0,
  warn: 1,
  log: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

export const isLogLevel = (value: unknown): value is LogLevel =>
  typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value)

export class LoggerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoggerError'
  }
}