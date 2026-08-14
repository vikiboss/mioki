import type { Capability } from './capability'
import type { CapabilityTarget } from './types'
import type { CapabilityRegistry } from './registry'
import type { MessageInput, MessageTarget, SentMessage } from './message'

export interface Bot {
  readonly bot_id: string
  readonly adapter: string
  readonly nickname?: string
  readonly online: boolean
  readonly connected_at?: number

  sendMessage(target: MessageTarget, message: MessageInput): Promise<SentMessage>
  supports<I, O>(capability: Capability<I, O>): boolean
  invoke<I, O>(capability: Capability<I, O>, input: I): Promise<O>
  as<T extends object = Record<string, unknown>>(): T
}

export interface BotContext {
  readonly bot: Bot
  unregister(): void
}

export type CapabilityBot = Omit<Bot, 'supports' | 'invoke'>

export const bindCapabilities = <B extends CapabilityBot>(
  bot: B,
  registry: CapabilityRegistry,
): B & Pick<Bot, 'supports' | 'invoke'> => {
  const target: CapabilityTarget = { adapter: bot.adapter, bot_id: bot.bot_id }
  return Object.assign(bot, {
    supports: <I, O>(capability: Capability<I, O>): boolean => registry.supports(target, capability),
    invoke: <I, O>(capability: Capability<I, O>, input: I): Promise<O> => registry.invoke(target, capability, input),
  })
}
