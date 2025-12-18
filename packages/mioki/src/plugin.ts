import fs from 'node:fs'
import path from 'node:path'
import nodeCron from 'node-cron'
import { hrtime } from 'node:process'

import * as servicesExports from './services'
import * as configExports from './config'
import * as utilsExports from './utils'

import type { ScheduledTask, TaskContext } from 'node-cron'
import type { EventMap, NapCat } from 'napcat-sdk'

type Num = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

type Services = typeof servicesExports
type Configs = typeof configExports
type Utils = typeof utilsExports

/**
 * Mioki 上下文对象，包含 Mioki 运行时的信息和方法
 */
export interface MiokiContext extends Services, Configs, Utils {
  /** 机器人实例 */
  bot: NapCat
  /** 消息构造器 */
  segment: NapCat['segment']
  /** 注册事件处理器 */
  handle: <EventName extends keyof EventMap>(eventName: EventName, handler: (event: EventMap[EventName]) => any) => void
  /** 注册定时任务 */
  cron: (cronExpression: string, handler: (ctx: MiokiContext, task: TaskContext) => any) => ScheduledTask
  /** 待清理的函数集合，在插件卸载时会被调用 */
  clears: Set<(() => any) | null | undefined>
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

export interface MiokiPlugin {
  /** 插件 ID，请保持唯一，一般为插件目录名称，框架内部通过这个识别不同的插件 */
  name: string
  /** 插件版本，一般用于判断插件是否更新，暂只是用于区分 */
  version?: `${Num}.${Num}.${Num}` | `${Num}.${Num}` | (string & {})
  /** 插件加载优先级，默认 100，越小越被优先加载 */
  priority?: number
  /** 插件描述，额外提示信息，暂没有被使用到的地方 */
  description?: string
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

export async function enablePlugin(
  bot: NapCat,
  plugin: MiokiPlugin,
  type: 'builtin' | 'external' = 'external',
): Promise<MiokiPlugin> {
  const typeDesc = type === 'builtin' ? '内置' : '用户'
  const pluginName = plugin.name || 'null'
  const { name = pluginName, version = 'null', description = '-', setup = () => {} } = plugin

  try {
    const start = hrtime.bigint()
    const clears = new Set<() => any>()
    const userClears = new Set<(() => any) | undefined | null>()

    const context: MiokiContext = {
      bot,
      segment: bot.segment,
      services: servicesExports.services,
      ...utilsExports,
      ...configExports,
      clears: userClears,
      addService: (name: string, service: any, cover?: boolean) => {
        const removeService = servicesExports.addService(name, service, cover)
        clears.add(removeService)
        return removeService
      },
      handle: <EventName extends keyof EventMap>(
        eventName: EventName,
        handler: (event: EventMap[EventName]) => any,
      ) => {
        bot.on(eventName, handler)
        const unsubscribe = () => bot.off(eventName, handler)
        clears.add(unsubscribe)
        return unsubscribe
      },
      cron: (cronExpression, handler) => {
        const job = nodeCron.schedule(cronExpression, (now) => handler(context, now))
        const clear = () => job.stop()
        clears.add(clear)
        return job
      },
    }

    clears.add((await setup(context)) || (() => {}))

    runtimePlugins.set(name, {
      name,
      type,
      version,
      description,
      plugin,
      disable: async () => {
        try {
          await Promise.all([...clears, ...userClears].map((fn) => fn?.()))
          runtimePlugins.delete(name)
        } catch (err: any) {
          throw new Error(`禁用插件 [${typeDesc}]${name}@${version} 失败: ${err?.message}`)
        }
      },
    })

    const end = hrtime.bigint()
    const time = Math.round(Number(end - start)) / 1_000_000

    bot.logger.info(`启用插件 [${typeDesc}]${name}@${version} => 耗时 ${time} ms`)
  } catch (e: any) {
    throw new Error(`启用插件 [${typeDesc}]${name}@${version} 失败: ${e?.message}`)
  }

  return plugin
}

export async function findLocalPlugins(): Promise<{ name: string; absPath: string }[]> {
  const dirents = await fs.promises.readdir(path.join(configExports.BOT_CWD.value, 'plugins'), { withFileTypes: true })

  return dirents
    .filter((e) => e.isDirectory() && !!e.name && !e.name.startsWith('_'))
    .map((e) => ({
      name: e.name,
      absPath: path.join(configExports.BOT_CWD.value, 'plugins', e.name),
    }))
}
