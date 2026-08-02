export interface OneBotAdapterConfig {
  instances: ReadonlyArray<OneBotInstanceConfig>
}

export interface OneBotInstanceConfig {
  protocol?: 'ws' | 'wss'
  host?: string
  port?: number
  token?: string
  reconnect?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
  maxReconnectInterval?: number
  headers?: Readonly<Record<string, string>>
}

export const DEFAULT_INSTANCE: Required<Omit<OneBotInstanceConfig, 'token' | 'headers'>> = {
  protocol: 'ws',
  host: 'localhost',
  port: 3001,
  reconnect: true,
  reconnectInterval: 1000,
  maxReconnectAttempts: Infinity,
  maxReconnectInterval: 30_000,
}

export const normalizeInstances = (input: unknown): OneBotInstanceConfig[] => {
  if (!input) return []
  if (Array.isArray(input)) {
    if (input.length === 0) return []
    if (typeof input[0] === 'object') {
      return input as OneBotInstanceConfig[]
    }
    return []
  }
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>
    if (Array.isArray(obj.instances)) return obj.instances as OneBotInstanceConfig[]
    if ('protocol' in obj || 'host' in obj || 'port' in obj) {
      return [obj as OneBotInstanceConfig]
    }
  }
  return []
}
