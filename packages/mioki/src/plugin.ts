import type { MiokiContext } from './runtime/mioki-context'
import type { TaskContext } from 'node-cron'

export type PluginCleanup = () => void | Promise<void>

export type BotHandler = (event: import('./adapter/types').BotLifecycleEvent) => void | Promise<void>
export type CronHandler = (ctx: MiokiContext, task: TaskContext) => void | Promise<void>
export type ScheduledTask = import('node-cron').ScheduledTask

export interface MiokiPlugin {
  name: string
  version?: string
  priority?: number
  description?: string
  dependencies?: string[]
  setup?(ctx: MiokiContext): void | Promise<void | PluginCleanup> | PluginCleanup
}

export const definePlugin = <T extends MiokiPlugin>(plugin: T): T => plugin
