import type { Config } from 'mioki-adapter-icqq/vendor/icqq'

export interface IcqqAdapterConfig {
  instances: ReadonlyArray<IcqqInstanceConfig>
}

export interface IcqqInstanceConfig {
  uin: number
  password?: string | Buffer
  /** icqq 协议版本，例如 9.2.90. */
  ver?: string
  /** qsign 的 /sign 地址，通常需要带 ?key=... */
  sign_api_addr?: string
  /** 是否忽略自己账号发送的消息（默认 true，不会收到自己发的消息事件） */
  ignore_self?: boolean
  config?: Config
}

export const normalizeInstances = (input: unknown): IcqqInstanceConfig[] => {
  if (Array.isArray(input)) return input.filter(isInstance)
  if (typeof input === 'object' && input !== null) {
    const value = input as Record<string, unknown>
    if (Array.isArray(value.instances)) return value.instances.filter(isInstance)
    if (isInstance(value)) return [value]
  }
  return []
}

const isInstance = (value: unknown): value is IcqqInstanceConfig =>
  typeof value === 'object' && value !== null && typeof (value as { uin?: unknown }).uin === 'number'
