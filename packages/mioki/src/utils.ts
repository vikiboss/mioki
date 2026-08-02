import crypto from 'node:crypto'
import { BOT_CWD } from './config'
import { createJiti } from 'jiti'
import mriLib from 'mri'
import { Low } from 'lowdb'
import { DataFile } from 'lowdb/node'
import { string2argv } from 'string2argv'

import type { Message, MessageSegment } from './adapter'
import type { BinaryLike, BinaryToTextEncoding } from 'node:crypto'
import type { ConsolaInstance } from 'consola/core'
import type { Jiti } from 'jiti'

export { default as prettyMs } from 'pretty-ms'
export { filesize } from 'filesize'
export { string2argv } from 'string2argv'
export { default as fs } from 'node:fs'
export { default as path } from 'node:path'
export { default as dayjs } from 'dayjs'
export { default as dedent } from 'dedent'
export { mriLib as mri }
export { colors, stripAnsi, box, colorize } from 'consola/utils'

export const ChromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0'

export type Noop = () => void
export type AnyFunc = (...args: any[]) => any
export type PureObject<T = unknown> = Record<PropertyKey, T>
export type Arrayable<T> = T | T[]
export type Awaitable<T> = T | Promise<T>
export type Gettable<T> = T | (() => T)

export interface HasMessage {
  readonly message: Message
}

export const jiti: Jiti = createJiti(BOT_CWD.value, {
    extensions: ['.ts', '.js', '.cts', '.cjs', '.mts', '.mjs', '.tsx', '.jsx', '.json'],
    cache: false,
    fsCache: false,
    moduleCache: false,
    requireCache: false,
    sourceMaps: false,
    interopDefault: true,
    jsx: { importSource: 'react', runtime: 'automatic' },
  })

export interface CreateCmdOptions {
  prefix?: string
  onPrefix?(): void
}

export const createCmd = (
  cmdStr: string,
  options: CreateCmdOptions = {},
): { cmd: string | undefined; params: string[]; options: Record<string, unknown> } => {
  const { prefix = '', onPrefix = () => undefined } = options
  const { _, ...cmdOptions } = mriLib(string2argv(cmdStr))
  const [cmd, ...params] = _ as string[]
  if (prefix) {
    if (cmd !== prefix) return { cmd: undefined, params: [], options: cmdOptions }
    if (params.length === 0) onPrefix()
    const prefixedCmd = params.shift()
    return { cmd: prefixedCmd, params, options: cmdOptions }
  }
  return { cmd, params, options: cmdOptions }
}

export const createDB = async <T extends object = object>(
  filename: string,
  options: { defaultData?: T; compress?: boolean } = {},
): Promise<Low<T>> => {
  const { defaultData = {} as T, compress = false } = options
  const database = new Low<T>(
    new DataFile<T>(filename, {
      parse: JSON.parse,
      stringify: (data: T) => JSON.stringify(data, null, compress ? 0 : 2),
    }),
    defaultData,
  )
  await database.read()
  return database
}

export const createStore = async <T extends object = object>(
  defaultData: T,
  options: {
    __dirname?: string
    importMeta?: ImportMeta
    compress?: boolean
    filename?: string
  } = {},
): Promise<Low<T>> => {
  const { compress = false, __dirname, importMeta: meta, filename = 'data.json' } = options
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const dirname = __dirname || meta?.dirname || (meta?.url ? path.dirname(fileURLToPath(meta.url)) : '')
  if (!dirname) throw new Error('createStore: options.__dirname or options.meta must be provided')
  const filePath = path.join(dirname, filename)
  const database = new Low<T>(
    new DataFile<T>(filePath, {
      parse: JSON.parse,
      stringify: (data: T) => JSON.stringify(data, null, compress ? 0 : 2),
    }),
    defaultData,
  )
  await database.read()
  await database.write()
  return database
}

export const md5 = (text: BinaryLike, encoding: BinaryToTextEncoding | 'buffer' = 'hex'): string | Buffer => {
  const hash = crypto.createHash('md5').update(text)
  if (encoding === 'buffer') return hash.digest()
  return hash.digest(encoding)
}

export const unique = <T>(array: T[]): T[] => Array.from(new Set(array))

