import { randomUUID } from 'node:crypto'

import type {
  Driver,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
  WebSocketClient,
  WebSocketConnection,
  WebSocketConnectOptions,
} from './types'
import { DriverShutdownError, HttpRequestError, WebSocketConnectTimeoutError } from './types'

const RAW_TEXT_DECODER = new TextDecoder()

const decodeBody = async (response: Response): Promise<{ body: Uint8Array; headers: Record<string, string> }> => {
  const arrayBuffer = await response.arrayBuffer()
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  return { body: new Uint8Array(arrayBuffer), headers }
}

const buildResponse = async (response: Response): Promise<HttpResponse> => {
  const { body, headers } = await decodeBody(response)
  return {
    status: response.status,
    headers,
    body,
    text() {
      return RAW_TEXT_DECODER.decode(body)
    },
    json<T = unknown>(): T {
      return JSON.parse(RAW_TEXT_DECODER.decode(body)) as T
    },
    arrayBuffer(): ArrayBuffer {
      return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
    },
  }
}

const serializeBody = (
  body: HttpRequestOptions['body'],
): { body: BodyInit | undefined; contentType: string | undefined } => {
  if (body == null) return { body: undefined, contentType: undefined }
  if (typeof body === 'string') return { body, contentType: 'text/plain;charset=utf-8' }
  if (body instanceof Uint8Array) return { body: Buffer.from(body), contentType: 'application/octet-stream' }
  return { body: JSON.stringify(body), contentType: 'application/json' }
}

const createHttpClient = (state: DriverState): HttpClient => {
  return {
    async request(options: HttpRequestOptions): Promise<HttpResponse> {
      if (state.shutdownStarted) throw new DriverShutdownError()
      const { body, contentType } = serializeBody(options.body)
      const headers = new Headers()
      for (const [k, v] of Object.entries(options.headers ?? {})) {
        headers.set(k, v)
      }
      if (contentType && !headers.has('content-type')) {
        headers.set('content-type', contentType)
      }
      const signal = options.signal ?? state.rootController.signal
      const timeout = options.timeout ?? state.requestTimeout
      const controller = new AbortController()
      const timer =
        timeout > 0
          ? setTimeout(() => {
              controller.abort(new Error(`HttpRequest timeout after ${timeout}ms`))
            }, timeout)
          : null
      const compositeSignal = AbortSignal.any([signal, controller.signal])
      try {
        const response = await fetch(options.url, {
          method: options.method,
          headers,
          body,
          signal: compositeSignal,
        })
        return await buildResponse(response)
      } catch (err) {
        if (controller.signal.aborted) {
          throw new HttpRequestError(`Request aborted or timed out: ${options.url}`, 0)
        }
        throw new HttpRequestError(err instanceof Error ? err.message : String(err), 0)
      } finally {
        if (timer) clearTimeout(timer)
      }
    },
  }
}

class NodeWebSocketConnection implements WebSocketConnection {
  readonly id: string
  readonly url: string
  #ws: WebSocket
  #messageHandlers = new Set<(data: string | Uint8Array) => void>()
  #closeHandlers = new Set<(event: { code: number; reason: string }) => void>()
  #errorHandlers = new Set<(err: Error) => void>()
  #closing: 'idle' | 'closing' | 'closed' = 'idle'

