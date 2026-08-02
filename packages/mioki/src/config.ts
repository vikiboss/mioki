import fs from 'node:fs'
import path from 'node:path'

import type { LogLevel } from './logger'

export interface MiokiConfig {
  prefix?: string
  owners: string[]
  admins: string[]
  plugins: string[]
  plugins_dir?: string
  log_level?: LogLevel
  online_push?: boolean
  error_push?: boolean
  status_permission?: 'all' | 'admin-only'
  adapters?: Record<string, unknown>
  napcat?: unknown
}

export interface BotConfigJson {
  mioki?: Record<string, unknown>
  [key: string]: unknown
}

export const BOT_CWD: { value: string } = { value: process.cwd() }

export const setBotCwd = (root: string): void => {
  BOT_CWD.value = path.resolve(root)
}

export const readPackageJson = (): BotConfigJson => {
  const file = path.join(BOT_CWD.value, 'package.json')
  if (!fs.existsSync(file)) {
    throw new Error(`无法在 ${BOT_CWD.value} 下找到 package.json 文件，请确认当前目录是否为机器人根目录`)
  }
  const raw = fs.readFileSync(file, 'utf-8')
  try {
    return JSON.parse(raw) as BotConfigJson
  } catch {
    throw new Error(`package.json 解析失败，请检查 JSON 格式`)
  }
}

export const writePackageJson = (pkg: BotConfigJson): void => {
  const file = path.join(BOT_CWD.value, 'package.json')
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2), 'utf-8')
}

export const normalizeOwners = (input: unknown): string[] => {
  if (!Array.isArray(input)) return []
  return input.map((v) => String(v) as string)
}

export const normalizeAdmins = (input: unknown): string[] => {
  if (!Array.isArray(input)) return []
  return input.map((v) => String(v) as string)
}

export const normalizePlugins = (input: unknown): string[] => {
  if (!Array.isArray(input)) return []
  return input.map((v) => String(v) as string)
}

export const readMiokiConfig = (): MiokiConfig => {
  const raw = readPackageJson()
  const rawMioki = raw.mioki
  if (!rawMioki || typeof rawMioki !== 'object') {
    throw new Error(`无法在 package.json 中找到 mioki 配置，请确认 package.json 文件中是否包含 mioki 字段`)
  }
  const config: MiokiConfig = {
    ...(rawMioki as Partial<MiokiConfig>),
    owners: normalizeOwners((rawMioki as { owners?: unknown }).owners),
    admins: normalizeAdmins((rawMioki as { admins?: unknown }).admins),
    plugins: normalizePlugins((rawMioki as { plugins?: unknown }).plugins),
    prefix: typeof (rawMioki as { prefix?: unknown }).prefix === 'string' ? ((rawMioki as { prefix: string }).prefix) : '#',
    plugins_dir: typeof (rawMioki as { plugins_dir?: unknown }).plugins_dir === 'string' ? ((rawMioki as { plugins_dir: string }).plugins_dir) : 'plugins',
  }
  if ((rawMioki as { log_level?: unknown }).log_level) {
    config.log_level = (rawMioki as { log_level: LogLevel }).log_level
  }
  if ((rawMioki as { status_permission?: unknown }).status_permission) {
    config.status_permission = (rawMioki as { status_permission: 'all' | 'admin-only' }).status_permission
  }
  config.online_push = Boolean((rawMioki as { online_push?: unknown }).online_push)
  config.error_push = Boolean((rawMioki as { error_push?: unknown }).error_push)
  if ((rawMioki as { adapters?: unknown }).adapters) {
    config.adapters = (rawMioki as { adapters: Record<string, unknown> }).adapters
  }
  return config
}

export interface RuntimeMiokiConfig extends MiokiConfig {}

const DEFAULT_CONFIG: RuntimeMiokiConfig = {
  owners: [],
  admins: [],
  plugins: [],
  plugins_dir: 'plugins',
  prefix: '#',
}

const loadInitialConfig = (): RuntimeMiokiConfig => {
  try {
    return readMiokiConfig()
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export let botConfig: RuntimeMiokiConfig = loadInitialConfig()

export const reloadMiokiConfig = (): RuntimeMiokiConfig => {
  botConfig = readMiokiConfig()
  return botConfig
}

let writable = false

export const setWritableConfig = (value: boolean): void => {
  writable = value
}

export const updateMiokiConfig = (draft: (config: RuntimeMiokiConfig) => void | Promise<void>): Promise<void> => {
  return Promise.resolve(draft(botConfig)).then(() => {
    if (!writable) return
    const pkg = readPackageJson()
    pkg.mioki = { ...(pkg.mioki as Record<string, unknown> | undefined), ...botConfig }
    writePackageJson(pkg)
  })
}

export const isOwner = (id: string): boolean => {
  const target = typeof id === 'string' ? id : id
  return botConfig.owners.includes(target as string)
}

export const isAdmin = (id: string): boolean => {
  const target = typeof id === 'string' ? id : id
  return botConfig.admins.includes(target as string)
}

export const isOwnerOrAdmin = (id: string): boolean => {
  return isOwner(id) || isAdmin(id)
}

export const hasRight = (id: string): boolean => isOwnerOrAdmin(id)
