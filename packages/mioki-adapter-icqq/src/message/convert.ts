import {
  createMessage,
  MessageSegmentImpl,
  isMessage,
  type Message,
  type MessageInput,
  type MessageSegment,
} from 'mioki'
import { segment as icqqSegment, type MessageElem, type Sendable } from 'mioki-adapter-icqq/vendor/icqq'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const attachment = (data: Record<string, unknown>) => {
  const url = typeof data.url === 'string' ? data.url : undefined
  const file = typeof data.file === 'string' ? data.file : undefined
  return url || file ? { url, file, name: typeof data.name === 'string' ? data.name : undefined } : undefined
}

export const fromIcqqMessage = (elements: readonly MessageElem[], raw?: string): Message =>
  createMessage(
    elements.map((element) => {
      const { type, ...data } = element as unknown as { type: string; [key: string]: unknown }
      return new MessageSegmentImpl(type, data, attachment(data))
    }),
    raw,
  )

const str = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined)

const num = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(n) ? n : fallback
}

const toIcqqElement = (segment: MessageSegment): MessageElem | string => {
  const data = isRecord(segment.data) ? segment.data : {}
  switch (segment.type) {
    case 'text':
      return typeof data.text === 'string' ? data.text : ''
    case 'at':
      return icqqSegment.at(String(data.target ?? data.qq ?? ''))
    case 'face':
      return icqqSegment.face(num(data.id))
    case 'image':
      return icqqSegment.image(String(data.file ?? data.url ?? ''))
    case 'record':
      return icqqSegment.record(String(data.file ?? data.url ?? ''))
    case 'video':
      return icqqSegment.video(String(data.file ?? data.url ?? ''))
    case 'flash':
      return icqqSegment.flash(String(data.file ?? data.url ?? ''))
    case 'json':
      return icqqSegment.json(data.data ?? data)
    case 'xml':
      return icqqSegment.xml(String(data.data ?? ''))
    case 'poke':
      return icqqSegment.poke(num(data.id))
    case 'dice':
      return icqqSegment.dice(num(data.id))
    case 'rps':
      return icqqSegment.rps(num(data.id))
    case 'markdown':
      return icqqSegment.markdown(String(data.content ?? data.text ?? ''))
    case 'button': {
      const content = isRecord(data.content) ? data.content : { rows: data.content }
      return icqqSegment.button(content as never)
    }
    case 'share':
    case 'music':
      return icqqSegment.share(
        String(data.url ?? ''),
        String(data.title ?? data.name ?? ''),
        str(data.image),
        str(data.content ?? data.summary),
        str(data.audio),
      )
    case 'location':
      return icqqSegment.location(num(data.lat), num(data.lng), String(data.address ?? ''), str(data.id))
    case 'bface':
      return icqqSegment.bface(String(data.file ?? ''), String(data.text ?? ''))
    case 'sface':
      return icqqSegment.sface(num(data.id), str(data.text))
    case 'mirai':
      return icqqSegment.mirai(String(data.data ?? data.content ?? ''))
    case 'node':
    case 'forward': {
      const message = toIcqqMessage(data.message as MessageInput)
      return icqqSegment.node(num(data.user_id), message, str(data.nickname), num(data.time))
    }
    case 'file':
      return {
        type: 'file',
        file: String(data.file ?? ''),
        name: str(data.name),
      } as unknown as MessageElem
    case 'reply':
      return ''
    default:
      return typeof segment.toString === 'function' ? segment.toString() : ''
  }
}

export const toIcqqMessage = (message: MessageInput): Sendable => {
  if (typeof message === 'string') return message
  const segments = isMessage(message) ? Array.from(message) : Array.isArray(message) ? message : [message]
  return segments.map((item) => (typeof item === 'string' ? item : toIcqqElement(item)))
}

export const replyIdOf = (message: MessageInput): string | undefined => {
  const segments = isMessage(message) ? Array.from(message) : Array.isArray(message) ? message : [message]
  const reply = segments.find((item): item is MessageSegment => typeof item !== 'string' && item.type === 'reply')
  const id = reply && isRecord(reply.data) ? reply.data.message_id : undefined
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined
}

export const buildSentMessage = (event: { message_id?: string; time?: number }) => ({
  message_id: event.message_id,
  sent_at: event.time ? event.time * 1000 : undefined,
})
