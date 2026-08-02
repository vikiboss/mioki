import os from 'node:os'
import cp from 'node:child_process'
import { version } from '../../../package.json' with { type: 'json' }

import { filesize, localNum, prettyMs } from '../../utils'

import type { Bot } from '../../adapter'
import type { AdapterName, AdapterStatus } from '../../types'

export type { AdapterStatus } from '../../types'

export const SystemMap: Record<string, string> = {
  Linux: 'Linux',
  Darwin: 'macOS',
  Windows_NT: 'Win',
}

export const ArchMap: Record<string, string> = {
  ia32: 'x86',
  arm: 'arm',
  arm64: 'arm64',
  x64: 'x64',
}

export interface BotStatus {
  bot_id: string
  nickname: string
  online: boolean
  adapter: AdapterName
  friends?: number
  groups?: number
  send?: number
  receive?: number
}

export interface MiokiStatus {
  bots: readonly BotStatus[]
  adapters: readonly AdapterStatus[]
  plugins: {
    enabled: number
    total: number
  }
  stats: {
    uptime: number
  }
  versions: {
    node: string
    mioki: string
  }
  system: {
    name: string
    version: string
    arch: string
  }
  memory: {
    used: number
    total: number
    percent: number
    rss: {
      used: number
      percent: number
    }
  }
  disk: {
    total: number
    used: number
    free: number
    percent: number
  }
  cpu: {
    name: string
    count: number
    percent: number
  }
}

export interface StatusProviderContext {
  readonly bot: Bot
}

export type StatusProvider = (context: StatusProviderContext) => Promise<AdapterStatus> | AdapterStatus

export interface MiokiCoreServiceContrib {
  getMiokiStatus(): Promise<MiokiStatus>
  formatMiokiStatus(status: MiokiStatus): Promise<string>
  registerStatusProvider(adapter: AdapterName, provider: StatusProvider): () => void
}

const statusProviders = new Map<AdapterName, StatusProvider>()
const statusFormatters = new Set<(status: MiokiStatus) => Promise<string> | string>()

export const registerStatusProvider = (adapter: AdapterName, provider: StatusProvider): () => void => {
  statusProviders.set(adapter, provider)
  return () => {
    statusProviders.delete(adapter)
  }
}

export const setStatusFormatter = (formatter: (status: MiokiStatus) => string | Promise<string>): void => {
  statusFormatters.clear()
  statusFormatters.add(formatter)
}

const getSystemInfo = (): { name: string; version: string; arch: string } => {
  const osType = os.type()
  const osArch = os.arch()
  const arch = ArchMap[osArch] ?? osArch
  const isUnix = ['Linux', 'Darwin'].includes(osType)
  if (isUnix) {
    return { name: SystemMap[osType] ?? osType, version: '-', arch }
  }
  return { name: SystemMap[osType] ?? osType, version: '-', arch }
}

const getCpuTimes = (): { idle: number; total: number } => {
  const cpus = os.cpus()
  let idle = 0
  let total = 0
  for (const cpu of cpus) {
    for (const type in cpu.times) total += (cpu.times as Record<string, number>)[type] ?? 0
    idle += cpu.times.idle ?? 0
  }
  return { idle, total }
}

const measureCpuUsage = async (interval = 600): Promise<number> => {
  const start = getCpuTimes()
  await new Promise((resolve) => setTimeout(resolve, interval))
  const end = getCpuTimes()
  const idleDiff = end.idle - start.idle
  const totalDiff = end.total - start.total
  if (totalDiff <= 0) return 0
  const usage = 1 - idleDiff / totalDiff
  return usage * 100
}

const getDiskUsage = (): Promise<{ total: number; used: number; free: number; percent: number }> =>
  new Promise((resolve) => {
    if (!['Linux', 'Darwin'].includes(os.type())) {
      resolve({ total: 0, used: 0, free: 0, percent: 0 })
      return
    }
    cp.exec(`df -k / | tail -1 | awk '{print $2,$4}'`, (err, stdout) => {
      if (err) {
        resolve({ total: 0, used: 0, free: 0, percent: 0 })
        return
      }
      const [totalStr, freeStr] = stdout.trim().split(' ')
      const total = Number(totalStr) * 1024
      const free = Number(freeStr) * 1024
      const used = total - free
      resolve({ total, free, used, percent: total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0 })
    })
  })

export interface BuildStatusOptions {
  readonly bots: readonly Bot[]
  readonly adapters: readonly { readonly name: AdapterName; readonly version?: string }[]
  readonly enabledPlugins: number
  readonly totalPlugins: number
  readonly systemInfoProvider?: () => Promise<{ distro: string; release: string }>
}