  constructor(ws: WebSocket, url: string) {
    this.#ws = ws
    this.url = url
    this.id = randomUUID()
    ws.binaryType = 'arraybuffer'
    ws.addEventListener('message', this.#dispatchMessage)
    ws.addEventListener('close', this.#dispatchClose)
    ws.addEventListener('error', this.#dispatchError)
  }

  get readyState(): 'connecting' | 'open' | 'closing' | 'closed' {
    switch (this.#ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting'
      case WebSocket.OPEN:
        return 'open'
      case WebSocket.CLOSING:
        return 'closing'
      case WebSocket.CLOSED:
        return 'closed'
      default:
        return 'closed'
    }
  }

  #dispatchMessage = (event: MessageEvent): void => {
    if (this.#messageHandlers.size === 0) return
    const data = typeof event.data === 'string' ? event.data : new Uint8Array(event.data as ArrayBuffer)
    for (const handler of this.#messageHandlers) {
      try {
        handler(data)
      } catch {
        // swallow handler errors; transport-level concerns only.
      }
    }
  }

  #dispatchClose = (event: CloseEvent): void => {
    this.#closing = 'closed'
    const payload = { code: event.code, reason: event.reason }
    for (const handler of this.#closeHandlers) {
      try {
        handler(payload)
      } catch {
        // ignore
      }
    }
  }

  #dispatchError = (event: Event): void => {
    const err = event instanceof ErrorEvent ? new Error(event.message) : new Error('WebSocket error')
    for (const handler of this.#errorHandlers) {
      try {
        handler(err)
      } catch {
        // ignore
      }
    }
  }

  async send(data: string | Uint8Array): Promise<void> {
    if (this.#ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    if (typeof data === 'string') {
      this.#ws.send(data)
      return
    }
    this.#ws.send(Buffer.from(data))
  }

  async close(code?: number, reason?: string): Promise<void> {
    if (this.#closing !== 'idle') return
    this.#closing = 'closing'
    if (this.#ws.readyState === WebSocket.OPEN || this.#ws.readyState === WebSocket.CONNECTING) {
      this.#ws.close(code ?? 1000, reason ?? '')
    }
  }

  onMessage(handler: (data: string | Uint8Array) => void): () => void {
    this.#messageHandlers.add(handler)
    return () => this.#messageHandlers.delete(handler)
  }

  onClose(handler: (event: { code: number; reason: string }) => void): () => void {
    this.#closeHandlers.add(handler)
    return () => this.#closeHandlers.delete(handler)
  }

  onError(handler: (err: Error) => void): () => void {
    this.#errorHandlers.add(handler)
    return () => this.#errorHandlers.delete(handler)
  }
}

const createWebSocketClient = (state: DriverState): WebSocketClient => {
  return {
    async connect(url: string, options: WebSocketConnectOptions = {}): Promise<WebSocketConnection> {
      if (state.shutdownStarted) throw new DriverShutdownError()
      const headers = options.headers ?? {}
      const protocols = options.protocols ? Array.from(options.protocols) : undefined
      const socket = new WebSocket(url, protocols)
      const signal = options.signal
      let externalAbort = false
      const abortFromExternal = (): void => {
        externalAbort = true
        socket.close(1000, 'aborted')
      }
      if (signal) {
        if (signal.aborted) abortFromExternal()
        else signal.addEventListener('abort', abortFromExternal, { once: true })
      }
      const timeout = options.connectTimeout ?? state.connectTimeout
      let timer: ReturnType<typeof setTimeout> | null = null
      let rejectConnect: ((err: Error) => void) | null = null
      if (timeout > 0) {
        timer = setTimeout(() => {
          externalAbort = true
          try {
            socket.close(1001, 'connect timeout')
          } catch {
            // ignore
          }
          rejectConnect?.(new WebSocketConnectTimeoutError(url, timeout))
        }, timeout)
      }
      try {
        await new Promise<void>((resolve, reject) => {
          rejectConnect = reject
          socket.addEventListener('open', () => resolve(), { once: true })
          socket.addEventListener(
            'error',
            (event) => {
              if (externalAbort) return
              const err = event instanceof ErrorEvent ? new Error(event.message) : new Error('WebSocket connect failed')
              reject(err)
            },
            { once: true },
          )
        })
      } catch (err) {
        try {
          socket.close()
        } catch {
          // ignore
        }
        throw err instanceof Error ? err : new Error('WebSocket connect failed')
      } finally {
        if (timer) clearTimeout(timer)
        rejectConnect = null
      }
      const conn = new NodeWebSocketConnection(socket, url)
      state.connections.add(conn)
      const remove = (): void => {
        state.connections.delete(conn)
      }
      conn.onClose(remove)
      return conn
    },
  }
}

interface DriverState {
  shutdownStarted: boolean
  connections: Set<WebSocketConnection>
  rootController: AbortController
  requestTimeout: number
  connectTimeout: number
}

export interface CreateDriverOptions {
  readonly requestTimeout?: number
  readonly connectTimeout?: number
}

export const createDefaultDriver = (options: CreateDriverOptions = {}): Driver => {
  const state: DriverState = {
    shutdownStarted: false,
    connections: new Set(),
    rootController: new AbortController(),
    requestTimeout: options.requestTimeout ?? 30_000,
    connectTimeout: options.connectTimeout ?? 15_000,
  }
  const http = createHttpClient(state)
  const websocket = createWebSocketClient(state)

  const driver: Driver = {
    name: 'mioki.default',
    http,
    websocket,
    async shutdown(): Promise<void> {
      if (state.shutdownStarted) return
      state.shutdownStarted = true
      state.rootController.abort()
      const closes: Promise<unknown>[] = []
      for (const conn of state.connections) {
        closes.push(conn.close(1000, 'driver shutdown'))
      }
      await Promise.allSettled(closes)
    },
  }
  return driver
}
