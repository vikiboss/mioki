import { AdapterRegistrationConflictError } from './context'

import type { Bot, BotContext } from '../adapter'
import type { AdapterName, BotId } from '../types'

const buildKey = (adapter: AdapterName, bot_id: BotId): string => `${adapter}:${bot_id}`

export class BotRegistry {
  #bots = new Map<string, { adapter: AdapterName; bot_id: BotId; bot: Bot }>()
  #disposers = new Map<string, () => void>()

  register(bot: Bot): BotContext {
    const key = buildKey(bot.adapter, bot.bot_id)
    if (this.#bots.has(key)) {
      throw new AdapterRegistrationConflictError(key)
    }
    this.#bots.set(key, { adapter: bot.adapter, bot_id: bot.bot_id, bot })
    const dispose = (): void => {
      this.unregister(bot.bot_id, bot.adapter)
    }
    this.#disposers.set(key, dispose)
    return {
      bot,
      unregister: dispose,
    }
  }

  has(key: string): boolean {
    return this.#bots.has(key)
  }

  unregister(bot_id: BotId, adapter: AdapterName): boolean {
    const key = buildKey(adapter, bot_id)
    const removed = this.#bots.delete(key)
    this.#disposers.delete(key)
    return removed
  }

  get<T extends Bot = Bot>(adapter: AdapterName, bot_id: BotId): T | undefined {
    return this.#bots.get(buildKey(adapter, bot_id))?.bot as T | undefined
  }

  pick<T extends Bot = Bot>(bot_id: BotId): T | undefined {
    for (const entry of this.#bots.values()) {
      if (entry.bot_id === bot_id) return entry.bot as T
    }
    return undefined
  }

  all<T extends Bot = Bot>(): readonly T[] {
    return Array.from(this.#bots.values()).map((entry) => entry.bot as T)
  }

  size(): number {
    return this.#bots.size
  }

  clear(): void {
    this.#bots.clear()
    this.#disposers.clear()
  }
}