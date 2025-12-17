import crypto from 'node:crypto'
import mitt from 'mitt'
import pkg from '../package.json' with { type: 'json' }
import { segment } from './segment'
import { CONSOLE_LOGGER, ABSTRACT_LOGGER } from './logger'

import type { Emitter } from 'mitt'
import type { Logger } from './logger'
import {
  NAPCAT_NOTICE_EVENT_MAP,
  NAPCAT_NOTICE_NOTIFY_MAP,
  type NormalizedElementToSend,
  type Sendable,
} from './onebot'
import type { EventMap, MiokiOptions, OptionalProps } from './types'

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
          const mid = data.message_id

          if (data.message_type === 'private') {
            data.friend = {
              user_id: data.user_id,
              nickname: data.sender?.nickname,
              sendMsg: (sendable: Sendable | Sendable[]) => this.sendPrivateMsg(data.user_id, sendable),
            }
          } else {
            data.group = {
              group_id: data.group_id,
              group_name: data.group_name,
              sendMsg: (sendable: Sendable | Sendable[]) => this.sendGroupMsg(data.group_id, sendable),
            }
          }

          data.message = (data.message || []).map((el: any) => ({ type: el.type, ...el.data }))

          this.#event.emit('message', {
            ...data,
            reply: (sendable: Sendable | Sendable[], reply = false) => {
              const wrapped = this.#wrapReply(sendable, mid, reply)

              switch (data.message_type) {
                case 'private':
                  return this.sendPrivateMsg(data.user_id, wrapped)
                case 'group':
                  return this.sendGroupMsg(data.group_id, wrapped)
                default:
                  throw new Error(`unsupported message_type: ${data.message_type}`)
              }
            },
          })

          switch (data.message_type) {
            case 'private': {
              this.logger.trace(`received private message: ${JSON.stringify(data)}`)

              const event = {
                ...data,
                reply: (sendable: Sendable | Sendable[], reply = false) =>
                  this.sendPrivateMsg(data.user_id, this.#wrapReply(sendable, mid, reply)),
              }

              this.#event.emit('message.private', event)
              this.#event.emit(`message.private.${data.sub_type}`, event)

              break
            }

            case 'group': {
              this.logger.trace(`received group message: ${JSON.stringify(data)}`)

              const event = {
                ...data,
                reply: (sendable: Sendable | Sendable[], reply = false) =>
                  this.sendGroupMsg(data.group_id, this.#wrapReply(sendable, mid, reply)),
              }

              this.#event.emit('message.group', event)
              this.#event.emit(`message.group.${data.sub_type}`, event)

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

          const { notice_type, sub_type } = isNotify
            ? isPoke
              ? { notice_type: data.group_id ? 'group' : 'friend', sub_type: 'poke' }
              : NAPCAT_NOTICE_NOTIFY_MAP[data.sub_type] || {}
            : NAPCAT_NOTICE_EVENT_MAP[data.notice_type] || {}

          data.original_notice_type = data.notice_type
          data.notice_type = notice_type || data.notice_type

          if (data.sub_type && data.sub_type !== sub_type) {
            data.action_type = data.sub_type
          }

          data.sub_type = sub_type || data.sub_type

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
   * 注册事件监听器
   *
   * 如果需要移除监听器，调用 `off` 方法
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

  /**
   * 发送私聊消息
   */
  sendPrivateMsg(user_id: number, sendable: Sendable | Sendable[]) {
    this.#ensureWsConnection(this.#ws)

    this.logger.debug(`sending private message to ${user_id}: ${JSON.stringify(sendable)}`)

    const echo = this.#echoId()

    this.#ws.send(
      JSON.stringify({
        echo,
        action: 'send_private_msg',
        params: {
          user_id,
          message: this.#normalizeSendable(sendable),
        },
      }),
    )

    return this.#waitForAction(echo)
  }

  /**
   * 发送群消息
   */
  sendGroupMsg(group_id: number, sendable: Sendable | Sendable[]) {
    this.#ensureWsConnection(this.#ws)

    this.logger.debug(`sending group message to ${group_id}: ${JSON.stringify(sendable)}`)

    const echo = this.#echoId()

    this.#ws.send(
      JSON.stringify({
        echo,
        action: 'send_group_msg',
        params: {
          group_id,
          message: this.#normalizeSendable(sendable),
        },
      }),
    )

    return this.#waitForAction(echo)
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
