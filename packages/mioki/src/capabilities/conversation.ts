import { defineCapability } from '../adapter'
import type { MessageTarget } from '../adapter'
import type { MessageId } from '../types'

export interface HistoryMessage {
  readonly message_id: MessageId
  readonly time?: number
  readonly message: import('../adapter').Message
}

export interface ConversationGetHistoryRequest {
  readonly target: MessageTarget
  /** 从这个消息 id 之前开始取（不含该条） */
  readonly before?: MessageId
  readonly limit?: number
}

export const conversationGetHistory = defineCapability<ConversationGetHistoryRequest, HistoryMessage[]>(
  'conversation.gethistory',
  1,
)