export const toArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export const localeDate = (ts: number | string | Date = Date.now(), options: { locale?: string; timeZone?: string } = {}): string => {
  const { locale = 'zh-CN', timeZone = 'Asia/Shanghai' } = options
  const today = ts instanceof Date ? ts : new Date(ts)
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(today)
}

export const localeTime = (
  ts: number | string | Date = Date.now(),
  options: { locale?: string; timeZone?: string; seconds?: boolean } = {},
): string => {
  const { locale = 'zh-CN', timeZone = 'Asia/Shanghai', seconds = true } = options
  const now = ts instanceof Date ? ts : new Date(ts)
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    second: seconds ? '2-digit' : undefined,
    timeZone,
  }).format(now)
}

export const randomInt = (min: number, max: number, ...hashArgs: unknown[]): number => {
  if (min > max) throw new Error('min must be less than or equal to max')
  if (hashArgs.length === 0) return Math.floor(Math.random() * (max - min + 1)) + min
  const sortedArgs = hashArgs.slice().sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return JSON.stringify(a).localeCompare(JSON.stringify(b))
  })
  const hash = md5(JSON.stringify(sortedArgs))
  const hashText = typeof hash === 'string' ? hash : hash.toString('hex')
  const hashValue = Number.parseInt(hashText.slice(0, 8), 16)
  const range = max - min + 1
  return (((hashValue % range) + range) % range) + min
}

export const randomItem = <T>(array: readonly T[], ...hashArgs: unknown[]): T => {
  if (!Array.isArray(array) || !array.length) throw new Error('randomItem: 参数必须是数组，且不能为空')
  return array[randomInt(0, array.length - 1, ...hashArgs)]
}

export const randomItems = <T>(array: readonly T[], count: number, ...hashArgs: unknown[]): T[] => {
  if (!Array.isArray(array) || !array.length) throw new Error('randomItems: 参数必须是数组，且不能为空')
  if (count < 0) throw new Error('randomItems: count 必须为非负整数')
  if (count === 0) return []
  if (count > array.length) throw new Error(`randomItems: 要选择的数量 (${count}) 超过了数组长度 (${array.length})`)
  if (count === array.length) return [...array]
  const indices = Array.from({ length: array.length }, (_, i) => i)
  const selected: number[] = []
  for (let i = 0; i < count; i++) {
    const remainingCount = indices.length - i
    const randomIdx = randomInt(0, remainingCount - 1, ...hashArgs, `select_${i}`)
    selected.push(indices[randomIdx])
    const lastIdx = indices.length - 1 - i
    ;[indices[randomIdx], indices[lastIdx]] = [indices[lastIdx], indices[randomIdx]]
  }
  const isString = (v: unknown): v is string => typeof v === 'string'
  const hasString = array.some(isString)
  const items = selected.map((idx) => array[idx])
  return hasString ? items.sort((p, n) => (isString(p) && isString(n) ? p.localeCompare(n) : 0)) : items
}

export const randomId = (): string => Math.random().toString(16).slice(2, 8).toUpperCase()

export const uuid = (): string => {
  const rand = (length = 4): string => Math.random().toString(16).substring(2, length + 2)
  return `${rand(8)}-${rand(4)}-${rand(4)}-${rand(4)}-${rand(12)}`
}

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

export const noNullish = <T>(val: T | null | undefined): val is T => val !== null && val !== undefined

export const isDefined = <T = unknown>(val?: T): val is T => typeof val !== 'undefined'

export const isFunction = <T extends AnyFunc = AnyFunc>(val: unknown): val is T => typeof val === 'function'

export const isNumber = (val: unknown): val is number => typeof val === 'number'

export const isBoolean = (val: unknown): val is boolean => typeof val === 'boolean'

export const isString = (val: unknown): val is string => typeof val === 'string'

export const isObject = (val: unknown): val is Record<string, unknown> =>
  Object.prototype.toString.call(val) === '[object Object]'

export const localNum = (num: number, locale = 'zh-CN'): string => num.toLocaleString(locale)

export const base64Encode = (str: string | number | Buffer): string => Buffer.from(str.toString()).toString('base64')

export const base64Decode = (str: string, type: 'buffer' | BufferEncoding = 'utf8'): string | Buffer => {
  if (type === 'buffer') return Buffer.from(str, 'base64')
  return Buffer.from(str, 'base64').toString(type)
}

