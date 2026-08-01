import type { Event } from '../adapter'

export type EventHandler<E extends Event = Event> = (event: E) => void | Promise<void>

export interface Registration {
  readonly id: number
  readonly route: string
  readonly source: string
  readonly handler: EventHandler<Event>
  readonly priority: number
  readonly order: number
  disposed: boolean
}

export interface BusStats {
  readonly registered: number
  readonly dispatched: number
}

const WILDCARD = '*'

const isWildcardMatch = (pattern: string, route: string): boolean => {
  if (pattern === route) return true
  if (!pattern.includes(WILDCARD)) return false
  if (pattern === WILDCARD) return true
  const prefix = pattern.slice(0, -1)
  if (!prefix.endsWith('.')) return false
  return route === prefix.slice(0, -1) || route.startsWith(prefix)
}

export class EventBus {
  #registrations: Registration[] = []
  #nextId = 1
  #nextOrder = 0
  #dispatched = 0
  #logger: ((level: 'error' | 'warn' | 'info', message: string, detail?: unknown) => void) | null = null

  setLogger(logger: ((level: 'error' | 'warn' | 'info', message: string, detail?: unknown) => void) | null): void {
    this.#logger = logger
  }

  register<E extends Event = Event>(
    route: string,
    handler: EventHandler<E>,
    options: { source?: string; priority?: number } = {},
  ): () => void {
    if (!route) {
      throw new Error('EventBus.register: route must be a non-empty string')
    }
    if (typeof handler !== 'function') {
      throw new Error('EventBus.register: handler must be a function')
    }
    const id = this.#nextId++
    const order = this.#nextOrder++
    const reg: Registration = {
      id,
      route,
      source: options.source ?? 'anonymous',
      handler: handler as EventHandler<Event>,
      priority: options.priority ?? 0,
      order,
      disposed: false,
    }
    this.#registrations.push(reg)
    return () => this.#unregister(id)
  }

  #unregister(id: number): void {
    const idx = this.#registrations.findIndex((r) => r.id === id)
    if (idx >= 0) {
      this.#registrations[idx].disposed = true
      this.#registrations.splice(idx, 1)
    }
  }

  removeBySource(source: string): number {
    let removed = 0
    this.#registrations = this.#registrations.filter((reg) => {
      if (reg.source === source) {
        reg.disposed = true
        removed++
        return false
      }
      return true
    })
    return removed
  }

  clear(): void {
    for (const reg of this.#registrations) reg.disposed = true
    this.#registrations = []
  }

  #matching(event: Event): Registration[] {
    const matched: Registration[] = []
    for (const reg of this.#registrations) {
      if (reg.disposed) continue
      if (isWildcardMatch(reg.route, event.type)) {
        matched.push(reg)
        continue
      }
      for (const route of event.routes) {
        if (isWildcardMatch(reg.route, route)) {
          matched.push(reg)
          break
        }
      }
    }
    return matched
  }

  async dispatch(event: Event): Promise<void> {
    const matched = this.#matching(event)
    if (matched.length === 0) return
    this.#dispatched++

    const priorityGroups = new Map<number, Registration[]>()
    for (const reg of matched) {
      const list = priorityGroups.get(reg.priority)
      if (list) list.push(reg)
      else priorityGroups.set(reg.priority, [reg])
    }
    const sortedPriorities = Array.from(priorityGroups.entries()).sort(([a], [b]) => a - b)

    for (const [, regs] of sortedPriorities) {
      regs.sort((a, b) => a.order - b.order)
      await Promise.allSettled(
        regs.map((reg) =>
          Promise.resolve()
            .then(() => reg.handler(event))
            .catch((err) => {
              this.#logger?.(
                'error',
                `Event handler "${reg.source}" for route "${reg.route}" failed`,
                err,
              )
            }),
        ),
      )
    }
  }

  stats(): BusStats {
    return {
      registered: this.#registrations.length,
      dispatched: this.#dispatched,
    }
  }
}
