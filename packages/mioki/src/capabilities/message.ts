import { defineCapability } from '../adapter'
import type { MessageInput, MessageTarget, SentMessage } from '../adapter'

export interface MessageSendRequest {
  readonly target: MessageTarget
  readonly message: MessageInput
}

export interface MessageRecallRequest {
  readonly message_id: string
}

export const messageSend = defineCapability<MessageSendRequest, SentMessage>('message.send', 1)
export const messageRecall = defineCapability<MessageRecallRequest, void>('message.recall', 1)