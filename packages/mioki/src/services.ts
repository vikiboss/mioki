import { createMiokiLogger } from './logger'

import type { Logger } from './logger'

const services: Record<string, unknown> = {}

export interface MiokiServices {
  readonly [key: string]: unknown
}

export const servicesRegistry: MiokiServices = services

export const getService = <T = unknown>(name: string): T | undefined => services[name] as T | undefined

export const setService = <T = unknown>(name: string, value: T, cover: boolean = true): () => void => {
  if (cover || !services[name]) {
    services[name] = value
  }
  return () => {
    services[name] = undefined
  }
}

export const addService = <T = unknown>(name: string, value: T, cover: boolean = true): (() => void) => {
  const log = createMiokiLogger({ tag: 'services' })
  log.debug(`注册服务: ${name} (覆盖: ${cover ? '是' : '否'})`)
  return setService(name, value, cover)
}

export type ServiceFactory<T> = () => T

export const serviceLogger: Logger = createMiokiLogger({ tag: 'services' })