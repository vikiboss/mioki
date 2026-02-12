import fs from 'node:fs'
import path from 'node:path'
import { logger } from './logger'
import { isNumber, unique } from './utils'

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

export function readPackageJson(): Record<'mioki' | (string & {}), any> {
  if (!fs.existsSync(path.join(BOT_CWD.value, 'package.json')))
    throw new Error(`无法在 ${BOT_CWD.value} 下找到 package.json 文件，请确认当前目录是否为机器人根目录`)

  return JSON.parse(fs.readFileSync(path.join(BOT_CWD.value, 'package.json'), 'utf-8')) || {}
}

export function writePackageJson(pkg: Record<string, any>): void {
  fs.writeFileSync(path.join(BOT_CWD.value, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8')
}

export function readMiokiConfig(): MiokiConfig {
  const config = readPackageJson().mioki

  if (!config) throw new Error(`无法在 package.json 中找到 mioki 配置，请确认 package.json 文件中是否包含 mioki 字段`)
  if (!config.napcat) throw new Error(`mioki 配置中缺少 napcat 字段，请补全后重试`)

  return {
    ...config,
    napcat: normalizeNapCatConfig(config.napcat),
  }
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

  const pkg = readPackageJson()
  pkg.mioki = structuredClone(botConfig)

  writePackageJson(pkg)

  logger.info(`检测到配置变动，已同步至 package.json 文件`)
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
