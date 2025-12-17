import type { Logger } from './logger'
import type { OneBotEventMap } from './onebot'

export interface MiokiOptions {
  protocol?: 'ws' | 'wss'
  host?: string
  port?: number
  token: string
  logger?: Logger
}

export type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never
}[keyof T]

export type OptionalProps<T> = Pick<T, OptionalKeys<T>>

export interface EventMap extends OneBotEventMap {
  'ws.open': void
  'ws.close': void
  'ws.error': Event
  'ws.message': any
}
