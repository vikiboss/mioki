import fs from 'node:fs'
import path from 'node:path'
import { hrtime } from 'node:process'

import { botConfig, reloadMiokiConfig, setBotCwd } from '../config'
import { createDefaultDriver, DriverShutdownError } from '../driver'
import type { Driver } from '../driver'
import { CapabilityRegistry } from '../adapter'
import { definePlugin } from '../plugin'
import type { MiokiPlugin, PluginCleanup } from '../plugin'
import { BotRegistry } from './bots'
import { EventBus } from './bus'
import { AdapterContextImpl } from './context'
import type { RuntimeAdapterState } from './context'
import { MiokiContext } from './mioki-context'
import { BUILTIN_PLUGINS as DEFAULT_BUILTIN_PLUGINS } from '../builtins'
import {
  createImportContext,
  discoverAdapterCandidates,
  discoverPluginCandidates,
  findLocalPlugins,
  loadAdapterDefinition,
  loadLocalPlugin,
  loadNpmPlugin,
} from '../loader'

import type { Logger } from '../logger'
import type { Adapter, AdapterDefinition, AdapterName, BotLifecycleEvent } from '../adapter/types'
import type { PluginCandidate } from '../loader'
import type { Event } from '../adapter/event'
import type { Bot } from '../adapter/bot'
import type { BotId } from '../types'

export interface CreateRuntimeOptions {
  readonly cwd: string
  readonly logger: Logger
  readonly builtinPlugins?: readonly MiokiPlugin[]
  readonly driverFactory?: () => Driver
}

export interface AdapterStartResult {
  readonly name: AdapterName
  readonly adapter: Adapter
}

const BUILTIN_PLUGINS: MiokiPlugin[] = [...DEFAULT_BUILTIN_PLUGINS]

export const setBuiltinPlugins = (plugins: readonly MiokiPlugin[]): void => {
  BUILTIN_PLUGINS.length = 0
  BUILTIN_PLUGINS.push(...plugins)
}

export const getBuiltinPlugins = (): readonly MiokiPlugin[] => BUILTIN_PLUGINS

export class MiokiRuntime {
  readonly #cwd: string
  readonly #logger: Logger
  readonly #bus: EventBus
  readonly #bots: BotRegistry
  readonly #capabilities: CapabilityRegistry
  readonly #driver: Driver
  readonly #adapterStates = new Map<AdapterName, RuntimeAdapterState>()
  readonly #enabledAdapters = new Map<AdapterName, AdapterDefinition<unknown>>()
  readonly #enabledPlugins = new Map<string, { cleanup: PluginCleanup | null; plugin: MiokiPlugin }>()
  readonly #driverFactory: () => Driver
  readonly #builtinPlugins: readonly MiokiPlugin[]
  #started = false
  #stopped = false

