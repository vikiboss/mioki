export interface WebSocketConnection {
  readonly id: string
  readonly url: string
  readonly readyState: 'connecting' | 'open' | 'closing' | 'closed'

  send(data: string | Uint8Array): Promise<void>
  close(code?: number, reason?: string): Promise<void>

  onMessage(handler: (data: string | Uint8Array) => void): () => void
  onClose(handler: (event: { code: number; reason: string }) => void): () => void
  onError(handler: (err: Error) => void): () => void
}

export interface WebSocketConnectOptions {
  readonly headers?: Readonly<Record<string, string>>
  readonly protocols?: readonly string[]
  readonly signal?: AbortSignal
  readonly connectTimeout?: number
}

export interface WebSocketClient {
  connect(url: string, options?: WebSocketConnectOptions): Promise<WebSocketConnection>
}

export interface HttpRequestOptions {
  readonly method: string
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string | Uint8Array | Readonly<Record<string, unknown>>
  readonly timeout?: number
  readonly signal?: AbortSignal
}

export interface HttpResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: Uint8Array
  text(): string
  json<T = unknown>(): T
  arrayBuffer(): ArrayBuffer
}

export interface HttpClient {
  request(options: HttpRequestOptions): Promise<HttpResponse>
}

export interface Driver {
  readonly name: string
  readonly http: HttpClient
  readonly websocket: WebSocketClient
  shutdown(): Promise<void>
}

export class DriverShutdownError extends Error {
  constructor(message = 'Driver has been shut down') {
    super(message)
    this.name = 'DriverShutdownError'
  }
}

export class WebSocketConnectTimeoutError extends Error {
  constructor(url: string, timeout: number) {
    super(`WebSocket connect timed out after ${timeout}ms: ${url}`)
    this.name = 'WebSocketConnectTimeoutError'
  }
}

export class HttpRequestError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpRequestError'
    this.status = status
  }
}