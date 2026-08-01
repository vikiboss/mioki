import { defineCapability } from '../adapter'
import type { MessageId } from '../types'

export interface MessageReactionRequest {
  readonly message_id: MessageId
  readonly reaction_id: string
  readonly set: boolean
}

export const messageReaction = defineCapability<MessageReactionRequest, void>('message.reaction', 1)