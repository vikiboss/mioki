export interface Attachment {
  readonly id?: string
  readonly url?: string
  readonly file?: string
  readonly data?: Uint8Array
  readonly mime?: string
  readonly size?: number
  readonly name?: string
}

export interface MessageSegment {
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
  readonly attachment?: Attachment
  isText(): boolean
  toString(): string
}

export interface SerializedMessageSegment {
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
  readonly attachment?: Attachment
}

export interface Message extends ReadonlyArray<MessageSegment> {
  toString(): string
  text(): string
  findByType<T extends MessageSegment = MessageSegment>(type: string): T | undefined
  filterByType<T extends MessageSegment = MessageSegment>(type: string): T[]
  toJSON(): SerializedMessageSegment[]
}

export type MessageInput = string | Message | MessageSegment | readonly (string | MessageSegment)[]

export interface MessageTarget {
  readonly type: string
  readonly id?: string
  readonly parent_id?: string
  readonly user_id?: string
  readonly group_id?: string
}

export interface SentMessage {
  readonly message_id?: string
  readonly sent_at?: number
}

export interface ReplyOptions {
  readonly quote?: boolean
}

export type ReplyArg = boolean | ReplyOptions

export interface ConversationRef {
  readonly type: string
  readonly id: string
  readonly parent_id?: string
}

export class MessageSegmentImpl implements MessageSegment {
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
  readonly attachment: Attachment | undefined
  constructor(type: string, data: Record<string, unknown>, attachment?: Attachment) {
    this.type = type
    this.data = Object.freeze({ ...data })
    this.attachment = attachment
  }

  isText(): boolean {
    return this.type === 'text'
  }

  toString(): string {
    if (this.type === 'text' && typeof this.data.text === 'string') return this.data.text
    return JSON.stringify({ type: this.type, data: this.data })
  }
}

class MessageImpl extends Array<MessageSegment> implements Message {
  constructor(segments: readonly MessageSegment[] | number) {
    super()
    if (typeof segments === 'number') {
      this.length = segments
      return
    }
    for (const seg of segments) this.push(seg)
  }

  toString(): string {
    return this.map((seg) => seg.toString()).join('')
  }

  text(): string {
    return this.filter((seg) => seg.type === 'text')
      .map((seg) => (typeof seg.data.text === 'string' ? seg.data.text : ''))
      .join('')
  }

  findByType<T extends MessageSegment = MessageSegment>(type: string): T | undefined {
    return this.find((seg): seg is T => seg.type === type)
  }

  filterByType<T extends MessageSegment = MessageSegment>(type: string): T[] {
    return this.filter((seg): seg is T => seg.type === type)
  }

  toJSON(): SerializedMessageSegment[] {
    return this.map((seg) => ({ type: seg.type, data: seg.data, attachment: seg.attachment }))
  }
}

export const createMessage = (segments: readonly MessageSegment[]): Message => new MessageImpl(segments)

export const segment = {
  text(text: string): MessageSegment {
    return new MessageSegmentImpl('text', { text })
  },
  at(target: string): MessageSegment {
    return new MessageSegmentImpl('at', { target })
  },
  image(file: string | Buffer, options: { local?: boolean } & Attachment = {}): MessageSegment {
    const { local = false, ...attachment } = options
    const data: Record<string, unknown> = {}
    if (Buffer.isBuffer(file)) {
      data.file = `base64://${file.toString('base64')}`
    } else if (local) {
      data.file = `file:///${file.replace(/^\s*(file:\/\/\/)+/, '')}`
    } else {
      data.url = file
    }
    const attrs = Object.keys(attachment).length > 0 ? attachment : undefined
    if (attrs) data.attachment = attrs
    return new MessageSegmentImpl('image', data, attrs)
  },
  reply(messageId: string): MessageSegment {
    return new MessageSegmentImpl('reply', { message_id: messageId })
  },
  raw(type: string, data: Record<string, unknown>, attachment?: Attachment): MessageSegment {
    return new MessageSegmentImpl(type, data, attachment)
  },
} as const

export const isMessage = (value: unknown): value is Message => value instanceof MessageImpl

export const isSegment = (value: unknown): value is MessageSegment =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as { type?: unknown }).type === 'string'

export const asMessage = (input: MessageInput): Message => {
  if (isMessage(input)) return input
  if (typeof input === 'string') return new MessageImpl([new MessageSegmentImpl('text', { text: input })])
  if (isSegment(input)) return new MessageImpl([input])
  return new MessageImpl(
    (input as readonly (string | MessageSegment)[]).map((item) =>
      typeof item === 'string' ? new MessageSegmentImpl('text', { text: item }) : item,
    ),
  )
}
