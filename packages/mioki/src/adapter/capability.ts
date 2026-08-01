export interface Capability<I, O> {
  readonly name: string
  readonly version: number
  readonly token: symbol
}

const cache = new WeakMap<symbol, Capability<unknown, unknown>>()

export const defineCapability = <I, O>(name: string, version: number = 1): Capability<I, O> => {
  if (name.length === 0) {
    throw new Error('defineCapability: name must be a non-empty string')
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('defineCapability: version must be a positive integer')
  }
  const token = Symbol(name)
  const cap: Capability<I, O> = { name, version, token }
  cache.set(token, cap as Capability<unknown, unknown>)
  return cap
}

export const getCapabilityByToken = (token: symbol): Capability<unknown, unknown> | undefined => cache.get(token)

export class UnsupportedCapabilityError extends Error {
  readonly capability: string
  constructor(capability: string) {
    super(`Capability "${capability}" is not supported on this target`)
    this.name = 'UnsupportedCapabilityError'
    this.capability = capability
  }
}