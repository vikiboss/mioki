import { asMessage, asMessageId, createMessage, MessageSegmentImpl } from 'mioki'
import { segment } from './message'

import type {
  Attachment,
  ConversationRef,
  EventIdentity,
  Message,
  MessageEvent,
  MetaEvent,
  NoticeEvent,
  RequestEvent,
  BotId,
  MessageId,
  UserId,
  GroupId,
  AdapterName,
  Bot,
} from 'mioki'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toId = (value: unknown, brand: 'UserId' | 'GroupId' | 'MessageId'): string => String(value ?? '') as never

const TEXT_DECODER = new TextDecoder()

const decodeBytes = (value: string | Uint8Array): string => {
  if (typeof value === 'string') return value
  return TEXT_DECODER.decode(value)
}

const buildAttachment = (data: Record<string, unknown>): Attachment | undefined => {
  const url = typeof data.url === 'string' ? data.url : undefined
  const file = typeof data.file === 'string' ? data.file : undefined
  const name = typeof data.file_unique === 'string' ? data.file_unique : undefined
  const fileSize = typeof data.file_size === 'string' ? Number(data.file_size) : undefined
  if (!url && !file) return undefined
  const attachment: Attachment = { url, file, name }
  if (typeof fileSize === 'number' && Number.isFinite(fileSize)) {
    return { ...attachment, size: fileSize }
  }
  return attachment
}

export const buildSegments = (raw: unknown[]): Message => {
  const segments = raw
    .filter((entry): entry is Record<string, unknown> & { type: string } => isObject(entry) && typeof entry.type === 'string')
    .filter((entry) => entry.type !== 'reply')
    .map((entry) => {
      const rawData = isObject(entry.data) ? (entry.data as Record<string, unknown>) : {}
      const data = { ...rawData }
      const attachment = buildAttachment(data)
      return new MessageSegmentImpl(entry.type, data, attachment)
    })
  return createMessage(segments)
}

const buildRoutes = (adapter: AdapterName, ...parts: (string | undefined | null)[]): string[] => {
  const cleaned = parts.filter((p): p is string => typeof p === 'string' && p.length > 0)
  const routes: string[] = []
  const platformParts = [`adapter:${adapter}`, ...cleaned]
  for (let length = platformParts.length; length > 0; length--) {
    routes.push(platformParts.slice(0, length).join('.'))
  }
  for (let length = cleaned.length; length > 0; length--) {
    routes.push(cleaned.slice(0, length).join('.'))
  }
  return Array.from(new Set(routes))
}

export interface OneBotEventLike {
  readonly raw: unknown
  readonly post_type?: string
}

const buildIdentity = (params: {
  adapter: AdapterName
  bot_id?: BotId
  event_type: string
  message_id?: string | number
  timestamp?: number
  native_event_id?: string
}): EventIdentity => ({
  adapter: params.adapter,
  bot_id: params.bot_id,
  event_type: params.event_type,
  message_id: typeof params.message_id === 'string' || typeof params.message_id === 'number'
    ? asMessageId(params.message_id)
    : undefined,
  timestamp: params.timestamp,
  native_event_id: params.native_event_id,
})

export const buildMessageEvent = (params: {
  adapter: AdapterName
  bot: Bot
  data: Record<string, unknown> & {
    post_type: 'message'
    message_type: 'private' | 'group'
    message_id: number | string
    message?: unknown[]
    raw_message?: string
    user_id: number | string
    group_id?: number | string
    sender: Record<string, unknown> & { user_id: number | string; nickname?: string }
    sub_type?: string
    target_id?: number | string
    quote_id?: string | null
    time: number
  }
}): MessageEvent => {
  const { adapter, bot, data } = params
  const message = buildSegments(Array.isArray(data.message) ? data.message : [])
  const messageId = String(data.message_id) as MessageId
  const userId = String(data.user_id) as UserId
  const groupId = typeof data.group_id === 'number' || typeof data.group_id === 'string'
    ? (String(data.group_id) as GroupId)
    : undefined
  const isGroup = data.message_type === 'group'
  const routes = buildRoutes(adapter, 'message', data.message_type, data.sub_type)
  const conversation: ConversationRef | undefined = isGroup && groupId
    ? { type: 'group', id: groupId }
    : { type: 'private', id: userId }
  const senderInfo = data.sender
  return {
    kind: 'message',
    type: 'message',
    routes,
    identity: buildIdentity({
      adapter,
      bot_id: bot.bot_id,
      event_type: isGroup ? 'message.group' : 'message.private',
      message_id: messageId,
      timestamp: data.time ? data.time * 1000 : undefined,
    }),
    self_id: bot.bot_id,
    bot,
    time: data.time ? data.time * 1000 : undefined,
    raw: data,
    message_type: data.message_type,
    user_id: userId,
    group_id: groupId,
    message_id: messageId,
    conversation,
    message,
    is_to_me: typeof data.target_id === 'number' || typeof data.target_id === 'string'
      ? String(data.target_id) === String(bot.bot_id)
      : false,
    reply: async (input, options) => {
      const replyOptions = isGroup
        ? ({ type: 'group', group_id: groupId } as const)
        : ({ type: 'private', user_id: userId } as const)
      let content = input
      if (options?.quote && messageId) {
        content = [segment.reply(messageId), ...asMessage(input)]
      }
      const sent = await bot.sendMessage(replyOptions, content)
      return sent
    },
  }
}

