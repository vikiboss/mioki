import { segment } from 'napcat-sdk'

import type {
  Attachment,
  Message,
  MessageInput,
  MessageSegment,
  SentMessage,
} from 'mioki'

export { segment }

export const napcatSegment = segment as unknown as {
  text(text: string): MessageSegment
  at(qq: 'all' | string | number): MessageSegment
  image(file: string | Buffer): MessageSegment
  reply(id: string): MessageSegment
  face(id: number): MessageSegment
  record(file: string): MessageSegment
  video(file: string): MessageSegment
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

export interface SendNormalizedSegment {
  type: string
  data: Record<string, unknown>
}

const normalize = (item: MessageSegment): SendNormalizedSegment => {
  const { type, data } = item
  if (type === 'at' && 'qq' in data) {
    return { type: 'at', data: { qq: String((data as { qq: unknown }).qq) } }
  }
  return { type, data: { ...data } }
}

export const buildPayload = (message: MessageInput): SendNormalizedSegment[] => {
  if (typeof message === 'string') return [{ type: 'text', data: { text: message } }]
  if (Array.isArray(message)) return message.map(normalize)
  const seg = message as MessageSegment
  if (seg && typeof (seg as { type?: unknown }).type === 'string') return [normalize(seg)]
  return Array.from(message).map(normalize)
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