export const qs = (obj: Record<number | string, unknown>): string => new URLSearchParams(obj as Record<string, string>).toString()

export const stringifyError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    const e = error as { constructor?: { name?: string }; message?: string; stack?: string }
    const errorType = e.constructor?.name ?? '未知错误'
    const errorMessage = e.message ?? '[无报错信息]'
    if (e.stack) return `${errorType}: ${errorMessage}\n${e.stack}`
    return `${errorType}: ${errorMessage}`
  }
  return String(error)
}

export const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}天${hours % 24}小时`
  if (hours > 0) return `${hours}小时${minutes % 60}分钟`
  if (minutes > 0) return `${minutes}分钟${seconds % 60}秒`
  return `${seconds}秒`
}

export const getTerminalInput = (inputTip = '请输入'): Promise<string> =>
  new Promise((resolve) => {
    if (inputTip) console.log(inputTip)
    const getInput = (): void => {
      process.stdin.once('data', (e) => {
        const input = e.toString().trim()
        if (input) {
          resolve(input)
          return
        }
        getInput()
      })
    }
    getInput()
  })

export const getGTk = (pskey: string): number => {
  let gkt = 5381
  for (let i = 0, len = pskey.length; i < len; ++i) {
    gkt += (gkt << 5) + pskey.charCodeAt(i)
  }
  return gkt & 0x7fffffff
}

export type MatchHandler<T extends HasMessage> = (matches: RegExpMatchArray, event: T) => unknown | Promise<unknown>

export type MatchValue = string | number | boolean | Message | MessageSegment | readonly (string | MessageSegment)[]

export const match = async <T extends HasMessage>(
  event: T,
  pattern: Record<string, MatchHandler<T> | MatchValue>,
  quote: boolean = true,
): Promise<{ message_id: string } | null> => {
  const inputText = event.message.text()
  for (const [key, value] of Object.entries(pattern)) {
    let isMatched = false
    let matches: RegExpMatchArray | null = null
    const isRegExp = key.startsWith('/') && key.endsWith('/')
    const hasWildcard = key.includes('*')
    if (isRegExp) {
      try {
        const regex = new RegExp(key.slice(1, -1))
        matches = inputText.match(regex)
        if (matches) isMatched = true
      } catch (err) {
        throw new Error(`无效的正则表达式: ${key}`, { cause: err })
      }
    } else if (hasWildcard) {
      const regex = new RegExp(`^${key.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`)
      matches = inputText.match(regex)
      if (matches) isMatched = true
    } else if (key === inputText) {
      isMatched = true
    }
    if (!isMatched) continue
    const result = typeof value === 'function' ? await value(matches as RegExpMatchArray, event) : value
    if (result) {
      const reply = (event as unknown as { reply?: (content: unknown, quote?: boolean) => Promise<{ message_id: string }> }).reply
      if (reply) return await reply(result, quote)
    }
  }
  return null
}

export const text = (source: HasMessage | Message, options: { trim?: boolean | 'whole' | 'each' } = {}): string => {
  const { trim = true } = options
  const message = getMessage(source)
  const texts = message
    .filterByType('text')
    .map((seg) => (typeof seg.data.text === 'string' ? seg.data.text : ''))
  if (trim === 'whole') return texts.join('').trim()
  if (trim === 'each') return texts.map((t) => t.trim()).join('')
  if (trim === true) return texts.map((t) => t.trim()).join('')
  return texts.join('')
}

export const find = <T extends Message['length'] extends 0 ? never : Message[number]>(
  source: HasMessage | Message,
  type: string,
): T | undefined => {
  const message = getMessage(source)
  return message.find((seg) => seg.type === type) as T | undefined
}

export const filter = <T extends Message['length'] extends 0 ? never : Message[number]>(
  source: HasMessage | Message,
  type: string,
): T[] => {
  const message = getMessage(source)
  return message.filter((seg) => seg.type === type) as T[]
}

export { type ConsolaInstance }

const getMessage = (source: HasMessage | Message): Message => {
  if (Array.isArray(source) && typeof (source as Message).text === 'function') return source as Message
  return (source as HasMessage).message
}
