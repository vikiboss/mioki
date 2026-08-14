import { isMessage, MessageSegmentImpl } from 'mioki'
import { segment as oneBotSegmentImpl } from 'napcat-sdk'

import type {
  Attachment,
  Message,
  MessageInput,
  MessageSegment,
  SentMessage,
} from 'mioki'

export interface OneBotSegment {
  text(text: string): MessageSegment
  at(qq: 'all' | string | number): MessageSegment
  image(file: string | Buffer, options?: Record<string, unknown>): MessageSegment
  reply(id: string): MessageSegment
  face(id: number): MessageSegment
  record(file: string, options?: Record<string, unknown>): MessageSegment
  video(file: string, options?: Record<string, unknown>): MessageSegment
  mface(options: Record<string, unknown>): MessageSegment
  bface(id: number): MessageSegment
  contact(type: 'qq' | 'group', id: string): MessageSegment
  poke(): MessageSegment
  music(platform: 'qq' | '163' | 'kugou' | 'migu' | 'kuwo', id: string): MessageSegment
  musicCustom(title: string, audio: string, url: string, options?: Record<string, unknown>): MessageSegment
  node(options: Record<string, unknown>): MessageSegment
  forward(id: string): MessageSegment
  json(data: string): MessageSegment
  file(file: string, options?: Record<string, unknown>): MessageSegment
  markdown(): MessageSegment
  lightapp(): MessageSegment
}

const toCoreSegment = (flat: { type: string; [key: string]: unknown }): MessageSegment => {
  const { type, ...data } = flat
  return new MessageSegmentImpl(type, data)
}

const wrapSegment = (
  fn: (...args: unknown[]) => { type: string; [key: string]: unknown },
): ((...args: unknown[]) => MessageSegment) =>
  (...args: unknown[]) => toCoreSegment(fn(...args))

export const segment: OneBotSegment = new Proxy(oneBotSegmentImpl, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver)
    if (typeof value === 'function') return wrapSegment(value as never)
    return value
  },
}) as unknown as OneBotSegment

export const oneBotSegment = segment

export interface SendNormalizedSegment {
  type: string
  data: Record<string, unknown>
}

const normalize = (item: string | MessageSegment): SendNormalizedSegment => {
  if (typeof item === 'string') return { type: 'text', data: { text: item } }
  const { type, data } = item
  let segData: Record<string, unknown>
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    segData = { ...data }
  } else {
    const flat = item as unknown as Record<string, unknown>
    segData = { ...flat }
    delete segData.type
  }
  delete (segData as Record<string, unknown>).attachment
  if (type === 'at' && 'qq' in segData) {
    return { type: 'at', data: { qq: String((segData as { qq: unknown }).qq) } }
  }
  return { type, data: segData }
}

export const buildPayload = (message: MessageInput): SendNormalizedSegment[] => {
  if (typeof message === 'string') return [{ type: 'text', data: { text: message } }]
  if (isMessage(message)) return Array.from(message).map(normalize)
  if (Array.isArray(message)) return Array.from(message).map(normalize)
  return [normalize(message as MessageSegment)]
}

export const sentFromOneBot = (data: { message_id?: number | string } | undefined): SentMessage => {
  if (!data) return {}
  if (data.message_id == null) return {}
  return { message_id: String(data.message_id) as SentMessage['message_id'] }
}

export const attachmentFromImageData = (data: Record<string, unknown>): Attachment | undefined => {
  const url = typeof data.url === 'string' ? data.url : undefined
  const file = typeof data.file === 'string' ? data.file : undefined
  if (!url && !file) return undefined
  return { url, file, name: typeof data.file_unique === 'string' ? data.file_unique : undefined }
}

export const stringifyMessage = (message: Message): string =>
  message
    .map((el) => {
      const d = el.data as Record<string, unknown>
      switch (el.type) {
        case 'text':
          return typeof d.text === 'string' ? d.text : ''
        case 'at':
          return `{at:${d.qq ?? d.target ?? ''}}`
        case 'face':
          return `{face:${d.id ?? ''}}`
        case 'image':
          return `{image:${d.file ?? ''},${d.url ?? ''}}`
        case 'json':
          return `{json:${d.data ?? ''}}`
        case 'rps':
        case 'dice':
          return `{dice:${d.result ?? ''}}`
        case 'file':
        case 'video':
        case 'record':
          return `{${el.type}:${d.url ?? ''}}`
        default:
          return `{${el.type}}`
      }
    })
    .join('')