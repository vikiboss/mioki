import { asMessage, atOf, createFriendRef, createGroupRef, createMessage, MessageSegmentImpl, messageRecall } from 'mioki'
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
  SenderInfo,
  Bot,
} from 'mioki'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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

export const buildSegments = (raw: unknown[], rawMessage?: string): Message => {
  const segments = raw
    .filter((entry): entry is Record<string, unknown> & { type: string } => isObject(entry) && typeof entry.type === 'string')
    .filter((entry) => entry.type !== 'reply')
    .map((entry) => {
      const rawData = isObject(entry.data) ? (entry.data as Record<string, unknown>) : {}
      const data = { ...rawData }
      const attachment = buildAttachment(data)
      return new MessageSegmentImpl(entry.type, data, attachment)
    })
  return createMessage(segments, rawMessage)
}

const buildRoutes = (adapter: string, ...parts: (string | undefined | null)[]): string[] => {
  const cleaned = parts.filter((p): p is string => typeof p === 'string' && p.length > 0)
  const routes: string[] = []
  const platformParts = [adapter, ...cleaned]
  for (let length = platformParts.length; length > 0; length--) {
    const [head, ...rest] = platformParts.slice(0, length)
    routes.push(rest.length > 0 ? `${head}:${rest.join('.')}` : head)
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
  adapter: string
  bot_id?: string
  event_type: string
  message_id?: string | number
  timestamp?: number
  native_event_id?: string
}): EventIdentity => ({
  adapter: params.adapter,
  bot_id: params.bot_id,
  event_type: params.event_type,
  message_id: typeof params.message_id === 'string' || typeof params.message_id === 'number'
    ? String(params.message_id)
    : undefined,
  timestamp: params.timestamp,
  native_event_id: params.native_event_id,
})

export const buildMessageEvent = (params: {
  adapter: string
  bot: Bot
  data: Record<string, unknown> & {
    post_type: 'message'
    message_type: 'private' | 'group'
    message_id: number | string
    message?: unknown[]
    raw_message?: string
    user_id: number | string
    group_id?: number | string
    group_name?: string
    sender: Record<string, unknown> & { user_id: number | string; nickname?: string; card?: string; role?: string }
    sub_type?: string
    target_id?: number | string
    quote_id?: string | null
    time: number
  }
}): MessageEvent => {
  const { adapter, bot, data } = params
  const message = buildSegments(Array.isArray(data.message) ? data.message : [], data.raw_message)
  const messageId = String(data.message_id) as string
  const userId = String(data.user_id) as string
  const groupId = typeof data.group_id === 'number' || typeof data.group_id === 'string'
    ? (String(data.group_id) as string)
    : undefined
  const isGroup = data.message_type === 'group'
  const routes = buildRoutes(adapter, 'message', data.message_type, data.sub_type)
  const conversation: ConversationRef | undefined = isGroup && groupId
    ? { type: 'group', id: groupId }
    : { type: 'private', id: userId }
  const sender: SenderInfo | undefined = isObject(data.sender)
    ? {
        user_id: String(data.sender.user_id ?? '') as string,
        nickname: typeof data.sender.nickname === 'string' ? data.sender.nickname : undefined,
        card: typeof data.sender.card === 'string' ? data.sender.card : undefined,
        role: typeof data.sender.role === 'string' ? (data.sender.role as SenderInfo['role']) : undefined,
      }
    : undefined
  const quoteId = typeof data.quote_id === 'string' || typeof data.quote_id === 'number'
    ? String(data.quote_id)
    : undefined
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
    group_name: typeof data.group_name === 'string' ? data.group_name : undefined,
    message_id: messageId,
    raw_message: message.raw_message,
    quote_id: quoteId,
    sender,
    group: isGroup && groupId ? createGroupRef(bot, groupId, data.group_name) : undefined,
    friend: !isGroup && userId ? createFriendRef(bot, userId, sender?.nickname) : undefined,
    conversation,
    message,
    is_to_me: typeof data.target_id === 'number' || typeof data.target_id === 'string'
      ? String(data.target_id) === String(bot.bot_id)
      : false,
    at: atOf(message),
    reply: async (input, options) => {
      const replyOptions = isGroup
        ? ({ type: 'group', group_id: groupId } as const)
        : ({ type: 'private', user_id: userId } as const)
      const opts = typeof options === 'boolean' ? { quote: options } : options
      let content = input
      if (opts?.quote && messageId) {
        content = [segment.reply(messageId), ...asMessage(input)]
      }
      const sent = await bot.sendMessage(replyOptions, content)
      return sent
    },
    recall: async () => {
      if (!bot.supports(messageRecall)) {
        throw new Error('message.recall is not supported on this bot')
      }
      await bot.invoke(messageRecall, { message_id: messageId })
    },
  }
}

export const buildNoticeEvent = (params: {
  adapter: string
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
    ? (String(data.user_id) as string)
    : undefined
  const groupId = typeof data.group_id === 'number' || typeof data.group_id === 'string'
    ? (String(data.group_id) as string)
    : undefined
  const operatorId = typeof data.operator_id === 'number' || typeof data.operator_id === 'string'
    ? (String(data.operator_id) as string)
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
  adapter: string
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
  const userId = String(data.user_id) as string
  const groupId = typeof data.group_id === 'number' || typeof data.group_id === 'string'
    ? (String(data.group_id) as string)
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
    flag,
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
  adapter: string
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
