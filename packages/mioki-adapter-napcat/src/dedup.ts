import type { EventIdentity } from 'mioki'

export class AdapterEventDeduplicator {
  readonly #ttl: number
  readonly #maxSize: number
  readonly #entries = new Map<string, number>()

  constructor(options: { ttl?: number; maxSize?: number } = {}) {
    this.#ttl = options.ttl ?? 60_000
    this.#maxSize = options.maxSize ?? 1024
  }

  #buildKey(identity: EventIdentity): string {
    const parts = [
      identity.adapter ?? '',
      identity.bot_id ?? '',
      identity.source_id ?? '',
      identity.event_type ?? '',
      identity.message_id ?? '',
      identity.native_event_id ?? '',
      identity.timestamp?.toString() ?? '',
      identity.fingerprint ?? '',
    ]
    return parts.join('|')
  }

  isDuplicate(identity: EventIdentity): boolean {
    this.#prune()
    const key = this.#buildKey(identity)
    if (this.#entries.has(key)) return true
    this.#entries.set(key, Date.now())
    if (this.#entries.size > this.#maxSize) {
      const oldest = this.#entries.keys().next().value
      if (oldest !== undefined) this.#entries.delete(oldest)
    }
    return false
  }

  #prune(): void {
    const now = Date.now()
    for (const [key, ts] of this.#entries) {
      if (now - ts > this.#ttl) this.#entries.delete(key)
    }
  }

  clear(): void {
    this.#entries.clear()
  }
}