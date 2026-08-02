import { isAdmin as isConfiguredAdmin, isOwner as isConfiguredOwner } from '../config'
import nodeCron from 'node-cron'
import {
  createCmd as createCmdUtil,
  createDB as createDBUtil,
  createStore as createStoreUtil,
  match as matchMessage,
  text as extractText,
  type CreateCmdOptions,
  type HasMessage,
} from '../utils'
import * as utilsExports from '../utils'
import { segment } from '../adapter'
import {
  noticeAdmins as noticeAdminsAction,
  noticeFriends as noticeFriendsAction,
  noticeGroups as noticeGroupsAction,
  noticeOwners as noticeOwnersAction,
} from '../actions'
import { addService as registerService, servicesRegistry } from '../services'

import type { Adapter } from '../adapter'
import type { Bot } from '../adapter'
import type { Driver } from '../driver'
import type { Event, MessageEvent, MetaEvent, NoticeEvent, RequestEvent } from '../adapter'
import type { BotLifecycleEvent } from '../adapter'
import type { Logger } from '../logger'
import type { MiokiConfig } from '../config'
import type { EventBus } from './bus'
import type { CronHandler, PluginCleanup, ScheduledTask } from '../plugin'
import type { TaskContext } from 'node-cron'
import type { CapabilityRegistry } from '../adapter'
import type { BotRegistry } from './bots'
import type { Message, MessageInput } from '../adapter'

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
  readonly getAdapter: <T extends Adapter = Adapter>(name: string) => T | undefined
  readonly onUpdateConfig: (updater: (config: MiokiConfig) => void | Promise<void>) => Promise<void>
  readonly pluginManager: PluginManager
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const toUserId = (value: unknown): string | undefined => {
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') {
    return String(value)
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

/** Adapter packages augment this map with their platform-specific Bot type. */
export interface AdapterBotMap {}

type SemanticRoute<R extends string> = R extends `${string}:${infer Rest}` ? Rest : R

type EventKindOfSemanticRoute<R extends string> = R extends `message${string}`
  ? MessageEvent
  : R extends `notice${string}`
    ? NoticeEvent
    : R extends `request${string}`
      ? RequestEvent
      : R extends `meta_event${string}`
        ? MetaEvent
        : Event

export type EventKindOfRoute<R extends string> = EventKindOfSemanticRoute<SemanticRoute<R>>

type AdapterBotOf<Name extends string> = Name extends keyof AdapterBotMap
  ? AdapterBotMap[Name] extends Bot
    ? AdapterBotMap[Name]
    : Bot
  : Bot

type BotOfRoute<R extends string> = R extends `${infer Adapter}:${string}` ? AdapterBotOf<Adapter> : Bot

type BindRouteBot<E, B extends Bot> = E extends { bot: Bot; self_id: string }
  ? Omit<E, 'bot' | 'self_id'> & { bot: B; self_id: B['bot_id'] }
  : E

type RouteEventOf<R extends string> = BindRouteBot<EventKindOfRoute<R>, BotOfRoute<R>>

export type RouteEvent<R extends string | readonly string[]> = R extends readonly string[]
  ? RouteEventOf<R[number]>
  : RouteEventOf<Extract<R, string>>

const CTX_UTILS = {
  localeDate: utilsExports.localeDate,
  localeTime: utilsExports.localeTime,
  randomInt: utilsExports.randomInt,
  randomItem: utilsExports.randomItem,
  randomItems: utilsExports.randomItems,
  randomId: utilsExports.randomId,
  uuid: utilsExports.uuid,
  wait: utilsExports.wait,
  toArray: utilsExports.toArray,
  unique: utilsExports.unique,
  clamp: utilsExports.clamp,
  noNullish: utilsExports.noNullish,
  isDefined: utilsExports.isDefined,
  isFunction: utilsExports.isFunction,
  isNumber: utilsExports.isNumber,
  isBoolean: utilsExports.isBoolean,
  isString: utilsExports.isString,
  isObject: utilsExports.isObject,
  localNum: utilsExports.localNum,
  formatDuration: utilsExports.formatDuration,
  md5: utilsExports.md5,
  base64Encode: utilsExports.base64Encode,
  base64Decode: utilsExports.base64Decode,
  qs: utilsExports.qs,
  stringifyError: utilsExports.stringifyError,
  getTerminalInput: utilsExports.getTerminalInput,
  find: utilsExports.find,
  filter: utilsExports.filter,
  prettyMs: utilsExports.prettyMs,
  filesize: utilsExports.filesize,
  dayjs: utilsExports.dayjs,
  path: utilsExports.path,
  fs: utilsExports.fs,
  colors: utilsExports.colors,
} as const

type CtxUtils = typeof CTX_UTILS

export class MiokiContext {
  readonly #options: ContextOptions
  readonly #cleanup: Set<PluginCleanup> = new Set()

  constructor(options: ContextOptions) {
    this.#options = options
    Object.assign(this, CTX_UTILS)
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

  get self_id(): string | undefined {
    return this.bot?.bot_id
  }

  pickBot<T extends Bot = Bot>(bot_id: string): T | undefined {
    return this.#options.bots.pick<T>(bot_id)
  }

  pickAdapterBot<T extends Bot = Bot>(adapter: string, bot_id: string): T | undefined {
    return this.#options.bots.get<T>(adapter, bot_id)
  }

  getAdapter<T extends Adapter = Adapter>(name: string): T | undefined {
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

  get services(): import('../services').MiokiServices {
    return servicesRegistry as import('../services').MiokiServices
  }

  addService<T = unknown>(name: string, value: T, cover?: boolean): () => void {
    const remove = registerService<T>(name, value, cover)
    this.#addCleanup(remove)
    return remove
  }

  get capabilities(): CapabilityRegistry {
    return this.#options.capabilities
  }

  get buses(): EventBus {
    return this.#options.bus
  }

  get segment(): typeof segment {
    return segment
  }

  match<T extends HasMessage>(
    event: T,
    pattern: Parameters<typeof matchMessage>[1],
    quote?: boolean,
  ): ReturnType<typeof matchMessage> {
    return matchMessage(event, pattern, quote)
  }

  createCmd(cmdStr: string, options: CreateCmdOptions = {}): ReturnType<typeof createCmdUtil> {
    return createCmdUtil(cmdStr, options)
  }

  createStore<T extends object = object>(
    defaultData: T,
    options: { __dirname?: string; importMeta?: ImportMeta; compress?: boolean; filename?: string } = {},
  ): ReturnType<typeof createStoreUtil<T>> {
    return createStoreUtil<T>(defaultData, options)
  }

  createDB<T extends object = object>(
    filename: string,
    options: { defaultData?: T; compress?: boolean } = {},
  ): ReturnType<typeof createDBUtil<T>> {
    return createDBUtil<T>(filename, options)
  }

  text(source: HasMessage | Message, options?: { trim?: boolean | 'whole' | 'each' }): string {
    return extractText(source, options)
  }

  noticeGroups(groupIds: readonly string[], message: MessageInput, options?: import('../actions').NoticeOptions): Promise<void> {
    return noticeGroupsAction(this.#options.bots.all(), groupIds, message, options)
  }

  noticeFriends(userIds: readonly string[], message: MessageInput, options?: import('../actions').NoticeOptions): Promise<void> {
    return noticeFriendsAction(this.#options.bots.all(), userIds, message, options)
  }

  noticeOwners(message: MessageInput, options?: import('../actions').NoticeOptions): Promise<void> {
    return noticeOwnersAction(this.#options.bots.all(), this.#options.config.owners, message, options)
  }

  noticeAdmins(message: MessageInput, options?: import('../actions').NoticeOptions): Promise<void> {
    return noticeAdminsAction(this.#options.bots.all(), this.#options.config.admins, message, options)
  }

  isGroupMsg(event: unknown): boolean {
    return isObject(event) && (event as { kind?: unknown }).kind === 'message' &&
      (event as { message_type?: unknown }).message_type === 'group'
  }

  isPrivateMsg(event: unknown): boolean {
    return isObject(event) && (event as { kind?: unknown }).kind === 'message' &&
      (event as { message_type?: unknown }).message_type === 'private'
  }

  isOwner(event: unknown): boolean {
    return isEventOwner(event)
  }

  isAdmin(event: unknown): boolean {
    return isEventAdmin(event)
  }

  isOwnerOrAdmin(event: unknown): boolean {
    return isEventOwnerOrAdmin(event)
  }

  hasRight(event: unknown): boolean {
    return hasEventRight(event)
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

export interface MiokiContext extends CtxUtils {}
