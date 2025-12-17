import mitt from 'mitt'
import pkg from '../package.json' with { type: 'json' }
import { CONSOLE_LOGGER, ABSTRACT_LOGGER } from './logger'

import type { Emitter } from 'mitt'
import type { EventMap, MiokiOptions, OptionalProps } from './types'
import type { Logger } from './logger'
import type { Sendable } from './onebot'

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
  #mitt: Emitter<EventMap & Record<string | symbol, unknown>> = mitt()

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

  #buildWsUrl(): string {
    return `${this.#config.protocol}://${this.#config.host}:${this.#config.port}?access_token=${this.#config.token}`
  }

  once<T extends keyof EventMap>(type: T, handler: (event: EventMap[NoInfer<T>]) => void) {
    const onceHandler = (event: EventMap[NoInfer<T>]) => {
      handler(event)
      this.#mitt.off(type, onceHandler)
    }

    this.logger.debug(`registering once: ${String(type)}`)
    this.#mitt.on(type, onceHandler)
  }

  on<T extends keyof EventMap>(type: T, handler: (event: EventMap[NoInfer<T>]) => void) {
    this.logger.debug(`registering: ${String(type)}`)
    this.#mitt.on(type, handler)
  }

  off<T extends keyof EventMap>(type: T, handler: (event: EventMap[NoInfer<T>]) => void) {
    this.logger.debug(`unregistering: ${String(type)}`)
    this.#mitt.off(type, handler)
  }

  async bootstrap() {
    const { logger: _, ...config } = this.#config

    this.logger.info(`bootstrap with config: ${JSON.stringify(config)}`)

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.#buildWsUrl())

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data) as any

        this.#mitt.emit('ws.message', data)

        switch (data.post_type) {
          case 'meta_event': {
            this.logger.trace(`received meta_event: ${JSON.stringify(data)}`)
            this.#mitt.emit('meta_event', data)

            break
          }

          case 'message': {
            this.#mitt.emit('message', data)

            switch (data.message_type) {
              case 'private': {
                this.logger.trace(`received private message: ${JSON.stringify(data)}`)

                this.#mitt.emit('message.private', {
                  ...data,
                  reply: async (sendable: Sendable | Sendable[]) => {
                    ws.send(
                      JSON.stringify({
                        action: 'send_private_msg',
                        params: {
                          user_id: data.user_id,
                          message: [sendable]
                            .flat(2)
                            .map((item) => (typeof item === 'string' ? { type: 'text', data: { text: item } } : item)),
                        },
                      }),
                    )
                    return { ok: true }
                  },
                })

                break
              }

              case 'group': {
                this.logger.trace(`received group message: ${JSON.stringify(data)}`)

                this.#mitt.emit('message.group', {
                  ...data,
                  reply: async (sendable: Sendable | Sendable[]) => {
                    ws.send(
                      JSON.stringify({
                        action: 'send_group_msg',
                        params: {
                          group_id: data.group_id,
                          message: [sendable]
                            .flat(2)
                            .map((item) => (typeof item === 'string' ? { type: 'text', data: { text: item } } : item)),
                        },
                      }),
                    )
                    return { ok: true }
                  },
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
            this.#mitt.emit(data.post_type, data)
            return
          }
        }
      }

      ws.onclose = () => {
        this.logger.info('closed')
        this.#mitt.emit('ws.close')
      }

      ws.onerror = (error) => {
        this.logger.error(`error: ${error}`)
        this.#mitt.emit('ws.error', error)
        reject(error)
      }

      ws.onopen = () => {
        this.logger.info('connected')
        this.#mitt.emit('ws.open')
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
