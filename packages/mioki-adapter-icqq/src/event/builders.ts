import { atOf, buildRoutes, createFriendRef, createGroupRef, messageRecall } from 'mioki'
import type { Bot, ConversationRef, EventIdentity, MessageEvent, NoticeEvent, RequestEvent, SenderInfo } from 'mioki'
import type {
  DiscussMessageEvent,
  FriendRequestEvent,
  GroupInviteEvent,
  GroupMessageEvent,
  GroupRequestEvent,
  PrivateMessageEvent,
} from 'mioki-adapter-icqq/vendor/icqq'
import { fromIcqqMessage, toIcqqMessage } from '../message'

type IcqqMessageEvent = PrivateMessageEvent | GroupMessageEvent | DiscussMessageEvent

const id = (value: number | string | undefined): string | undefined => (value == null ? undefined : String(value))
const identity = (bot: Bot, eventType: string, messageId?: string, time?: number, native?: string): EventIdentity => ({
  adapter: bot.adapter,
  bot_id: bot.bot_id,
  event_type: eventType,
  message_id: messageId,
  timestamp: time ? time * 1000 : undefined,
  native_event_id: native,
})

const senderOf = (sender: IcqqMessageEvent['sender']): SenderInfo => ({
  user_id: String(sender.user_id),
  nickname: sender.nickname,
  card: 'card' in sender && typeof sender.card === 'string' ? sender.card : undefined,
  role: 'role' in sender && typeof sender.role === 'string' ? sender.role : undefined,
})

export const buildMessageEvent = (bot: Bot, event: IcqqMessageEvent): MessageEvent => {
  const isGroup = event.message_type === 'group'
  const userId = String(event.sender.user_id)
  const groupId = isGroup ? String((event as GroupMessageEvent).group_id) : undefined
  const message = fromIcqqMessage(event.message, event.raw_message)
  const target = isGroup ? { type: 'group', group_id: groupId } : { type: 'private', user_id: userId }
  return {
    kind: 'message',
    type: 'message',
    routes: buildRoutes(bot.adapter, 'message', event.message_type, 'sub_type' in event ? event.sub_type : undefined),
    identity: identity(bot, `message.${event.message_type}`, event.message_id, event.time),
    self_id: bot.bot_id,
    bot,
    time: event.time * 1000,
    raw: event,
    message_type: event.message_type,
    user_id: userId,
    group_id: groupId,
    group_name: isGroup ? (event as GroupMessageEvent).group_name : undefined,
    message_id: event.message_id,
    raw_message: event.raw_message,
    sender: senderOf(event.sender),
    group: isGroup ? createGroupRef(bot, groupId!, (event as GroupMessageEvent).group_name) : undefined,
    friend: !isGroup ? createFriendRef(bot, userId, event.sender.nickname) : undefined,
    conversation: { type: isGroup ? 'group' : 'private', id: isGroup ? groupId! : userId } satisfies ConversationRef,
    message,
    is_to_me: isGroup ? (event as GroupMessageEvent).atme : false,
    at: atOf(message),
    reply: async (input, options) => {
      const quote = typeof options === 'boolean' ? options : options?.quote
      if ('reply' in event) {
        const sent = await event.reply(toIcqqMessage(input), quote)
        return { message_id: sent.message_id, sent_at: sent.time * 1000 }
      }
      return bot.sendMessage(target, input)
    },
    recall: async () => {
      await bot.invoke(messageRecall, { message_id: event.message_id })
    },
  }
}

export const buildNoticeEvent = (bot: Bot, event: Record<string, unknown>): NoticeEvent => ({
  kind: 'notice',
  type: 'notice',
  routes: buildRoutes(bot.adapter, 'notice', String(event.notice_type ?? 'unknown'), id(event.sub_type as string | undefined)),
  identity: identity(bot, `notice.${String(event.notice_type ?? 'unknown')}`, undefined, Number(event.time)),
  self_id: bot.bot_id,
  bot,
  time: Number(event.time) * 1000,
  raw: event,
  notice_type: String(event.notice_type ?? ''),
  sub_type: id(event.sub_type as string | undefined),
  user_id: id(event.user_id as number | undefined),
  group_id: id(event.group_id as number | undefined),
  operator_id: id(event.operator_id as number | undefined),
})

export const buildRequestEvent = (
  bot: Bot,
  event: FriendRequestEvent | GroupRequestEvent | GroupInviteEvent,
  respond: (yes: boolean, reason?: string) => Promise<boolean>,
): RequestEvent => ({
  kind: 'request',
  type: 'request',
  routes: buildRoutes(bot.adapter, 'request', event.request_type, event.sub_type),
  identity: identity(bot, `request.${event.request_type}`, undefined, event.time, event.flag),
  self_id: bot.bot_id,
  bot,
  time: event.time * 1000,
  raw: event,
  request_type: event.request_type,
  sub_type: event.sub_type,
  user_id: String(event.user_id),
  group_id: 'group_id' in event ? String(event.group_id) : undefined,
  flag: event.flag,
  comment: 'comment' in event ? event.comment : undefined,
  approve: async () => {
    await respond(true)
  },
  reject: async (reason) => {
    await respond(false, reason)
  },
})

export { toIcqqMessage }
