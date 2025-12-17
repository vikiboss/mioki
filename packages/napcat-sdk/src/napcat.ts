import crypto from 'node:crypto'
import mitt from 'mitt'
import pkg from '../package.json' with { type: 'json' }
import { segment } from './segment'
import { CONSOLE_LOGGER, ABSTRACT_LOGGER } from './logger'
import { NAPCAT_NOTICE_EVENT_MAP, NAPCAT_NOTICE_NOTIFY_MAP } from './onebot'

import type { Emitter } from 'mitt'
import type { Logger } from './logger'
import type { EventMap, MiokiOptions, OptionalProps } from './types'
import type {
  API,
  Friend,
  Group,
  GroupMessageEvent,
  NormalizedElementToSend,
  PrivateMessageEvent,
  Sendable,
} from './onebot'

export const name = pkg.name
export const version = pkg.version

export { CONSOLE_LOGGER, ABSTRACT_LOGGER, pkg as PKG }

export const DEFAULT_NAPCAT_OPTIONS = {
  protocol: 'ws',
  host: 'localhost',
  port: 3333,
  logger: ABSTRACT_LOGGER,
} satisfies Required<OptionalProps<MiokiOptions>>

export class NapCat {
  #ws: WebSocket | null = null
  #event: Emitter<EventMap & Record<string | symbol, unknown>> = mitt()
  #echoEvent: Emitter<Record<string, unknown>> = mitt()

  constructor(private readonly options: MiokiOptions) {}

