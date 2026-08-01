export interface NapCatAdapterConfig {
  instances: ReadonlyArray<NapCatInstanceConfig>
}

export interface NapCatInstanceConfig {
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

export const DEFAULT_INSTANCE: Required<Omit<NapCatInstanceConfig, 'token' | 'headers'>> = {
  protocol: 'ws',
  host: 'localhost',
  port: 3001,
  reconnect: true,
  reconnectInterval: 1000,
  maxReconnectAttempts: Infinity,
  maxReconnectInterval: 30_000,
}

export const normalizeInstances = (input: unknown): NapCatInstanceConfig[] => {
  if (!input) return []
  if (Array.isArray(input)) {
    if (input.length === 0) return []
    if (typeof input[0] === 'object') {
      return input as NapCatInstanceConfig[]
    }
    return []
  }
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>
    if (Array.isArray(obj.instances)) return obj.instances as NapCatInstanceConfig[]
    if ('protocol' in obj || 'host' in obj || 'port' in obj) {
      return [obj as NapCatInstanceConfig]
    }
  }
  return []
}
