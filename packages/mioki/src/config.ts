import fs from 'node:fs'
import path from 'node:path'
import dayjs from 'dayjs'

/**
 * OneBot 11 正向 WebSocket 配置
 */
export interface Onebot11ForwardWebSocketConfig {
  /** 连接类型 */
  type: 'ws'
  /** WebSocket 服务器监听 IP */
  host?: string
  /** WebSocket 服务器监听端口 */
  port?: number
  /** 访问令牌 */
  access_token?: string
  /** 心跳配置 */
  heartbeat?: {
    /** 是否启用 */
    enable?: boolean
    /** 心跳间隔 */
    interval?: number
  }
}

/**
 * mioki 配置
 */
export interface MiokiConfig {
  prefix?: string
  owners: number[]
  admins: number[]
  plugins: string[]
  online_push?: boolean
}

/**
 * `mioki` 框架相关配置
 */
export const botConfig = {} as MiokiConfig

/**
 * 更新 `mioki` 配置，同时同步更新本地配置文件
 */
export const updateBotConfig = async (draftFn: (config: MiokiConfig) => any): Promise<void> => {
  await draftFn(botConfig)

  botConfig.plugins = unique(botConfig.plugins).toSorted((prev, next) => prev.localeCompare(next))
  botConfig.admins = unique(botConfig.admins).toSorted((prev, next) => prev - next)

  const toml = smolToml.stringify(botConfig) ?? ''

  await fs.promises.writeFile(CFG_PATH.value, toml)

  console.log(`>>> 检测到配置变动，已同步至 ${CFG_PATH.value}`)
}

/**
 * 机器人根目录
 */
export const BOT_CWD = {
  value: process.cwd(),
}

/**
 * 更新机器人根目录
 */
export const updateBotCWD = (root: string) => {
  BOT_CWD.value = root
  console.log(`>>> 机器人根目录已设置为 ${root}`)
}

/**
 * 是否是主人
 */
export const isOwner = (id: number | { sender: { user_id: number } } | { user_id: number }) => {
  const owners = [botConfig.uin, ...botConfig.owners]

  return isNumber(id)
    ? owners.includes(id)
    : 'sender' in id
      ? owners.includes(id.sender.user_id)
      : owners.includes(id.user_id)
}

/**
 * 是否是管理员，注意: 主人不是管理员
 */
export const isAdmin = (id: number | { sender: { user_id: number } } | { user_id: number }) => {
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
export const isOwnerOrAdmin = (id: number | { sender: { user_id: number } } | { user_id: number }) => {
  return isOwner(id) || isAdmin(id)
}

/**
 * 是否有权限，即：主人或管理员
 */
export const hasRight = (id: number | { sender: { user_id: number } } | { user_id: number }) => {
  return isOwnerOrAdmin(id)
}

/**
 * 是否在 PM2 中运行
 */
export const isInPm2 = 'pm_id' in process.env || 'PM2_USAGE' in process.env

/**
 * 获取日志文件名
 */
export function getLogFilePath(uin: number, platformName: string) {
  const startTime = dayjs().format('YYYY-MM-DD_HH-mm-ss')
  return path.join(BOT_CWD.value, `logs/${uin}_${platformName}_${startTime}.log`)
}

export function createLog4JsConfig(uin: number, logLevel: string, platformName: string): _log4js.Configuration {
  return {
    categories: {
      default: {
        appenders: ['console', 'file'],
        level: logLevel,
      },
    },
    appenders: {
      console: {
        type: 'console',
        layout: {
          type: 'pattern',
          pattern: isInPm2 ? '%[[%p]%] %m' : '[%d{yyyy/MM/dd hh:mm:ss:SSS}] %[[%p]%] %m',
        },
      },
      file: {
        type: 'file',
        filename: getLogFilePath(uin, platformName),
        maxLogSize: 1024 * 1024 * 10, // 10 MB
        layout: {
          type: 'pattern',
          pattern: '[%d] %[[%p]%] %c %m',
        },
      },
    },
  }
}