  get #config(): Required<MiokiOptions> {
    return {
      protocol: this.options.protocol || DEFAULT_NAPCAT_OPTIONS.protocol,
      host: this.options.host || DEFAULT_NAPCAT_OPTIONS.host,
      port: this.options.port || DEFAULT_NAPCAT_OPTIONS.port,
      logger: this.options.logger || DEFAULT_NAPCAT_OPTIONS.logger,
      token: this.options.token,
    }
  }

  get ws(): WebSocket {
    if (!this.#ws) {
      this.logger.error('WebSocket is not connected.')
      throw new Error('WebSocket is not connected.')
    }

    return this.#ws
  }

  get logger(): Logger {
    return this.#config.logger
  }

  get segment(): typeof segment {
    return segment
  }

  #echoId() {
    return crypto.randomBytes(16).toString('hex')
  }

  #buildWsUrl(): string {
    return `${this.#config.protocol}://${this.#config.host}:${this.#config.port}?access_token=${this.#config.token}`
  }

  #wrapReply(sendable: Sendable | Sendable[], message_id?: number, reply?: boolean): Sendable[] {
    const sendableList = typeof sendable === 'string' ? [sendable] : [sendable].flat()

    if (reply && message_id) {
      return [segment.reply(String(message_id)), ...sendableList]
    }

    return sendableList
  }

  #ensureWsConnection(ws: WebSocket | null): asserts ws is WebSocket {
    if (!ws) {
      this.logger.error('WebSocket is not connected.')
      throw new Error('WebSocket is not connected.')
    }

    if (ws.readyState !== WebSocket.OPEN) {
      this.logger.error('WebSocket is not open.')
      throw new Error('WebSocket is not open.')
    }
  }

  #normalizeSendable(msg: Sendable | Sendable[]): NormalizedElementToSend[] {
    return [msg].flat(2).map((item) => {
      if (typeof item === 'string') {
        return { type: 'text', data: { text: item } }
      }
      if (item.type === 'at') {
        return { type: 'at', data: { qq: String(item.qq) } }
      }
      const { type, ...data } = item
      return { type, data } as NormalizedElementToSend
    })
  }

  #waitForAction<T extends any>(echoId: string) {
    const eventName = `echo#${echoId}`

    return new Promise<T>((resolve, reject) => {
      const handle = (data: any) => {
        if (!data || data.echo !== echoId) return

        this.#echoEvent.off(eventName, handle)

        if (data.retcode === 0) {
          resolve(data.data as T)
        } else {
          reject(`Server Error: ${data.message}`)
        }
      }

      this.#echoEvent.on(eventName, handle)
    })
  }

  #buildGroup(group_id: number, group_name: string = ''): Group {
    return {
      group_id,
      group_name,
      doSign: () => this.api('set_group_sign', { group_id }),
      getMemberList: async () => this.api('get_group_member_list', { group_id }),
      getMemberInfo: (user_id: number) => this.api('get_group_member_info', { group_id, user_id }),
      setTitle: (title: string) => this.api('set_group_special_title', { group_id, title }),
      setCard: (user_id: number, card: string) => this.api('set_group_card', { group_id, user_id, card }),
      addEssence: (message_id: string) => this.api('set_essence_msg', { message_id }),
      delEssence: (message_id: string) => this.api('delete_essence_msg', { message_id }),
      recall: (message_id: number) => this.api('delete_msg', { message_id }),
      banMember: (user_id: number, duration: number) => this.api('set_group_ban', { group_id, user_id, duration }),
      sendMsg: (sendable: Sendable | Sendable[]) => this.sendGroupMsg(group_id, sendable),
    }
  }

  #buildFriend(user_id: number, nickname: string = ''): Friend {
    return {
      user_id,
      nickname,
      delete: (block?: boolean, both?: boolean) =>
        this.api('delete_friend', { user_id, temp_block: block, temp_both_del: both }),
      sendMsg: (sendable: Sendable | Sendable[]) => this.sendPrivateMsg(user_id, sendable),
    }
  }

  #buildPrivateMessageEvent(event: PrivateMessageEvent) {
    return {
      ...event,
      message: (event.message || []).map((el: any) => ({ type: el.type, ...el.data })),
      friend: this.#buildFriend(event.user_id, event.sender?.nickname || ''),
      recall: () => this.api('delete_msg', { message_id: event.message_id }),
      reply: (sendable: Sendable | Sendable[], reply = false) =>
        this.sendPrivateMsg(event.user_id, this.#wrapReply(sendable, event.message_id, reply)),
    }
  }

  #buildGroupMessageEvent(event: GroupMessageEvent) {
    return {
      ...event,
      message: (event.message || []).map((el: any) => ({ type: el.type, ...el.data })),
      group: this.#buildGroup(event.group_id, event.group?.group_name || ''),
      recall: () => this.api('delete_msg', { message_id: event.message_id }),
      addReaction: (id: string) =>
        this.api('set_msg_emoji_like', { message_id: event.message_id, emoji_id: id, set: true }),
      delReaction: (id: string) =>
        this.api('set_msg_emoji_like', { message_id: event.message_id, emoji_id: id, set: false }),
      addEssence: () => this.api('set_essence_msg', { message_id: event.message_id }),
      delEssence: () => this.api('delete_essence_msg', { message_id: event.message_id }),
      reply: (sendable: Sendable | Sendable[], reply = false) =>
        this.sendGroupMsg(event.group_id, this.#wrapReply(sendable, event.message_id, reply)),
    }
  }

  #bindInternalEvents(data: any) {
    if (data.echo) {
      this.#echoEvent.emit(`echo#${data.echo}`, data)
      return
    }

    if (data.post_type) {
      switch (data.post_type) {
        case 'meta_event': {
          this.logger.trace(`received meta_event: ${JSON.stringify(data)}`)
          this.#event.emit('meta_event', data)

          if (data.meta_event_type) {
            this.#event.emit(`meta_event.${data.meta_event_type}`, data)
            if (data.sub_type) {
              this.#event.emit(`meta_event.${data.meta_event_type}.${data.sub_type}`, data)
            }
          }

          break
        }

        case 'message': {
          if (data.message_type === 'private') {
            data = this.#buildPrivateMessageEvent(data)
          } else {
            data = this.#buildGroupMessageEvent(data)
          }

          this.#event.emit('message', data)

          switch (data.message_type) {
            case 'private': {
              this.logger.trace(`received private message: ${JSON.stringify(data)}`)
              this.#event.emit('message.private', data)
              this.#event.emit(`message.private.${data.sub_type}`, data)

              break
            }

            case 'group': {
              this.logger.trace(`received group message: ${JSON.stringify(data)}`)
              this.#event.emit('message.group', data)
              this.#event.emit(`message.group.${data.sub_type}`, data)

              break
            }

            default: {
              this.logger.debug(`received unknown message type: ${JSON.stringify(data)}`)

              break
            }
          }

          break
        }

        case 'message_sent': {
          this.logger.trace(`received message_sent: ${JSON.stringify(data)}`)
          this.#event.emit('message_sent', data)

          if (data.message_type) {
            this.#event.emit(`message_sent.${data.message_type}`, data)
            if (data.sub_type) {
              this.#event.emit(`message_sent.${data.message_type}.${data.sub_type}`, data)
            }
          }

          break
        }

        case 'notice': {
          this.logger.trace(`received notice: ${JSON.stringify(data)}`)

          if (!data.notice_type) {
            this.logger.debug(`received unknown notice type: ${JSON.stringify(data)}`)
            break
          }

          const isNotify = data.notice_type === 'notify'
          const isPoke = data.sub_type === 'poke'
          const isGroup = !!data.group_id

          const { notice_type, sub_type } = isNotify
            ? isPoke
              ? { notice_type: isGroup ? 'group' : 'friend', sub_type: 'poke' }
              : NAPCAT_NOTICE_NOTIFY_MAP[data.sub_type] || {}
            : NAPCAT_NOTICE_EVENT_MAP[data.notice_type] || {}

          data.original_notice_type = data.notice_type
          data.notice_type = notice_type || data.notice_type

          if (data.sub_type && data.sub_type !== sub_type) {
            data.action_type = data.sub_type
          }

          data.sub_type = sub_type || data.sub_type

          if (isGroup) {
            data.group = this.#buildGroup(data.group_id, data.group_name || '')
          } else {
            data.friend = this.#buildFriend(data.user_id, data.nickname || '')
          }

          this.#event.emit('notice', data)

          if (notice_type) {
            this.#event.emit(`notice.${notice_type}`, data)
            if (sub_type) {
              this.#event.emit(`notice.${notice_type}.${sub_type}`, data)
            }
          }

          break
        }

        case 'request': {
          this.logger.trace(`received request: ${JSON.stringify(data)}`)

          if (data.request_type === 'friend') {
            data.reject = () => this.api('set_friend_request', { flag: data.flag, approve: false })
            data.approve = () => this.api('set_friend_request', { flag: data.flag, approve: true })
          }

          if (data.request_type === 'group') {
            data.reject = (reason?: string) =>
              this.api('set_group_add_request', { flag: data.flag, approve: false, reason })
            data.approve = () => this.api('set_group_add_request', { flag: data.flag, approve: true })
          }

          this.#event.emit('request', data)

          if (data.request_type) {
            this.#event.emit(`request.${data.request_type}`, data)
            if (data.sub_type) {
              this.#event.emit(`request.${data.request_type}.${data.sub_type}`, data)
            }
          }

          break
        }

        default: {
          this.logger.debug(`received: ${JSON.stringify(data)}`)
          this.#event.emit(data.post_type, data)
          return
        }
      }

      return
    }
  }

  async pickGroup(group_id: number): Promise<Group> {
    const groupInfo = await this.api<{ group_name: string }>('get_group_info', { group_id })
    return this.#buildGroup(group_id, groupInfo.group_name)
  }

  async pickFriend(user_id: number): Promise<Friend> {
    const friendInfo = await this.api<{ nickname: string }>('get_stranger_info', { user_id, no_cache: true })
    return this.#buildFriend(user_id, friendInfo.nickname)
  }

  /**
   * 注册一次性事件监听器
   */
  once<T extends keyof EventMap>(type: T, handler: (event: EventMap[NoInfer<T>]) => void) {
    const onceHandler = (event: EventMap[NoInfer<T>]) => {
      handler(event)
      this.#event.off(type, onceHandler)
    }

    this.logger.debug(`registering once: ${String(type)}`)
    this.#event.on(type, onceHandler)
  }

  /**
   * 注册事件监听器，支持主类型或者点分子类型
   *
   * 如： `notice`、`message.private`、`request.group.invite` 等
   *
   * 如果需要移除监听器，请调用 `off` 方法
   */
  on<T extends keyof EventMap>(type: T, handler: (event: EventMap[NoInfer<T>]) => void) {
    this.logger.debug(`registering: ${String(type)}`)
    this.#event.on(type, handler)
  }

  /**
   * 移除事件监听器
   */
  off<T extends keyof EventMap>(type: T, handler: (event: EventMap[NoInfer<T>]) => void) {
    this.logger.debug(`unregistering: ${String(type)}`)
    this.#event.off(type, handler)
  }

  api<T extends any>(action: API | (string & {}), params: Record<string, any> = {}): Promise<T> {
    this.#ensureWsConnection(this.#ws)
    this.logger.debug(`calling api action: ${action} with params: ${JSON.stringify(params)}`)
    const echo = this.#echoId()
    this.#ws.send(JSON.stringify({ echo, action, params }))
    return this.#waitForAction<T>(echo)
  }

  /**
   * 发送私聊消息
   */
  sendPrivateMsg(user_id: number, sendable: Sendable | Sendable[]) {
    return this.api<{ message_id: number }>('send_private_msg', {
      user_id,
      message: this.#normalizeSendable(sendable),
    })
  }

  /**
   * 发送群消息
   */
  sendGroupMsg(group_id: number, sendable: Sendable | Sendable[]) {
    return this.api<{ message_id: number }>('send_group_msg', {
      group_id,
      message: this.#normalizeSendable(sendable),
    })
  }

  async bootstrap() {
    const { logger: _, ...config } = this.#config

    this.logger.info(`bootstrap with config: ${JSON.stringify(config)}`)

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.#buildWsUrl())

      ws.onmessage = (event) => {
        const data = (() => {
          try {
            return JSON.parse(event.data)
          } catch {
            return null
          }
        })() as any

        if (!data) {
          this.logger.warn(`received non-json message: ${event.data}`)
          return
        }

        this.#event.emit('ws.message', data)
        this.#bindInternalEvents(data)
      }

      ws.onclose = () => {
        this.logger.info('closed')
        this.#event.emit('ws.close')
      }

      ws.onerror = (error) => {
        this.logger.error(`error: ${error}`)
        this.#event.emit('ws.error', error)
        reject(error)
      }

      ws.onopen = () => {
        this.logger.info('connected')
        this.#event.emit('ws.open')
        resolve()
      }

      this.#ws = ws

      this.logger.trace(`WebSocket instance created: ${this.#ws}`)
    })
  }

  async destroy() {
    if (this.#ws) {
      this.logger.info('destroying NapCat SDK instance...')
      this.#ws.close()
      this.#ws = null
      this.logger.info('NapCat SDK instance destroyed.')
    } else {
      this.logger.warn('NapCat SDK instance is not initialized.')
    }
  }
}
