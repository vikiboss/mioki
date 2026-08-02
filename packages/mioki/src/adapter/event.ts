import type {
  Attachment,
  ConversationRef,
  Message,
  MessageInput,
  MessageTarget,
  ReplyOptions,
  SentMessage,
} from './message'

export interface EventIdentity {
  readonly adapter: string
  readonly bot_id?: string
  readonly source_id?: string
  readonly event_type: string
  readonly message_id?: string
  readonly timestamp?: number
  readonly native_event_id?: string
  readonly fingerprint?: string
}

export interface EventBase {
  readonly kind: string
  readonly type: string
  readonly routes: readonly string[]
  readonly identity: EventIdentity
  readonly self_id?: string
  readonly bot?: import('./bot').Bot
  readonly time?: number
  readonly raw?: unknown
}

export interface BotEventBase extends EventBase {
  readonly self_id: string
  readonly bot: import('./bot').Bot
}

export interface SenderInfo {
  readonly user_id?: string
  readonly nickname?: string
  readonly card?: string
  readonly role?: 'owner' | 'admin' | 'member' | (string & {})
}

export interface MessageEvent extends BotEventBase {
  readonly kind: 'message'
  readonly message_type: 'private' | 'group' | 'channel' | 'thread' | 'direct' | (string & {})
  readonly user_id?: string
  readonly group_id?: string
  readonly group_name?: string
  readonly message_id?: string
  readonly raw_message?: string
  readonly quote_id?: string
  readonly sender?: SenderInfo
  readonly group?: import('../capabilities/group').Group
  readonly friend?: import('../capabilities/friend').Friend
  readonly conversation?: ConversationRef
  readonly message: Message
  readonly is_to_me?: boolean
  readonly at?: string
  reply(message: MessageInput, options?: boolean | ReplyOptions): Promise<SentMessage>
  recall(): Promise<void>
}

export interface NoticeEvent extends BotEventBase {
  readonly kind: 'notice'
  readonly notice_type?: string
  readonly sub_type?: string
  readonly user_id?: string
  readonly group_id?: string
  readonly operator_id?: string
}

export interface RequestEvent extends BotEventBase {
  readonly kind: 'request'
  readonly request_type?: string
  readonly sub_type?: string
  readonly user_id?: string
  readonly group_id?: string
  readonly flag?: string
  readonly comment?: string
  approve(): Promise<void>
  reject(reason?: string): Promise<void>
}

export interface MetaEvent extends BotEventBase {
  readonly kind: 'meta_event'
  readonly meta_event_type?: string
  readonly sub_type?: string
}

export interface AdapterEvent extends EventBase {
  readonly kind: 'adapter'
  readonly payload: unknown
}

export type Event = MessageEvent | NoticeEvent | RequestEvent | MetaEvent | AdapterEvent

export type BotEvent = MessageEvent | NoticeEvent | RequestEvent | MetaEvent

export const isMessageEvent = (e: Event): e is MessageEvent => e.kind === 'message'
export const isNoticeEvent = (e: Event): e is NoticeEvent => e.kind === 'notice'
export const isRequestEvent = (e: Event): e is RequestEvent => e.kind === 'request'
export const isMetaEvent = (e: Event): e is MetaEvent => e.kind === 'meta_event'
export const isAdapterEvent = (e: Event): e is AdapterEvent => e.kind === 'adapter'
export const isBotEvent = (e: Event): e is BotEvent =>
  e.kind === 'message' || e.kind === 'notice' || e.kind === 'request' || e.kind === 'meta_event'

export const routesFor = (event: Event): readonly string[] => event.routes

export interface EventFactoryOptions<T extends MessageEvent | NoticeEvent | RequestEvent | MetaEvent | AdapterEvent> {
  readonly routes: readonly string[]
  readonly identity: EventIdentity
  readonly bot?: import('./bot').Bot
  readonly self_id?: string
  readonly time?: number
  readonly raw?: unknown
}

export const buildRoutes = (segments: readonly string[]): string[] => {
  const routes: string[] = []
  for (let length = segments.length; length > 0; length--) {
    const route = segments.slice(0, length).join('.')
    if (route) routes.push(route)
  }
  return routes
}

export const dedupeRoutes = (routes: readonly string[]): string[] => Array.from(new Set(routes))

export type { Attachment, ConversationRef, Message, MessageInput, MessageTarget, ReplyOptions, SentMessage }
