import crypto from 'node:crypto'
import mitt from 'mitt'
import pkg from '../package.json' with { type: 'json' }
import { segment } from './segment'
import { CONSOLE_LOGGER, ABSTRACT_LOGGER } from './logger'

import type { Emitter } from 'mitt'
import type { Logger } from './logger'
import type { Sendable } from './onebot'
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

  #normalizeSendable(msg: Sendable | Sendable[]): Sendable[] {
    return [msg].flat(2).map((item) => (typeof item === 'string' ? { type: 'text', data: { text: item } } : item))
  }

  async #waitForAction<T extends any>(prefix: string, echo: string) {
    const key = `${prefix}#${echo}`

    return new Promise<T>((resolve) => {
      const handle = (data: any) => {
        this.#echoEvent.off(key, handle)
        resolve(data as T)
      }

      this.#echoEvent.on(key, handle)
    })
  }

  once<T extends keyof EventMap>(type: T, handler: (event: EventMap[NoInfer<T>]) => void) {
    const onceHandler = (event: EventMap[NoInfer<T>]) => {
      handler(event)
      this.#event.off(type, onceHandler)
    }

    this.logger.debug(`registering once: ${String(type)}`)
    this.#event.on(type, onceHandler)
  }

  on<T extends keyof EventMap>(type: T, handler: (event: EventMap[NoInfer<T>]) => void) {
    this.logger.debug(`registering: ${String(type)}`)
    this.#event.on(type, handler)
  }

  off<T extends keyof EventMap>(type: T, handler: (event: EventMap[NoInfer<T>]) => void) {
    this.logger.debug(`unregistering: ${String(type)}`)
    this.#event.off(type, handler)
  }

  ensureWsConnection(ws: WebSocket | null): asserts ws is WebSocket {
    if (!ws) {
      this.logger.error('WebSocket is not connected.')
      throw new Error('WebSocket is not connected.')
    }

    if (ws.readyState !== WebSocket.OPEN) {
      this.logger.error('WebSocket is not open.')
      throw new Error('WebSocket is not open.')
    }
  }

  sendMsg<T extends Sendable | Sendable[]>(msg: T) {
    this.ensureWsConnection(this.#ws)

    this.logger.debug(`sending message: ${JSON.stringify(msg)}`)

    const action = 'send_msg'
    const echo = this.#echoId()

    this.#ws.send(
      JSON.stringify({
        echo,
        action,
        params: { message: this.#normalizeSendable(msg) },
      }),
    )

    return this.#waitForAction<any>(action, echo)
  }

  sendPrivateMsg<T extends Sendable | Sendable[]>(user_id: number, msg: T) {
    this.ensureWsConnection(this.#ws)

    this.logger.debug(`sending private message to ${user_id}: ${JSON.stringify(msg)}`)

    const action = 'send_private_msg'
    const echo = this.#echoId()

    this.#ws.send(
      JSON.stringify({
        echo,
        action,
        params: { message: this.#normalizeSendable(msg) },
      }),
    )

    return this.#waitForAction<any>(action, echo)
  }

  sendGroupMsg<T extends Sendable | Sendable[]>(group_id: number, msg: T) {
    this.ensureWsConnection(this.#ws)

    this.logger.debug(`sending group message to ${group_id}: ${JSON.stringify(msg)}`)

    const action = 'send_group_msg'
    const echo = this.#echoId()

    this.#ws.send(
      JSON.stringify({
        echo,
        action,
        params: {
          group_id,
          params: { message: this.#normalizeSendable(msg) },
        },
      }),
    )

    return this.#waitForAction<any>(action, echo)
  }

  async bootstrap() {
    const { logger: _, ...config } = this.#config

    this.logger.info(`bootstrap with config: ${JSON.stringify(config)}`)

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.#buildWsUrl())

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data) as any

        this.#event.emit('ws.message', data)

        switch (data.post_type) {
          case 'meta_event': {
            this.logger.trace(`received meta_event: ${JSON.stringify(data)}`)
            this.#event.emit('meta_event', data)

            break
          }

          case 'message': {
            this.#event.emit('message', data)

            switch (data.message_type) {
              case 'private': {
                this.logger.trace(`received private message: ${JSON.stringify(data)}`)

                this.#event.emit('message.private', {
                  ...data,
                  reply: (sendable: Sendable | Sendable[]) => this.sendPrivateMsg(data.user_id, sendable),
                })

                break
              }

              case 'group': {
                this.logger.trace(`received group message: ${JSON.stringify(data)}`)

                this.#event.emit('message.group', {
                  ...data,
                  reply: (sendable: Sendable | Sendable[]) => this.sendGroupMsg(data.group_id, sendable),
                })

                break
              }

              default: {
                this.logger.debug(`received unknown message type: ${JSON.stringify(data)}`)

                break
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