export const buildMiokiStatus = async (options: BuildStatusOptions): Promise<MiokiStatus> => {
  const sysInfo = options.systemInfoProvider ? await options.systemInfoProvider() : null
  const defaultSystem = getSystemInfo()
  const system = sysInfo
    ? { name: sysInfo.distro, version: sysInfo.release, arch: defaultSystem.arch }
    : defaultSystem
  const cpu = (() => {
    const cpus = os.cpus()
    return { name: cpus[0]?.model ?? '[未知CPU]', count: cpus.length }
  })()
  const totalMem = os.totalmem()
  const usedMem = totalMem - os.freemem()
  const rssMem = process.memoryUsage.rss()
  const [disk, cpuPercent] = await Promise.all([getDiskUsage(), measureCpuUsage()])
  const adapterStatuses: AdapterStatus[] = []
  for (const adapter of options.adapters) {
    const provider = statusProviders.get(adapter.name)
    const adapterBot = options.bots.find((bot) => bot.adapter === adapter.name)
    if (provider && adapterBot) {
      try {
        const result = await provider({ bot: adapterBot })
        adapterStatuses.push({
          adapter: adapter.name,
          version: result.version ?? adapter.version,
          data: result.data,
        })
      } catch {
        adapterStatuses.push({ adapter: adapter.name, version: adapter.version, data: {} })
      }
    } else {
      adapterStatuses.push({ adapter: adapter.name, version: adapter.version, data: {} })
    }
  }
  return {
    bots: options.bots.map((bot) => {
      const adapterStatus = adapterStatuses.find((a) => a.adapter === bot.adapter)
      const data = adapterStatus?.data as Record<string, unknown> | undefined
      return {
        bot_id: bot.bot_id,
        nickname: bot.nickname ?? '',
        online: bot.online,
        adapter: bot.adapter,
        friends: typeof data?.friends === 'number' ? data.friends : undefined,
        groups: typeof data?.groups === 'number' ? data.groups : undefined,
        send: typeof data?.send === 'number' ? data.send : undefined,
        receive: typeof data?.receive === 'number' ? data.receive : undefined,
      }
    }),
    adapters: adapterStatuses,
    plugins: { enabled: options.enabledPlugins, total: options.totalPlugins },
    stats: { uptime: process.uptime() * 1000 },
    versions: { node: process.versions.node, mioki: version },
    system,
    memory: {
      used: usedMem,
      total: totalMem,
      percent: totalMem > 0 ? Number(((usedMem / totalMem) * 100).toFixed(1)) : 0,
      rss: {
        used: rssMem,
        percent: totalMem > 0 ? Number(((rssMem / totalMem) * 100).toFixed(1)) : 0,
      },
    },
    disk,
    cpu: { name: cpu.name.trim(), count: cpu.count, percent: Number(cpuPercent.toFixed(1)) },
  }
}

export const formatMiokiStatus = async (status: MiokiStatus): Promise<string> => {
  const { bots, plugins, system, disk, cpu, memory, versions, adapters } = status
  const [firstFormatter] = statusFormatters
  if (firstFormatter) return await firstFormatter(status)

  const diskValid = disk.total > 0 && disk.free >= 0
  const diskDesc = diskValid ? `${disk.percent}%-${filesize(disk.used, { round: 1 })}/${filesize(disk.total, { round: 1 })}` : ''

  const botLines = bots
    .map((bot) => {
      const hasStats = bot.friends != null || bot.groups != null || bot.send != null || bot.receive != null
      const statsLine = hasStats
        ? `\n📋 ${localNum(bot.friends ?? 0)} 好友 / ${localNum(bot.groups ?? 0)} 群 / 📮 收 ${localNum(bot.receive ?? 0)} 发 ${localNum(bot.send ?? 0)}`
        : ''
      return `👤 ${bot.nickname || '(未命名)'} (${bot.bot_id})${statsLine}`
    })
    .join('\n')

  const totalSend = bots.reduce((sum, bot) => sum + (bot.send ?? 0), 0)
  const totalReceive = bots.reduce((sum, bot) => sum + (bot.receive ?? 0), 0)
  const statsLine = bots.length > 1 ? `\n📮 总计: 收 ${localNum(totalReceive)} 条，发 ${localNum(totalSend)} 条` : ''

  const adapter = adapters[0]
  const adapterLine = adapter ? `${adapter.adapter}/${adapter.version ?? ''}` : `node/${versions.node.split('.')[0]}`

  return `
〓 🟢 mioki 状态 〓
${botLines || '(无在线 Bot)'}
🧩 启用了 ${localNum(plugins.enabled)} 个插件，共 ${localNum(plugins.total)} 个${statsLine}
🚀 ${filesize(memory.rss.used, { round: 1 })}/${memory.percent}%
⏳ 已运行 ${prettyMs(status.stats.uptime, { hideYear: true, secondsDecimalDigits: 0 })}
🤖 mioki/${versions.mioki}-${adapterLine}
🖥️ ${system.name.split(' ')[0]}/${system.version.split('.')[0]}-${system.name}-node/${versions.node.split('.')[0]}
📊 ${memory.percent}%-${filesize(memory.used, { base: 2, round: 1 })}/${filesize(memory.total, { base: 2, round: 1 })}
🧮 ${cpu.percent}%-${cpu.name}-${cpu.count}核
${diskValid ? `💾 ${diskDesc}` : ''}
  `.trim()
}
