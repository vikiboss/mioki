import type { BotId } from '../types'
import type { Capability } from './capability'
import type { AdapterName } from '../types'
import type { MessageInput, MessageTarget, SentMessage } from './message'

export interface Bot {
  readonly bot_id: BotId
  readonly adapter: AdapterName
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