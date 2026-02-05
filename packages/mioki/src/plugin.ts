import fs from 'node:fs'
import path from 'node:path'
import nodeCron from 'node-cron'
import { hrtime } from 'node:process'
import { colors } from 'consola/utils'
import { logger as miokiLogger } from './logger'

import * as utilsExports from './utils'
import * as configExports from './config'
import * as actionsExports from './actions'
import * as servicesExports from './services'

import type { EventMap, Logger, NapCat, GroupMessageEvent, PrivateMessageEvent } from 'napcat-sdk'
import type { ScheduledTask, TaskContext } from 'node-cron'
import type { ConsolaInstance } from 'consola/core'
import type { ExtendedNapCat } from './start'

type Num = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

type Utils = typeof utilsExports
type Configs = typeof configExports
type Actions = typeof actionsExports
type Services = typeof servicesExports

type StrictEqual<T, U> = (<G>() => G extends T ? 1 : 2) extends <G>() => G extends U ? 1 : 2 ? true : false

// 映射类型，用于遍历原始类型的每个键，并应用 RemoveFirstParam
type RemoveBotParam<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? StrictEqual<Parameters<T[K]>[0], NapCat> extends true
      ? OmitBotParamFromFunc<T[K]>
      : never
    : never
}

export type OmitBotParamFromFunc<Func extends (bot: NapCat, ...args: any[]) => any> = Func extends (
  bot: NapCat,
  ...args: infer A
) => infer Return
  ? (...args: A) => Return
  : never

export function bindBot<Params extends Array<any> = any[], Return = any>(
  bot: NapCat,
  func: (bot: NapCat, ...args: Params) => Return,
): OmitBotParamFromFunc<(bot: NapCat, ...args: Params) => Return> {
  return (...args: Params): Return => func(bot, ...args)
}

/**
 * 消息去重器
 * 处理多个 bot 在同一个群时，同一消息只处理一次
 */
export class MessageDeduplicator {
  private processedMessages = new Set<string>()
  private maxSize = 1000

  /**
   * 生成消息唯一键
   * 对于群消息：使用 group_id:user_id:time
   * 对于私聊消息：使用 private:user_id:time
   */
  private getKey(event: GroupMessageEvent | PrivateMessageEvent): string {
    if (event.message_type === 'group') {
      return `group:${event.group_id}:${event.user_id}:${event.time}`
    } else {
      return `private:${event.user_id}:${event.time}`
    }
  }

  isProcessed(event: GroupMessageEvent | PrivateMessageEvent): boolean {
    return this.processedMessages.has(this.getKey(event))
  }

  markProcessed(event: GroupMessageEvent | PrivateMessageEvent): void {
    // 清理旧数据，防止内存泄漏
    if (this.processedMessages.size >= this.maxSize) {
      const iterator = this.processedMessages.values()
      const first = iterator.next()
      if (!first.done) {
        this.processedMessages.delete(first.value)
      }
    }
    this.processedMessages.add(this.getKey(event))
  }

  clear(): void {
    this.processedMessages.clear()
  }
}

export const messageDeduplicator = new MessageDeduplicator()

/**
 * Mioki 上下文对象，包含 Mioki 运行时的信息和方法
 */
export interface MiokiContext extends Services, Configs, Utils, RemoveBotParam<Actions> {
  /** 当前处理事件的机器人实例 */
  bot: NapCat
  /** 所有已连接的机器人实例列表 */
  bots: ExtendedNapCat[]
  /** 当前机器人 QQ 号 */
  self_id: number
  /** 消息构造器 */
  segment: NapCat['segment']
  /** 通过域名获取 Cookies */
  getCookie: NapCat['getCookie']
  /** 注册事件处理器 */
  handle: <EventName extends keyof EventMap>(eventName: EventName, handler: (event: EventMap[EventName]) => any) => void
  /** 注册定时任务 */
  cron: (cronExpression: string, handler: (ctx: MiokiContext, task: TaskContext) => any) => ScheduledTask
  /** 待清理的函数集合，在插件卸载时会被调用 */
  clears: Set<(() => any) | null | undefined>
  /** 日志器 */
  logger: Logger
  /** 消息去重器 */
  deduplicator: MessageDeduplicator
}

