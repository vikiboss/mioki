import { isAdmin as isConfiguredAdmin, isOwner as isConfiguredOwner } from '../config'
import nodeCron from 'node-cron'

import type { Adapter, AdapterName } from '../adapter'
import type { Bot } from '../adapter'
import type { Driver } from '../driver'
import type { Event, MessageEvent, MetaEvent, NoticeEvent, RequestEvent } from '../adapter'
import type { BotId } from '../types'
import type { BotLifecycleEvent } from '../adapter'
import type { Logger } from '../logger'
import type { MiokiConfig } from '../config'
import type { EventBus } from './bus'
import type { CronHandler, PluginCleanup, ScheduledTask } from '../plugin'
import type { TaskContext } from 'node-cron'
import type { CapabilityRegistry } from '../adapter'
import type { BotRegistry } from './bots'

export interface PluginManager {
  list(): Array<{ name: string; type: 'builtin' | 'external'; version?: string }>
  localPlugins(): string[]
  enable(name: string): Promise<void>
  disable(name: string): Promise<void>
  reload(name: string): Promise<void>
}

export interface ContextOptions {
  readonly pluginName: string
  readonly bus: EventBus
  readonly bots: BotRegistry
  readonly driver: Driver
  readonly capabilities: CapabilityRegistry
  readonly config: MiokiConfig
  readonly logger: Logger
  readonly priority: number
  readonly getAdapter: <T extends Adapter = Adapter>(name: AdapterName) => T | undefined
  readonly onUpdateConfig: (updater: (config: MiokiConfig) => void | Promise<void>) => Promise<void>
  readonly pluginManager: PluginManager
}

export interface ContextLike {
  readonly pluginName: string
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const toUserId = (value: unknown): import('../types').UserId | undefined => {
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') {
    return String(value) as import('../types').UserId
  }
  if (isObject(value)) {
    if ('user_id' in value) return toUserId((value as { user_id: unknown }).user_id)
    if ('sender' in value) {
      const sender = (value as { sender: unknown }).sender
      if (isObject(sender) && 'user_id' in sender) return toUserId((sender as { user_id: unknown }).user_id)
    }
  }
  return undefined
}

export const isEventOwner = (event: unknown): boolean => {
  const id = toUserId(event)
  if (!id) return false
  return isConfiguredOwner(id)
}

export const isEventAdmin = (event: unknown): boolean => {
  const id = toUserId(event)
  if (!id) return false
  return isConfiguredAdmin(id)
}

export const isEventOwnerOrAdmin = (event: unknown): boolean => isEventOwner(event) || isEventAdmin(event)
export const hasEventRight = (event: unknown): boolean => isEventOwnerOrAdmin(event)

export type EventKindOfRoute<R extends string> = R extends `message${string}`
  ? MessageEvent
  : R extends `notice${string}`
    ? NoticeEvent
    : R extends `request${string}`
      ? RequestEvent
      : R extends `meta_event${string}`
        ? MetaEvent
        : Event

export type RouteEvent<R extends string | readonly string[]> = R extends readonly string[]
  ? EventKindOfRoute<R[number]>
  : EventKindOfRoute<Extract<R, string>>

export class MiokiContext {
  readonly #options: ContextOptions
  readonly #cleanup: Set<PluginCleanup> = new Set()

  constructor(options: ContextOptions) {
    this.#options = options
  }

  #addCleanup(fn: PluginCleanup): void {
    this.#cleanup.add(fn)
  }

  get pluginName(): string {
    return this.#options.pluginName
  }

  get bot(): Bot | undefined {
    return this.#options.bots.all()[0]
  }

  get bots(): readonly Bot[] {
    return this.#options.bots.all()
  }

  get self_id(): BotId | undefined {
    return this.bot?.bot_id
  }

  pickBot(bot_id: BotId): Bot | undefined {
    return this.#options.bots.pick(bot_id)
  }

  pickAdapterBot(adapter: AdapterName, bot_id: BotId): Bot | undefined {
    return this.#options.bots.get(adapter, bot_id)
  }

  getAdapter<T extends Adapter = Adapter>(name: AdapterName): T | undefined {
    return this.#options.getAdapter<T>(name)
  }

  handle<R extends string | readonly string[]>(
    route: R,
    handler: (event: RouteEvent<R>) => void | Promise<void>,
  ): () => void {
    const routes = Array.isArray(route) ? route : [route]
    const source = `plugin:${this.#options.pluginName}`
    const handledEvents = new WeakSet<Event>()
    const wrappedHandler = async (event: Event): Promise<void> => {
      if (handledEvents.has(event)) return
      handledEvents.add(event)
      await handler(event as RouteEvent<R>)
    }
    const disposers = routes.map((r) =>
      this.#options.bus.register(r, wrappedHandler, { source, priority: this.#options.priority }),
    )
    let disposed = false
    const dispose = (): void => {
      if (disposed) return
      disposed = true
      for (const dispose of disposers) dispose()
    }
    this.#addCleanup(dispose)
    return dispose
  }

  cron(expression: string, handler: CronHandler): ScheduledTask {
    const task = nodeCron.schedule(expression, async (taskContext: TaskContext) => {
      try {
        await handler(this, taskContext)
      } catch (err) {
        this.#options.logger.error(`Plugin "${this.#options.pluginName}" cron task failed`, err)
      }
    })
    let disposed = false
    const dispose = async (): Promise<void> => {
      if (disposed) return
      disposed = true
      await task.stop()
      await task.destroy()
    }
    this.#addCleanup(dispose)
    return task
  }

  onBot<K extends 'connected' | 'disconnected'>(
    type: K,
    handler: (event: K extends 'connected' ? { bot: Bot } : BotLifecycleEvent) => void | Promise<void>,
  ): () => void {
    const route = type === 'connected' ? 'bot:connected' : 'bot:disconnected'
    return this.handle(route, handler as (event: Event) => void | Promise<void>)
  }

  getDriver(): Driver {
    return this.#options.driver
  }

  get config(): Readonly<MiokiConfig> {
    return this.#options.config
  }

  updateConfig(updater: (config: MiokiConfig) => void | Promise<void>): Promise<void> {
    return this.#options.onUpdateConfig(updater)
  }

  get logger(): Logger {
    return this.#options.logger
  }

  get plugins(): PluginManager {
    return this.#options.pluginManager
  }

  get capabilities(): CapabilityRegistry {
    return this.#options.capabilities
  }

  get buses(): EventBus {
    return this.#options.bus
  }

  async dispose(): Promise<void> {
    const all = Array.from(this.#cleanup)
    this.#cleanup.clear()
    for (const fn of all) {
      try {
        await fn()
      } catch {
        // swallow individual cleanup errors so other plugins can still clean up
      }
    }
  }
}
