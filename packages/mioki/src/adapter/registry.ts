import { UnsupportedCapabilityError, type Capability } from './capability'
import type { CapabilityTarget } from './types'

export interface CapabilityHandler<I, O> {
  readonly capability: Capability<I, O>
  readonly target: CapabilityTarget
  readonly handler: (input: I) => Promise<O>
}

export class CapabilityRegistry {
  #handlers: CapabilityHandler<unknown, unknown>[] = []

  register<I, O>(
    capability: Capability<I, O>,
    target: CapabilityTarget,
    handler: (input: I) => Promise<O>,
  ): () => void {
    const existing = this.#handlers.find(
      (h) =>
        h.capability.token === capability.token &&
        h.capability.version === capability.version &&
        h.target.adapter === target.adapter &&
        (h.target.bot_id ?? null) === (target.bot_id ?? null) &&
        (h.target.resource_id ?? null) === (target.resource_id ?? null),
    )
    if (existing) {
      throw new Error(
        `Capability "${capability.name}" is already registered for ${target.adapter}${
          target.bot_id ? `:${target.bot_id}` : ''
        }${target.resource_id ? `/${target.resource_id}` : ''}`,
      )
    }
    const entry: CapabilityHandler<unknown, unknown> = {
      capability,
      target,
      handler: handler as (input: unknown) => Promise<unknown>,
    }
    this.#handlers.push(entry)
    return () => {
      const idx = this.#handlers.indexOf(entry)
      if (idx >= 0) this.#handlers.splice(idx, 1)
    }
  }

  supports<I, O>(target: CapabilityTarget, capability: Capability<I, O>): boolean {
    return this.#handlers.some(
      (h) =>
        h.capability.token === capability.token &&
        h.capability.version === capability.version &&
        h.target.adapter === target.adapter &&
        (h.target.bot_id ?? null) === (target.bot_id ?? null) &&
        (h.target.resource_id ?? null) === (target.resource_id ?? null),
    )
  }

  async invoke<I, O>(target: CapabilityTarget, capability: Capability<I, O>, input: I): Promise<O> {
    const handler = this.#handlers.find(
      (h) =>
        h.capability.token === capability.token &&
        h.capability.version === capability.version &&
        h.target.adapter === target.adapter &&
        (h.target.bot_id ?? null) === (target.bot_id ?? null) &&
        (h.target.resource_id ?? null) === (target.resource_id ?? null),
    )
    if (!handler) {
      throw new UnsupportedCapabilityError(capability.name)
    }
    return (handler.handler as (input: I) => Promise<O>)(input)
  }

  clear(): void {
    this.#handlers.length = 0
  }
}