  constructor(options: CreateRuntimeOptions) {
    this.#cwd = path.resolve(options.cwd)
    this.#logger = options.logger
    this.#driverFactory = options.driverFactory ?? (() => createDefaultDriver())
    this.#builtinPlugins = options.builtinPlugins ?? BUILTIN_PLUGINS
    this.#driver = this.#driverFactory()
    this.#bus = new EventBus()
    this.#bus.setLogger((level, message, detail) => {
      const fn = this.#logger[level] ?? this.#logger.error
      if (detail === undefined) fn(message)
      else fn(message, detail)
    })
    this.#bots = new BotRegistry()
    this.#capabilities = new CapabilityRegistry()
  }

  get cwd(): string {
    return this.#cwd
  }

  get logger(): Logger {
    return this.#logger
  }

  get driver(): Driver {
    return this.#driver
  }

  get bus(): EventBus {
    return this.#bus
  }

  get bots(): readonly Bot[] {
    return this.#bots.all()
  }

  get adapters(): readonly Adapter[] {
    return Array.from(this.#adapterStates.values())
      .map((state) => state.instance)
      .filter((a): a is Adapter => a != null)
  }

  getAdapter<T extends Adapter = Adapter>(name: AdapterName): T | undefined {
    const state = this.#adapterStates.get(name)
    return state?.instance as T | undefined
  }

  pickBot(bot_id: BotId): Bot | undefined {
    return this.#bots.pick(bot_id)
  }

  pickAdapterBot(adapter: AdapterName, bot_id: BotId): Bot | undefined {
    return this.#bots.get(adapter, bot_id)
  }

  async #emitLifecycle(event: BotLifecycleEvent): Promise<void> {
    const lifecycleEvent: Event = {
      kind: 'adapter',
      type: event.type,
      routes: [event.type],
      identity: {
        adapter: event.bot.adapter,
        bot_id: event.bot.bot_id,
        event_type: event.type,
      },
      bot: event.bot,
      self_id: event.bot.bot_id,
      time: Date.now(),
      raw: event,
      payload: event,
    }
    await this.#bus.dispatch(lifecycleEvent)
  }

  #createContext(state: RuntimeAdapterState): AdapterContextImpl {
    return new AdapterContextImpl({
      state,
      bots: this.#bots,
      bus: this.#bus,
      driver: this.#driver,
      capabilities: this.#capabilities,
      logger: this.#logger.child({ adapter: state.definition.name }),
      emit: (event) => this.#emitLifecycle(event),
    })
  }

  async #loadPlugin(plugin: MiokiPlugin, type: 'builtin' | 'external'): Promise<void> {
    const cleanupTasks: PluginCleanup[] = []
    const ctx = new MiokiContext({
      pluginName: `${type}:${plugin.name}`,
      bus: this.#bus,
      bots: this.#bots,
      driver: this.#driver,
      capabilities: this.#capabilities,
      config: botConfig,
      logger: this.#logger.child({ plugin: plugin.name }),
      priority: plugin.priority ?? 100,
      getAdapter: <T extends Adapter = Adapter>(name: AdapterName) => this.getAdapter<T>(name),
      onUpdateConfig: async (updater) => {
        await updater(botConfig)
      },
    })
    cleanupTasks.push(() => ctx.dispose())

    const start = hrtime.bigint()
    let cleanup: PluginCleanup | null = null
    try {
      const result = await plugin.setup?.(ctx)
      cleanup = typeof result === 'function' ? result : null
    } catch (err) {
      await ctx.dispose()
      throw new Error(`Plugin "${plugin.name}" setup failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (typeof cleanup === 'function') cleanupTasks.push(cleanup)
    const wrappedCleanup: PluginCleanup = async () => {
      for (const fn of cleanupTasks) {
        try {
          await fn()
        } catch (err) {
          this.#logger.warn(`Plugin "${plugin.name}" cleanup error: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
    this.#enabledPlugins.set(`${type}:${plugin.name}`, { cleanup: wrappedCleanup, plugin })
    const end = hrtime.bigint()
    const ms = Math.round(Number(end - start)) / 1_000_000
    this.#logger.info(`- 启用插件 [${type}] ${plugin.name}@${plugin.version ?? '0.0.0'} => ${ms.toFixed(2)}ms`)
  }

  async #setupBuiltinPlugins(): Promise<void> {
    for (const plugin of this.#builtinPlugins) {
      try {
        await this.#loadPlugin(plugin, 'builtin')
      } catch (err) {
        this.#logger.error(err instanceof Error ? err.message : String(err))
      }
    }
  }

  async #discoverAdapters(): Promise<void> {
    const appPkg = this.#readAppPackageJson()
    const candidates = discoverAdapterCandidates(this.#cwd, appPkg)
    const enabledNames = Object.keys(botConfig.adapters ?? {}) as AdapterName[]
    const candidateByName = new Map(candidates.map((candidate) => [candidate.name, candidate]))
    const jiti = createImportContext(this.#cwd)
    for (const name of enabledNames) {
      const candidate = candidateByName.get(name)
      if (!candidate) {
        throw new Error(`已配置适配器 "${name}"，但它不在项目直接依赖中或 manifest 无效`)
      }
      const loaded = await loadAdapterDefinition(jiti, candidate)
      this.#enabledAdapters.set(name, loaded.definition)
    }
  }

  #readAppPackageJson(): import('../loader/package').PackageJson {
    const file = `${this.#cwd}/package.json`
    if (!fs.existsSync(file)) {
      throw new Error(`无法在 ${this.#cwd} 下找到 package.json`)
    }
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as import('../loader/package').PackageJson
  }

  async #setupPlugins(): Promise<void> {
    await this.#setupBuiltinPlugins()

    const appPkg = this.#readAppPackageJson()
    const enabledIds = new Set<string>(botConfig.plugins.map(String))
    if (enabledIds.size === 0) return

    const candidates = discoverPluginCandidates(this.#cwd, appPkg)
    const candidateByName = new Map<string, PluginCandidate>(candidates.map((c) => [c.name, c]))

    const localDir = botConfig.plugins_dir ?? 'plugins'
    const localPlugins = findLocalPlugins(this.#cwd, localDir)

    const failed: Array<{ name: string; error: string }> = []
    const jiti = createImportContext(this.#cwd)
    const tasks: Array<{ name: string; priority: number; run: () => Promise<void> }> = []

    for (const id of enabledIds) {
      const npmCandidate = candidateByName.get(id)
      if (npmCandidate) {
        tasks.push({
          name: id,
          priority: npmCandidate.priority ?? 100,
          run: async () => {
            try {
              const plugin = await loadNpmPlugin(jiti, npmCandidate)
              await this.#loadPlugin(plugin, 'external')
            } catch (err) {
              failed.push({ name: id, error: err instanceof Error ? err.message : String(err) })
            }
          },
        })
        continue
      }
      const local = localPlugins.find((p) => p.name === id)
      if (!local) {
        failed.push({ name: id, error: `插件 "${id}" 未找到（既不在依赖中，也不在本地插件目录中）` })
        continue
      }
      tasks.push({
        name: id,
        priority: 100,
        run: async () => {
          try {
            const plugin = await loadLocalPlugin(jiti, id, local.absPath)
            await this.#loadPlugin(plugin, 'external')
          } catch (err) {
            failed.push({ name: id, error: err instanceof Error ? err.message : String(err) })
          }
        },
      })
    }

    const priorityGroups = new Map<number, typeof tasks>()
    for (const task of tasks) {
      const group = priorityGroups.get(task.priority) ?? []
      group.push(task)
      priorityGroups.set(task.priority, group)
    }
    const priorities = Array.from(priorityGroups.keys()).sort((a, b) => a - b)
    for (const priority of priorities) {
      const group = priorityGroups.get(priority) ?? []
      await Promise.allSettled(group.map((t) => t.run()))
    }

    if (failed.length > 0) {
      const summary = failed.map((f) => `  - ${f.name}: ${f.error}`).join('\n')
      this.#logger.warn(`以下插件加载失败:\n${summary}`)
    }
  }

  async #startAdapter(name: AdapterName): Promise<Adapter> {
    const definition = this.#enabledAdapters.get(name)
    if (!definition) {
      throw new Error(`Adapter "${name}" is not enabled`)
    }
    const rawConfig = (botConfig.adapters ?? {})[name]
    let config: unknown = rawConfig
    if (definition.validateConfig) {
      try {
        config = definition.validateConfig(rawConfig)
      } catch (err) {
        throw new Error(`Adapter "${name}" config validation failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    const state: RuntimeAdapterState = {
      definition,
      instance: null,
      context: null,
      gateways: [],
      resources: [],
      started: false,
    }
    this.#adapterStates.set(name, state)
    const context = this.#createContext(state)
    state.context = context
    const adapterLogger = this.#logger.child({ adapter: name })
    let instance: Adapter
    try {
      const result = definition.create({ config, logger: adapterLogger })
      instance = result instanceof Promise ? await result : result
    } catch (err) {
      this.#adapterStates.delete(name)
      throw new Error(`Adapter "${name}" failed to construct: ${err instanceof Error ? err.message : String(err)}`)
    }
    state.instance = instance
    try {
      await instance.start(context)
      await context.waitForStarts()
      state.started = true
    } catch (err) {
      state.started = false
      this.#adapterStates.delete(name)
      try {
        await instance.stop('startup failed')
      } catch {
        // ignore
      }
      throw new Error(`Adapter "${name}" failed to start: ${err instanceof Error ? err.message : String(err)}`)
    }
    return instance
  }

  async start(): Promise<void> {
    if (this.#started) {
      throw new Error('Runtime already started')
    }
    this.#started = true
    await this.#discoverAdapters()
    await this.#setupPlugins()
    const adapterNames = Array.from(this.#enabledAdapters.keys())
    const started: Adapter[] = []
    for (const name of adapterNames) {
      try {
        const adapter = await this.#startAdapter(name)
        started.push(adapter)
        await this.#bus.dispatch({
          kind: 'adapter',
          type: 'adapter:started',
          routes: ['adapter:started'],
          identity: { adapter: name, event_type: 'adapter:started' },
          time: Date.now(),
          payload: { name },
        })
      } catch (err) {
        this.#logger.error(err instanceof Error ? err.message : String(err))
        await this.#rollbackAdapters(started)
        throw err
      }
    }
    await this.#bus.dispatch({
      kind: 'adapter',
      type: 'runtime:ready',
      routes: ['runtime:ready'],
      identity: { adapter: '' as AdapterName, event_type: 'runtime:ready' },
      time: Date.now(),
      payload: undefined,
    })
  }

  async #rollbackAdapters(started: readonly Adapter[]): Promise<void> {
    for (let i = started.length - 1; i >= 0; i--) {
      const adapter = started[i]
      try {
        await adapter.stop('rollback')
      } catch (err) {
        this.#logger.warn(`Failed to stop adapter during rollback: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  async shutdown(reason?: string): Promise<void> {
    if (this.#stopped) return
    this.#stopped = true
    await this.#bus.dispatch({
      kind: 'adapter',
      type: 'runtime:shutdown',
      routes: ['runtime:shutdown'],
      identity: { adapter: '' as AdapterName, event_type: 'runtime:shutdown' },
      time: Date.now(),
      payload: reason ? { reason } : undefined,
    })
    const adapters = Array.from(this.#adapterStates.values())
    for (let i = adapters.length - 1; i >= 0; i--) {
      const state = adapters[i]
      if (!state.instance) continue
      try {
        await state.instance.stop(reason ?? 'shutdown')
      } catch (err) {
        this.#logger.warn(
          `Adapter "${state.definition.name}" stop failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      if (state.resources) {
        for (let r = state.resources.length - 1; r >= 0; r--) {
          try {
            await state.resources[r].dispose(reason ?? 'shutdown')
          } catch (err) {
            this.#logger.warn(
              `Resource "${state.resources[r].name}" dispose failed: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
        state.resources.length = 0
      }
      if (state.gateways) {
        for (let g = state.gateways.length - 1; g >= 0; g--) {
          try {
            await state.gateways[g].stop(reason ?? 'shutdown')
          } catch (err) {
            this.#logger.warn(
              `Gateway "${state.gateways[g].name}" stop failed: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
        state.gateways.length = 0
      }
    }
    for (const [, entry] of this.#enabledPlugins) {
      try {
        await entry.cleanup?.()
      } catch (err) {
        this.#logger.warn(
          `Plugin cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
    this.#enabledPlugins.clear()
    this.#capabilities.clear()
    this.#bots.clear()
    try {
      await this.#driver.shutdown()
    } catch (err) {
      if (!(err instanceof DriverShutdownError)) {
        this.#logger.warn(`Driver shutdown error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
}

export const createRuntime = (options: CreateRuntimeOptions): MiokiRuntime => {
  setBotCwd(options.cwd)
  reloadMiokiConfig()
  return new MiokiRuntime(options)
}

export { definePlugin }
