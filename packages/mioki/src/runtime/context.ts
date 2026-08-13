import type { Bot, BotContext } from '../adapter'
import type { Capability } from '../adapter'
import type { AdapterContext, AdapterGateway, AdapterResource, BotLifecycleEvent, CapabilityTarget } from '../adapter'
import type { Driver } from '../driver'
import type { Event } from '../adapter'
import type { CapabilityRegistry } from '../adapter'
import type { EventBus } from './bus'
import type { Logger } from '../logger'
import type { BotRegistry } from './bots'
import type { Adapter } from '../adapter'

export class AdapterRegistrationConflictError extends Error {
  constructor(key: string) {
    super(`Bot already registered for ${key}`)
    this.name = 'AdapterRegistrationConflictError'
  }
}

export interface RuntimeAdapterState {
  readonly definition: import('../adapter/types').AdapterDefinition<unknown>
  instance: Adapter | null
  context: AdapterContextImpl | null
  gateways: AdapterGateway[] | null
  resources: AdapterResource[] | null
  started: boolean
}

export class AdapterContextImpl implements AdapterContext {
  readonly #state: RuntimeAdapterState
  readonly #bots: BotRegistry
  readonly #bus: EventBus
  readonly #driver: Driver
  readonly #capabilities: CapabilityRegistry
  readonly #logger: Logger
  readonly #emit: (event: BotLifecycleEvent) => Promise<void>
  readonly #pendingStarts = new Set<Promise<void>>()

  constructor(options: {
    state: RuntimeAdapterState
    bots: BotRegistry
    bus: EventBus
    driver: Driver
    capabilities: CapabilityRegistry
    logger: Logger
    emit: (event: BotLifecycleEvent) => Promise<void>
  }) {
    this.#state = options.state
    this.#bots = options.bots
    this.#bus = options.bus
    this.#driver = options.driver
    this.#capabilities = options.capabilities
    this.#logger = options.logger
    this.#emit = options.emit
  }

  registerBot(bot: Bot): BotContext {
    return this.#bots.register(bot)
  }

  unregisterBot(bot_id: string): void {
    this.#bots.unregister(bot_id, this.#state.definition.name)
  }

  getDriver(): Driver {
    return this.#driver
  }

  registerCapability<I, O>(
    capability: Capability<I, O>,
    target: CapabilityTarget,
    handler: (input: I) => Promise<O>,
  ): () => void {
    const finalTarget: CapabilityTarget = {
      ...target,
      adapter: target.adapter ?? this.#state.definition.name,
    }
    return this.#capabilities.register(capability, finalTarget, handler)
  }

  getCapabilityRegistry(): CapabilityRegistry {
    return this.#capabilities
  }

  registerGateway(gateway: AdapterGateway): () => void {
    if (!this.#state.gateways) {
      throw new Error('registerGateway called outside of adapter start()')
    }
    if (this.#state.gateways.find((g) => g.name === gateway.name)) {
      throw new Error(`Gateway "${gateway.name}" already registered for adapter "${this.#state.definition.name}"`)
    }
    this.#state.gateways.push(gateway)
    const startPromise = Promise.resolve(gateway.start()).then(
      () => undefined,
      (err: unknown) => {
        this.#logger.error(`Gateway "${gateway.name}" failed to start`, err)
        throw err
      },
    )
    this.#pendingStarts.add(startPromise)
    void startPromise.then(
      () => this.#pendingStarts.delete(startPromise),
      () => this.#pendingStarts.delete(startPromise),
    )
    return () => {
      const idx = this.#state.gateways?.indexOf(gateway) ?? -1
      if (idx >= 0 && this.#state.gateways) {
        this.#state.gateways.splice(idx, 1)
        void Promise.resolve(gateway.stop('unregistered')).catch(() => undefined)
      }
    }
  }

  async waitForStarts(): Promise<void> {
    await Promise.all(this.#pendingStarts)
  }

  registerResource(resource: AdapterResource): () => void {
    if (!this.#state.resources) {
      throw new Error('registerResource called outside of adapter start()')
    }
    if (resource.scope === 'gateway' && !resource.gateway) {
      throw new Error('Resource with scope "gateway" requires gateway name')
    }
    if (resource.scope === 'bot' && !resource.bot_id) {
      throw new Error('Resource with scope "bot" requires bot_id')
    }
    if (resource.scope === 'gateway') {
      const gateway = this.#state.gateways?.find((g) => g.name === resource.gateway)
      if (!gateway) {
        throw new Error(`Resource references unknown gateway "${resource.gateway}"`)
      }
    }
    if (resource.scope === 'bot') {
      const key = `${this.#state.definition.name}:${resource.bot_id}`
      if (!this.#bots.has(key)) {
        throw new Error(`Resource references unknown bot "${resource.bot_id}"`)
      }
    }
    this.#state.resources.push(resource)
    return () => {
      const idx = this.#state.resources?.indexOf(resource) ?? -1
      if (idx >= 0 && this.#state.resources) {
        this.#state.resources.splice(idx, 1)
        void Promise.resolve(resource.dispose('unregistered')).catch(() => undefined)
      }
    }
  }

  async dispatch(event: Event): Promise<void> {
    await this.#bus.dispatch(event)
  }

  emitLifecycle(event: BotLifecycleEvent): Promise<void> {
    return this.#emit(event)
  }

  get adapterName(): string {
    return this.#state.definition.name
  }
}