export const buildNoticeEvent = (params: {
  adapter: AdapterName
  bot: Bot
  data: Record<string, unknown> & {
    post_type: 'notice'
    notice_type: string
    sub_type?: string
    user_id?: number | string
    group_id?: number | string
    operator_id?: number | string
    time: number
  }
}): NoticeEvent => {
  const { adapter, bot, data } = params
  const userId = typeof data.user_id === 'number' || typeof data.user_id === 'string'
    ? (String(data.user_id) as UserId)
    : undefined
  const groupId = typeof data.group_id === 'number' || typeof data.group_id === 'string'
    ? (String(data.group_id) as GroupId)
    : undefined
  const operatorId = typeof data.operator_id === 'number' || typeof data.operator_id === 'string'
    ? (String(data.operator_id) as UserId)
    : undefined
  const routes = buildRoutes(adapter, 'notice', data.notice_type, data.sub_type)
  return {
    kind: 'notice',
    type: 'notice',
    routes,
    identity: buildIdentity({
      adapter,
      bot_id: bot.bot_id,
      event_type: `notice.${data.notice_type}`,
      timestamp: data.time ? data.time * 1000 : undefined,
    }),
    self_id: bot.bot_id,
    bot,
    time: data.time ? data.time * 1000 : undefined,
    raw: data,
    notice_type: data.notice_type,
    sub_type: data.sub_type,
    user_id: userId,
    group_id: groupId,
    operator_id: operatorId,
  }
}

export const buildRequestEvent = (params: {
  adapter: AdapterName
  bot: Bot
  api: (action: string, params?: Record<string, unknown>) => Promise<unknown>
  data: Record<string, unknown> & {
    post_type: 'request'
    request_type: 'friend' | 'group'
    user_id: number | string
    group_id?: number | string
    sub_type?: string
    comment?: string
    flag: string
    time: number
  }
}): RequestEvent => {
  const { adapter, bot, api, data } = params
  const userId = String(data.user_id) as UserId
  const groupId = typeof data.group_id === 'number' || typeof data.group_id === 'string'
    ? (String(data.group_id) as GroupId)
    : undefined
  const flag = String(data.flag)
  const routes = buildRoutes(adapter, 'request', data.request_type, data.sub_type)
  const action = data.request_type === 'friend' ? 'set_friend_add_request' : 'set_group_add_request'
  return {
    kind: 'request',
    type: 'request',
    routes,
    identity: buildIdentity({
      adapter,
      bot_id: bot.bot_id,
      event_type: `request.${data.request_type}`,
      timestamp: data.time ? data.time * 1000 : undefined,
      native_event_id: flag,
    }),
    self_id: bot.bot_id,
    bot,
    time: data.time ? data.time * 1000 : undefined,
    raw: data,
    request_type: data.request_type,
    sub_type: data.sub_type,
    user_id: userId,
    group_id: groupId,
    flag: flag as import('mioki').RequestId,
    comment: typeof data.comment === 'string' ? data.comment : undefined,
    approve: async () => {
      await api(action, { flag, approve: true })
    },
    reject: async (reason) => {
      await api(action, { flag, approve: false, reason })
    },
  }
}

export const buildMetaEvent = (params: {
  adapter: AdapterName
  bot: Bot
  data: Record<string, unknown> & {
    post_type: 'meta_event'
    meta_event_type: string
    sub_type?: string
    time: number
  }
}): MetaEvent => {
  const { adapter, bot, data } = params
  const routes = buildRoutes(adapter, 'meta_event', data.meta_event_type, data.sub_type)
  return {
    kind: 'meta_event',
    type: 'meta_event',
    routes,
    identity: buildIdentity({
      adapter,
      bot_id: bot.bot_id,
      event_type: `meta_event.${data.meta_event_type}`,
      timestamp: data.time ? data.time * 1000 : undefined,
    }),
    self_id: bot.bot_id,
    bot,
    time: data.time ? data.time * 1000 : undefined,
    raw: data,
    meta_event_type: data.meta_event_type,
    sub_type: data.sub_type,
  }
}

export const decodeWsMessage = (data: string | Uint8Array): unknown => {
  const text = decodeBytes(data)
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
