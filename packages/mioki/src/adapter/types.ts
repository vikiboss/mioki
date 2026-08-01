import type { Capability } from './capability'
import type { Driver } from '../driver'
import type { AdapterName, BotId } from '../types'
import type { Event } from './event'

export type { AdapterName } from '../types'

export interface CapabilityTarget {
  readonly adapter: AdapterName
  readonly bot_id?: BotId
  readonly resource_id?: string
}

export interface AdapterDefinition<TConfig = unknown> {
  readonly name: AdapterName
  readonly version: string
  readonly apiVersion: number
  readonly create: (options: AdapterFactoryOptions<TConfig>) => Adapter | Promise<Adapter>
  readonly validateConfig?: (config: unknown) => TConfig
}

export interface AdapterFactoryOptions<TConfig = unknown> {
  readonly config: TConfig
  readonly logger: import('../logger').Logger
}

export interface AdapterContext {
  registerBot(bot: import('./bot').Bot): import('./bot').BotContext
  unregisterBot(bot_id: BotId): void
  getDriver(): Driver
  registerCapability<I, O>(
    capability: Capability<I, O>,
    target: CapabilityTarget,
    handler: (input: I) => Promise<O>,
  ): () => void
  registerGateway(gateway: AdapterGateway): () => void
  registerResource(resource: AdapterResource): () => void
  dispatch(event: Event): Promise<void>
  emitLifecycle(event: BotLifecycleEvent): Promise<void>
}

export interface Adapter {
  readonly name: AdapterName
  readonly version: string

  start(context: AdapterContext): Promise<void> | void
  stop(reason?: string): Promise<void> | void
}

export interface AdapterGateway {
  readonly name: string
  start(): Promise<void> | void
  stop(reason?: string): Promise<void> | void
}

export type AdapterResourceScope = 'adapter' | 'gateway' | 'bot'

export interface AdapterResource {
  readonly name: string
  readonly scope: AdapterResourceScope
  readonly gateway?: string
  readonly bot_id?: BotId
  dispose(reason?: string): void | Promise<void>
}

export interface BotLifecycleEvent {
  readonly type: 'bot:connected' | 'bot:disconnected'
  readonly bot: import('./bot').Bot
  readonly reason?: string
}

export const defineAdapter = <TConfig>(definition: AdapterDefinition<TConfig>): AdapterDefinition<TConfig> => definition