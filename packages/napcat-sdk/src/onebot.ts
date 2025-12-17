type PostType = 'meta_event' | 'message'

type EventBase<T extends PostType, U extends object> = U & {
  time: number
  self_id: number
  post_type: T
}

type MetaEventType = 'heartbeat' | 'lifecycle'

type MetaEventBase<T extends MetaEventType, U extends object> = U & EventBase<'meta_event', { meta_event_type: T }>

type MetaEvent =
  | MetaEventBase<'heartbeat', { status: { online: boolean; good: boolean }; interval: number }>
  | MetaEventBase<'lifecycle', { sub_type: 'connect' | 'disconnect' }>

type MessageType = 'private' | 'group'

type MessageEventBase<T extends MessageType, U extends object> = U &
  EventBase<
    'message',
    {
      message_type: T
      message_seq: number
      real_id: number
      real_seq: number
      raw_message: string
      message: any[]
    }
  >

type MessageEvent =
  | MessageEventBase<
      'private',
      {
        user_id: number
        message: string
        sub_type: 'friend'
        target_id: number
        sender: {
          user_id: number
          nickname: string
        }
      }
    >
  | MessageEventBase<
      'group',
      {
        group_id: number
        group_name: string
        user_id: number
        message: string
        sub_type: 'normal'
        sender: {
          user_id: number
          nickname: string
          card: string
          role: 'owner' | 'admin' | 'member'
        }
      }
    >

export interface OneBotEventMap {
  meta_event: MetaEvent
  message: MessageEvent
}