export const runtimePlugins: Map<
  string,
  {
    name: string
    type: 'builtin' | 'external'
    version: string
    description: string
    plugin: MiokiPlugin
    disable: () => any
  }
> = new Map<
  string,
  {
    name: string
    type: 'builtin' | 'external'
    version: string
    description: string
    plugin: MiokiPlugin
    disable: () => any
  }
>()

const buildRemovedActions = (bot: NapCat) =>
  Object.fromEntries(
    Object.entries(actionsExports).map(([k, v]) => [k, bindBot(bot, v as any)]),
  ) as RemoveBotParam<Actions>

/**
 * 检查事件是否是群消息事件
 */
function isGroupMessageEvent(event: any): event is GroupMessageEvent {
  return event?.post_type === 'message' && event?.message_type === 'group'
}

/**
 * 检查事件是否是私聊消息事件
 */
function isPrivateMessageEvent(event: any): event is PrivateMessageEvent {
  return event?.post_type === 'message' && event?.message_type === 'private'
}

/**
 * 检查事件是否是消息事件
 */
function isMessageEvent(event: any): event is GroupMessageEvent | PrivateMessageEvent {
  return isGroupMessageEvent(event) || isPrivateMessageEvent(event)
}

export interface MiokiPlugin {
  /** 插件 ID，请保持唯一，一般为插件目录名称，框架内部通过这个识别不同的插件 */
  name: string
  /** 插件版本，一般用于判断插件是否更新，暂只是用于区分 */
  version?: `${Num}.${Num}.${Num}` | `${Num}.${Num}` | (string & {})
  /** 插件加载优先级，默认 100，越小越被优先加载 */
  priority?: number
  /** 插件描述，额外提示信息，暂没有被使用到的地方 */
  description?: string
  /** 插件额外依赖，框架不处理，仅做参考提醒用途 */
  dependencies?: string[]
  /** 插件初始化，返回一个清理函数，用于在插件卸载时清理资源，比如定时器、数据库连接等 */
  setup?: (ctx: MiokiContext) => any
}

/**
 * 定义一个 Mioki 插件
 * @param plugin Mioki 插件对象
 * @returns Mioki 插件对象
 */
export function definePlugin(plugin: MiokiPlugin): MiokiPlugin {
  return plugin
}

/**
 * 确保插件目录存在
 */
