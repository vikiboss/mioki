import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import { colors } from 'consola/utils'
import { createConsola, LogLevels } from 'consola/core'
import { BOT_CWD, readMiokiConfig, updateMiokiConfig } from '../config'

import type { Logger, LogLevel } from './types'
import type { ConsolaInstance } from 'consola/core'

const LEVEL_MAP: Readonly<Record<number, { name: string; color: 'red' | 'yellow' | 'white' | 'green' | 'blue' | 'gray' }>> = {
  0: { name: 'ERROR', color: 'red' },
  1: { name: 'WARN', color: 'yellow' },
  2: { name: 'LOG', color: 'white' },
  3: { name: 'INFO', color: 'green' },
  4: { name: 'DEBUG', color: 'blue' },
  5: { name: 'TRACE', color: 'gray' },
}

let cachedRoot: ConsolaInstance | null = null
let cachedRootLevel: LogLevel = 'info'

const resolveRoot = (): ConsolaInstance => {
  if (cachedRoot) return cachedRoot
  let level: LogLevel = 'info'
  try {
    level = readMiokiConfig().log_level ?? 'info'
  } catch {
    level = 'info'
  }
  cachedRootLevel = level
  cachedRoot = createConsola({
    level: LogLevels[level] ?? LogLevels.info,
    defaults: { tag: 'mioki' },
    formatOptions: { colors: true, compact: true, date: true },
  })
  return cachedRoot
}

const getLogFile = (): string => {
  const cwd = BOT_CWD.value
  const dir = path.join(cwd, 'logs')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return path.join(dir, `${stamp}.log`)
}

const ensureFile = (file: string): void => {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '')
  }
}

const renderMessage = (args: unknown[]): string =>
  args
    .map((arg) => (typeof arg === 'string' ? arg : util.inspect(arg, { colors: false, depth: 4 })))
    .join(' ')

const renderColored = (level: number, tag: string | undefined, args: unknown[]): string => {
  const time = colors.gray(`[${new Date().toLocaleTimeString('zh-CN')}]`)
  const meta = LEVEL_MAP[level] ?? LEVEL_MAP[3]
  const levelText = colors.bold(colors[meta.color](meta.name))
  const tagText = tag ? colors.dim(`[${tag}]`) : ''
  const message = renderMessage(args)
  return `${time} ${levelText} ${tagText} ${message}`
}

const writeFile = (level: number, tag: string | undefined, args: unknown[], file: string): void => {
  try {
    ensureFile(file)
    const iso = new Date().toISOString()
    const meta = LEVEL_MAP[level] ?? LEVEL_MAP[3]
    const prefix = `[${iso}] [${meta.name}]${tag ? ` [${tag}]` : ''}`
    fs.appendFileSync(file, `${prefix} ${renderMessage(args)}\n`)
  } catch {
    // best-effort logging, swallow file errors
  }
}

const dispatch = (
  level: number,
  tag: string | undefined,
  args: unknown[],
  file: string,
): void => {
  writeFile(level, tag, args, file)
  const line = renderColored(level, tag, args)
  if (level === LogLevels.error) console.error(line)
  else if (level === LogLevels.warn) console.warn(line)
  else if (level === LogLevels.log) console.log(line)
  else if (level === LogLevels.info) console.info(line)
  else console.debug(line)
}

class ScopedLogger implements Logger {
  readonly #parent: ConsolaInstance | null
  readonly #tag: string | undefined
  readonly #scope: Readonly<Record<string, unknown>>
  readonly #file: string
  readonly #threshold: number

  constructor(options: {
    parent: ConsolaInstance | null
    tag: string | undefined
    scope: Record<string, unknown>
    file: string
    threshold: number
  }) {
    this.#parent = options.parent
    this.#tag = options.tag
    this.#scope = options.scope
    this.#file = options.file
    this.#threshold = options.threshold
  }

  get level(): LogLevel {
    if (!this.#parent) return 'info'
    const lv = this.#parent.level
    for (const [k, v] of Object.entries(LogLevels)) {
      if (v === lv) return k as LogLevel
    }
    return 'info'
  }

  #tagWithScope(): string {
    const tags = [this.#tag, ...Object.entries(this.#scope).map(([k, v]) => `${k}=${String(v)}`)].filter(Boolean)
    return tags.join(':')
  }

  #log(level: number, args: unknown[]): void {
    if (level > this.#threshold) return
    if (this.#parent && level > this.#parent.level) return
    dispatch(level, this.#tagWithScope(), args, this.#file)
  }

  error(...args: unknown[]): void {
    this.#log(LogLevels.error, args)
  }

  warn(...args: unknown[]): void {
    this.#log(LogLevels.warn, args)
  }

  log(...args: unknown[]): void {
    this.#log(LogLevels.log, args)
  }

  info(...args: unknown[]): void {
    this.#log(LogLevels.info, args)
  }

  debug(...args: unknown[]): void {
    this.#log(LogLevels.debug, args)
  }

  trace(...args: unknown[]): void {
    this.#log(LogLevels.trace, args)
  }

  withTag(tag: string): Logger {
    const merged = this.#tag ? `${this.#tag}:${tag}` : tag
    return new ScopedLogger({
      parent: this.#parent,
      tag: merged,
      scope: this.#scope,
      file: this.#file,
      threshold: this.#threshold,
    })
  }

  child(scope: Record<string, unknown>): Logger {
    return new ScopedLogger({
      parent: this.#parent,
      tag: this.#tag,
      scope: { ...this.#scope, ...scope },
      file: this.#file,
      threshold: this.#threshold,
    })
  }
}

export const createMiokiLogger = (options: { tag?: string; level?: LogLevel; scope?: Record<string, unknown> } = {}): Logger => {
  const root = resolveRoot()
  const file = getLogFile()
  const threshold = LogLevels[(options.level ?? cachedRootLevel) as LogLevel] ?? LogLevels.info
  return new ScopedLogger({
    parent: root,
    tag: options.tag,
    scope: options.scope ?? {},
    file,
    threshold,
  })
}

export const rootLogger: Logger = createMiokiLogger()

export const applyLogLevel = (level: LogLevel): void => {
  cachedRootLevel = level
  if (cachedRoot) {
    cachedRoot.level = LogLevels[level] ?? LogLevels.info
  }
  try {
    updateMiokiConfig((config) => {
      config.log_level = level
    }).then()
  } catch {
    // config update may fail in non-mutating contexts; ignore.
  }
}

export type { Logger, LogLevel }