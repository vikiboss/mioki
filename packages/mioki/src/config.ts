import fs from 'node:fs'
import path from 'node:path'
import { logger } from './logger'
import { isNumber, unique, jiti } from './utils'

import type { LogLevel } from 'napcat-sdk'

/**
 * NapCat 实例配置
 */
export interface NapCatInstanceConfig {
  name?: string
  protocol?: 'ws' | 'wss'
  port?: number
  host?: string
  token?: string
}

export type NapCatConfig = NapCatInstanceConfig[]

function isSingleNapCatConfig(config: NapCatInstanceConfig | NapCatInstanceConfig[]): config is NapCatInstanceConfig {
  return !Array.isArray(config)
}

export function normalizeNapCatConfig(config: NapCatInstanceConfig | NapCatInstanceConfig[]): NapCatConfig {
  if (isSingleNapCatConfig(config)) {
    return [config] //向后兼容
  }
  return config
}

/**
 * mioki 配置
 */
export interface MiokiConfig {
  prefix?: string
  owners: number[]
  admins: number[]
  plugins: string[]
  error_push?: boolean
  online_push?: boolean
  log_level?: LogLevel
  plugins_dir?: string
  status_permission?: 'all' | 'admin-only'
  napcat: NapCatConfig // 为 mioki 添加多实例连接支持
}

/**
 * 机器人根目录
 */
export const BOT_CWD: { value: string } = {
  value: process.cwd(),
}

export let loadedConfigPath: string | null = null

const DEFAULT_MIOKI_CONFIG: MiokiConfig = {
  owners: [],
  admins: [],
  plugins: [],
  napcat: [],
}

export function readPackageJson(): { mioki?: MiokiConfig } & Record<string, any> {
  const pkgPath = path.join(BOT_CWD.value, 'package.json')
  if (!fs.existsSync(pkgPath)) return {}
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) || {}
}

export function writePackageJson(pkg: Record<string, any>): void {
  fs.writeFileSync(path.join(BOT_CWD.value, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8')
}

export function loadConfig(cwd: string = BOT_CWD.value, configFile?: string): MiokiConfig | null {
  loadedConfigPath = null
  if (configFile) {
    const configPath = path.resolve(cwd, configFile)
    if (fs.existsSync(configPath)) {
      loadedConfigPath = configPath
      if (configFile.endsWith('.json')) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      }
      return jiti(configPath)
    }
    logger.warn(`指定的配置文件 ${configPath} 不存在`)
  }

  const pkg = readPackageJson()
  if (pkg.mioki) {
    loadedConfigPath = path.join(cwd, 'package.json')
    return pkg.mioki
  }

  return null
}

export function readMiokiConfig(): MiokiConfig {
  const config = loadConfig() || DEFAULT_MIOKI_CONFIG

  if (!config.napcat) {
    config.napcat = []
  }

  return {
    ...DEFAULT_MIOKI_CONFIG,
    ...config,
    napcat: normalizeNapCatConfig(config.napcat || []),
  }
}

export function initConfig(options: { configFile?: string; cwd?: string }) {
  const { configFile, cwd } = options

  if (cwd && cwd !== BOT_CWD.value) {
    updateBotCWD(cwd)
  }

  const loaded = loadConfig(BOT_CWD.value, configFile)

  const finalConfig = {
    ...DEFAULT_MIOKI_CONFIG,
    ...(loaded || {}),
  }

  finalConfig.napcat = normalizeNapCatConfig(finalConfig.napcat || [])

  Object.assign(botConfig, finalConfig)

  botConfig.plugins = unique(botConfig.plugins).toSorted((prev, next) => prev.localeCompare(next))
  botConfig.admins = unique(botConfig.admins).toSorted((prev, next) => prev - next)
}

/**
 * `mioki` 框架相关配置
 */
export const botConfig: MiokiConfig = readMiokiConfig()

/**
 * 更新 `mioki` 配置，同时同步更新本地配置文件
 */
export const updateBotConfig = async (draftFn: (config: MiokiConfig) => any): Promise<void> => {
  await draftFn(botConfig)

  botConfig.plugins = unique(botConfig.plugins).toSorted((prev, next) => prev.localeCompare(next))
  botConfig.admins = unique(botConfig.admins).toSorted((prev, next) => prev - next)

  if (loadedConfigPath && loadedConfigPath.endsWith('package.json')) {
    const pkg = readPackageJson()
    pkg.mioki = structuredClone(botConfig)
    writePackageJson(pkg)
    logger.info(`检测到配置变动，已同步至 package.json 文件`)
  } else if (loadedConfigPath && loadedConfigPath.endsWith('.json')) {
    fs.writeFileSync(loadedConfigPath, JSON.stringify(botConfig, null, 2), 'utf-8')
    logger.info(`检测到配置变动，已同步至 ${path.basename(loadedConfigPath)} 文件`)
  } else if (!loadedConfigPath) {
    // No config file found initially, default to creating/updating package.json
    const pkg = readPackageJson()
    pkg.mioki = structuredClone(botConfig)
    writePackageJson(pkg)
    logger.info(`检测到配置变动，已同步至 package.json 文件`)
  } else {
    logger.warn(`配置文件 ${loadedConfigPath} 不支持自动写入，请手动更新配置`)
  }
}

/**
 * 更新机器人根目录
 */
export const updateBotCWD = (root: string): void => {
  BOT_CWD.value = root
  logger.info(`机器人根目录已设置为 ${root}`)
}

/**
 * 是否是主人
 */
export const isOwner = (id: number | { sender: { user_id: number } } | { user_id: number }): boolean => {
  const owners = botConfig.owners

  return isNumber(id)
    ? owners.includes(id)
    : 'sender' in id
      ? owners.includes(id.sender.user_id)
      : owners.includes(id.user_id)
}

/**
 * 是否是管理员，注意: 主人不是管理员
 */
export const isAdmin = (id: number | { sender: { user_id: number } } | { user_id: number }): boolean => {
  const admins = botConfig.admins

  return isNumber(id)
    ? admins.includes(id)
    : 'sender' in id
      ? admins.includes(id.sender.user_id)
      : admins.includes(id.user_id)
}

/**
 * 是否是主人或管理员
 */
export const isOwnerOrAdmin = (id: number | { sender: { user_id: number } } | { user_id: number }): boolean => {
  return isOwner(id) || isAdmin(id)
}

/**
 * 是否有权限，即：主人或管理员
 */
export const hasRight = (id: number | { sender: { user_id: number } } | { user_id: number }): boolean => {
  return isOwnerOrAdmin(id)
}

/**
 * 是否在 PM2 中运行
 */
export const isInPm2: boolean = Boolean('pm_id' in process.env || 'PM2_USAGE' in process.env)
