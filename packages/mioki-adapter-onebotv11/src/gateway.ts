import { randomUUID } from 'node:crypto'
import type { WebSocketClient, WebSocketConnection, WebSocketConnectOptions, Logger } from 'mioki'

export type ApiCaller = <T = unknown>(action: string, params?: Record<string, unknown>) => Promise<T>

export interface GatewayOptions {
  readonly name?: string
  readonly url: string
  readonly ws: WebSocketClient
  readonly logger: Logger
  readonly reconnect?: boolean
  readonly reconnectInterval?: number
  readonly maxReconnectAttempts?: number
  readonly maxReconnectInterval?: number
  readonly headers?: Readonly<Record<string, string>>
}

export interface GatewayHandlers {
  onMessage(payload: unknown): void | Promise<void>
  onOpen(connection: WebSocketConnection): void | Promise<void>
  onClose(code: number, reason: string): void | Promise<void>
  onError(err: Error): void | Promise<void>
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  action: string
}

export class OneBotWebSocketGateway {
  readonly name: string
  readonly #options: GatewayOptions
  readonly #handlers: GatewayHandlers
  readonly #apiCalls = new Map<string, PendingRequest>()
  readonly #requestTimeout: number
  #connection: WebSocketConnection | null = null
  #reconnectAttempts = 0
  #reconnecting = false
  #manualClose = false
  #pendingSends: string[] = []
  #echoListenerInstalled = false

  constructor(options: GatewayOptions, handlers: GatewayHandlers) {
    this.name = options.name ?? 'onebotv11.websocket'
    this.#options = options
    this.#handlers = handlers
    this.#requestTimeout = 30_000
  }

  get url(): string {
    return this.#options.url
  }

  async start(): Promise<void> {
    this.#manualClose = false
    await this.#connectOnce()
  }

  async #connectOnce(): Promise<void> {
    const opts: WebSocketConnectOptions = {
      headers: this.#options.headers,
    }
    this.#connection = await this.#options.ws.connect(this.#options.url, opts)
    this.#connection.onMessage((data) => {
      const payload = decode(data)
      if (!payload) return
      void this.#dispatch(payload)
    })
    this.#connection.onError((err) => {
      void this.#handlers.onError(err)
    })
    this.#connection.onClose((event) => {
      const conn = this.#connection
      this.#connection = null
      void this.#handlers.onClose(event.code, event.reason)
      if (!this.#manualClose && (this.#options.reconnect ?? true)) {
        void this.#scheduleReconnect()
      }
      void conn
    })
    this.#reconnectAttempts = 0
    this.#reconnecting = false
    for (const pending of this.#pendingSends.splice(0)) {
      try {
        await this.#connection.send(pending)
      } catch (err) {
        this.#options.logger.warn(`补发 API 请求失败: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    await this.#handlers.onOpen(this.#connection)
  }

  #scheduleReconnect(): void {
    const { reconnectInterval = 1000, maxReconnectAttempts = Infinity, maxReconnectInterval = 30_000 } = this.#options
    if (this.#reconnectAttempts >= maxReconnectAttempts) {
      this.#options.logger.error(`已达到最大重连次数 ${maxReconnectAttempts}`)
      return
    }
    this.#reconnecting = true
    this.#reconnectAttempts += 1
    const delay = Math.min(reconnectInterval * Math.pow(2, this.#reconnectAttempts - 1), maxReconnectInterval)
    this.#options.logger.info(`将在 ${delay}ms 后尝试第 ${this.#reconnectAttempts} 次重连`)
    setTimeout(() => {
      void this.#connectOnce().catch((err) => {
        this.#options.logger.warn(`重连失败: ${err instanceof Error ? err.message : String(err)}`)
        this.#scheduleReconnect()
      })
    }, delay)
  }

  async stop(reason?: string): Promise<void> {
    this.#manualClose = true
    for (const [, pending] of this.#apiCalls) {
      pending.reject(new Error(reason ?? 'Gateway stopped'))
    }
    this.#apiCalls.clear()
    if (this.#connection) {
      await this.#connection.close(1000, reason ?? '')
      this.#connection = null
    }
  }

  call: ApiCaller = <T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const echo = randomUUID()
      const timer = setTimeout(() => {
        this.#apiCalls.delete(echo)
        reject(new Error(`API 请求超时: ${action}`))
      }, this.#requestTimeout)
      const finalize = (cb: () => void): void => {
        clearTimeout(timer)
        cb()
      }
      const wrappedResolve = (value: unknown): void => {
        finalize(() => resolve(value as T))
      }
      const wrappedReject = (reason: unknown): void => {
        finalize(() => reject(reason instanceof Error ? reason : new Error(String(reason))))
      }
      this.#apiCalls.set(echo, { resolve: wrappedResolve, reject: wrappedReject, action })
      void this.#sendApi(echo, action, params)
    })
  }

  async #sendApi(echo: string, action: string, params: Record<string, unknown>): Promise<void> {
    const payload = JSON.stringify({ echo, action, params })
    if (this.#connection && this.#connection.readyState === 'open') {
      try {
        await this.#connection.send(payload)
      } catch (err) {
        this.#options.logger.warn(`发送 API 请求失败: ${err instanceof Error ? err.message : String(err)}`)
        this.#pendingSends.push(payload)
      }
      return
    }
    this.#pendingSends.push(payload)
  }

  async #dispatch(payload: unknown): Promise<void> {
    if (!payload || typeof payload !== 'object') return
    const obj = payload as Record<string, unknown>
    if (typeof obj.echo === 'string') {
      const pending = this.#apiCalls.get(obj.echo)
      if (!pending) return
      this.#apiCalls.delete(obj.echo)
      if (obj.retcode === 0) {
        pending.resolve(obj.data)
      } else {
        pending.reject(new Error(typeof obj.message === 'string' ? obj.message : `API error: ${obj.retcode}`))
      }
      return
    }
    await this.#handlers.onMessage(obj)
  }
}

const decode = (raw: string | Uint8Array): unknown => {
  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