export function ensurePluginDir(): void {
  const dir = getAbsPluginDir()

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * 获取插件目录的绝对路径
 */
export function getAbsPluginDir(defaultDir: string = 'plugins'): string {
  const cwd = configExports.BOT_CWD.value
  return path.join(cwd, configExports.botConfig.plugins_dir || defaultDir)
}

export async function enablePlugin(
  bots: ExtendedNapCat[],
  plugin: MiokiPlugin,
  type: 'builtin' | 'external' = 'external',
): Promise<MiokiPlugin> {
  const typeDesc = type === 'builtin' ? '内置' : '用户'
  const pluginName = plugin.name || 'null'
  const { name = pluginName, version = 'null', description = '-', setup = () => {} } = plugin

  const mainBot = bots[0]
  if (!mainBot) {
    throw new Error('没有可用的 bot 实例')
  }

  try {
    const start = hrtime.bigint()
    const clears = new Set<() => any>()
    const userClears = new Set<(() => any) | undefined | null>()

    const logger = (miokiLogger as ConsolaInstance).withDefaults({
      tag: `plugin:${name}`,
    })

    // 为每个 bot 创建上下文
    const createContext = (bot: ExtendedNapCat): MiokiContext => {
      return {
        bot,
        bots,
        self_id: bot.bot_id,
        segment: bot.segment,
        getCookie: bot.getCookie.bind(bot),
        ...utilsExports,
        ...configExports,
        ...buildRemovedActions(bot),
        logger,
        services: servicesExports.services,
        clears: userClears,
        deduplicator: messageDeduplicator,
        addService: (name: string, service: any, cover?: boolean) => {
          const remove = servicesExports.addService(name, service, cover)
          clears.add(remove)
          return remove
        },
        handle: <EventName extends keyof EventMap>(
          eventName: EventName,
          handler: (event: EventMap[EventName]) => any,
        ) => {
          logger.debug(`Registering event handler for event: ${String(eventName)}`)

          // 为每个 bot 注册事件处理器
          const unsubscribes: (() => void)[] = []

          for (const bot of bots) {
            const wrappedHandler = (event: EventMap[EventName]) => {
              if (isMessageEvent(event)) {
                const messageEvent = event as GroupMessageEvent | PrivateMessageEvent

                if (isPrivateMessageEvent(messageEvent)) {
                  if (messageEvent.self_id !== bot.bot_id) {
                    return // 不是发给这个 bot 的，跳过
                  }
                }

                if (isGroupMessageEvent(messageEvent)) {
                  // 这个消息是否已经被处理过
                  if (messageDeduplicator.isProcessed(messageEvent)) {
                    return // 已处理过
                  }
                  // 标记为已处理
                  messageDeduplicator.markProcessed(messageEvent)
                }
              }

              // 创建当前 bot 的上下文并调用 handler
              const ctx = createContext(bot)
              handler(event as any)
            }

            bot.on(eventName, wrappedHandler)

            const unsubscribe = () => {
              logger.debug(`Unregistering event handler for event: ${String(eventName)}`)
              bot.off(eventName, wrappedHandler)
            }

            unsubscribes.push(unsubscribe)
          }

          const clearAll = () => {
            unsubscribes.forEach((fn) => fn())
          }

          clears.add(clearAll)

          return clearAll
        },
        cron: (cronExpression, handler) => {
          logger.debug(`Scheduling cron job: ${cronExpression}`)
          const job = nodeCron.schedule(cronExpression, (now) => handler(createContext(bot), now))

          const clear = () => {
            logger.debug(`Stopping cron job: ${cronExpression}`)
            job.stop()
          }

          clears.add(clear)
          return job
        },
      }
    }

    // 使用第一个 bot 的上下文进行初始化
    const mainContext = createContext(bots[0])

    clears.add((await setup(mainContext)) || (() => {}))

    runtimePlugins.set(name, {
      name,
      type,
      version,
      description,
      plugin,
      disable: async () => {
        try {
          logger.debug(`Disabling plugin [${typeDesc}]${name}@${version}`)
          await Promise.all([...clears, ...userClears].map((fn) => fn?.()))
          runtimePlugins.delete(name)
        } catch (err: any) {
          throw new Error(
            `禁用插件 [${colors.yellow(typeDesc)}]${colors.yellow(`${name}@${version}`)} 失败: ${err?.message}`,
          )
        }
      },
    })

    const end = hrtime.bigint()
    const time = Math.round(Number(end - start)) / 1_000_000

    logger.info(
      `- 启用插件 ${colors.yellow(`[${typeDesc}]`)} ${colors.yellow(`${name}@${version}`)} => 耗时 ${colors.green(time.toFixed(2))} 毫秒`,
    )
  } catch (e: any) {
    throw new Error(
      `启用插件 ${colors.yellow(`[${typeDesc}]`)} ${colors.yellow(`${name}@${version}`)} 失败: ${e?.message}`,
    )
  }

  return plugin
}

export async function findLocalPlugins(): Promise<{ name: string; absPath: string }[]> {
  const dirents = await fs.promises.readdir(getAbsPluginDir(), { withFileTypes: true })

  return dirents
    .filter((e) => e.isDirectory() && !!e.name && !e.name.startsWith('_'))
    .map((e) => ({
      name: e.name,
      absPath: path.join(getAbsPluginDir(), e.name),
    }))
}
