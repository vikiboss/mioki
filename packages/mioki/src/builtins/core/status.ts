import os from 'node:os'
import cp from 'node:child_process'
import { version } from '../../../package.json' with { type: 'json' }
import { BUILTIN_PLUGINS } from '..'
import { findLocalPlugins, runtimePlugins } from '../../plugin'
import { prettyMs, filesize, localNum, systemInfo } from '../..'

import type { NapCat } from 'napcat-sdk'
import type { BotInfo } from '../../start'

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
  uin: number
  nickname: string
  name?: string
  friends: number
  groups: number
  send: number
  receive: number
}

export interface MiokiStatus {
  bots: BotStatus[]
  plugins: {
    enabled: number
    total: number
  }
  stats: {
    uptime: number
    send: number
    receive: number
  }
  versions: {
    node: string
    mioki: string
    napcat: string
    protocol: string
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

export async function getMiokiStatus(bots: BotInfo[]): Promise<MiokiStatus> {
  const osType = os.type()
  const osArch = os.arch()
  const isInUnix = ['Linux', 'Darwin'].includes(osType)
  const arch = ArchMap[osArch] || osArch

  const [osInfo, localPlugins] = await Promise.all([
    systemInfo.osInfo(),
    findLocalPlugins(),
  ])

  const pluginCount = localPlugins.length + BUILTIN_PLUGINS.length

  const system = isInUnix
    ? { name: osInfo.distro, version: osInfo.release }
    : { name: SystemMap[osType] || osType, version: '-' }

  const totalMem = os.totalmem()
  const usedMem = totalMem - os.freemem()
  const rssMem = process.memoryUsage.rss()

  const nodeVersion = process.versions.node
  const cpu = getCpuInfo()

  // 获取所有 bot 的状态
  const botStatuses: BotStatus[] = []
  let totalSend = 0
  let totalReceive = 0
  let mainVersionInfo = { app_version: 'unknown', protocol_version: 'unknown' }

  for (const botInfo of bots) {
    const { napcat: bot, user_id, nickname, name } = botInfo
    try {
      const [versionInfo, friendList, groupList] = await Promise.all([
        bot.getVersionInfo(),
        bot.getFriendList(),
        bot.getGroupList(),
      ])

      mainVersionInfo = versionInfo

      botStatuses.push({
        uin: user_id,
        nickname,
        name,
        friends: friendList.length,
        groups: groupList.length,
        send: bot.stat.send.group + bot.stat.send.private,
        receive: bot.stat.recv.group + bot.stat.recv.private,
      })

      totalSend += bot.stat.send.group + bot.stat.send.private
      totalReceive += bot.stat.recv.group + bot.stat.recv.private
    } catch (err) {
      botStatuses.push({
        uin: user_id,
        nickname,
        name,
        friends: 0,
        groups: 0,
        send: 0,
        receive: 0,
      })
    }
  }

  return {
    bots: botStatuses,
    plugins: {
      enabled: runtimePlugins.size,
      total: pluginCount,
    },
    stats: {
      uptime: process.uptime() * 1000,
      send: totalSend,
      receive: totalReceive,
    },
    versions: {
      node: nodeVersion,
      mioki: version,
      napcat: mainVersionInfo.app_version,
      protocol: mainVersionInfo.protocol_version,
    },
    system: {
      name: system.name || 'N/A',
      version: system.version || 'N/A',
      arch: arch,
    },
    memory: {
      used: usedMem,
      total: totalMem,
      percent: Number(((usedMem / totalMem) * 100).toFixed(1)),
      rss: {
        used: rssMem,
        percent: Number(((rssMem / totalMem) * 100).toFixed(1)),
      },
    },
    disk: isInUnix ? await getDiskUsageInUnix() : { total: 0, used: 0, free: 0, percent: 0 },
    cpu: {
      name: cpu.name.trim(),
      count: cpu.count,
      percent: Number((await measureCpuUsage()).toFixed(1)),
    },
  }
}

export async function formatMiokiStatus(status: MiokiStatus): Promise<string> {
  const { bots, plugins, stats, system, disk, cpu, memory, versions } = status

  const diskValid = disk.total > 0 && disk.free >= 0
  const diskDesc = `${disk.percent}%-${filesize(disk.used, { round: 1 })}/${filesize(disk.total, { round: 1 })}`

  const botLines = bots.map((bot, index) => {
    const namePrefix = bot.name ? `[${bot.name}] ` : ''
    return `👤 ${namePrefix}${bot.nickname} (${bot.uin})\n   📋 ${localNum(bot.friends)} 好友 / ${localNum(bot.groups)} 群 / 📮 收 ${localNum(bot.receive)} 发 ${localNum(bot.send)}`
  }).join('\n')

  return `
〓 🟢 mioki 状态 〓
${botLines}
🧩 启用了 ${localNum(plugins.enabled)} 个插件，共 ${localNum(plugins.total)} 个
📮 总计: 收 ${localNum(stats.receive)} 条，发 ${localNum(stats.send)} 条
🚀 ${filesize(memory.rss.used, { round: 1 })}/${memory.percent}%
⏳ 已运行 ${prettyMs(stats.uptime, { hideYear: true, secondsDecimalDigits: 0 })}
🤖 mioki/${versions.mioki}-NapCat/${versions.napcat}
🖥️ ${system.name.split(' ')[0]}/${system.version.split('.')[0]}-${system.name}-node/${versions.node.split('.')[0]}
📊 ${memory.percent}%-${filesize(memory.used, { base: 2, round: 1 })}/${filesize(memory.total, { base: 2, round: 1 })}
🧮 ${cpu.percent}%-${cpu.name}-${cpu.count}核
${diskValid ? `💾 ${diskDesc}` : ''}
  `.trim()
}

async function getDiskUsageInUnix(path = '/'): Promise<{ total: number; used: number; free: number; percent: number }> {
  return new Promise((resolve) => {
    cp.exec(`df -k ${path} | tail -1 | awk '{print $2,$4}'`, (err, stdout) => {
      if (err) {
        console.error(err)
        return resolve({ total: 0, used: 0, free: 0, percent: 0 })
      }

      const [_total, _free] = stdout.trim().split(' ')

      const total = Number(_total) * 1024
      const free = Number(_free) * 1024
      const used = total - free

      resolve({ total, free, used, percent: Number(((used / total) * 100).toFixed(1)) })
    })
  })
}

async function measureCpuUsage(interval = 600): Promise<number> {
  const start = getCpuTimes()
  await new Promise((resolve) => setTimeout(resolve, interval))
  const end = getCpuTimes()
  const idleDiff = end.idle - start.idle
  const totalDiff = end.total - start.total
  const usage = 1 - idleDiff / totalDiff

  return usage * 100
}

function getCpuTimes(): { idle: number; total: number } {
  const cpus = os.cpus()
  let idle = 0
  let total = 0
  for (const cpu of cpus) {
    for (const type in cpu.times) total += cpu.times[type as never]
    idle += cpu.times.idle
  }
  return { idle, total }
}

function getCpuInfo() {
  const cpus = os.cpus()
  const cpu = cpus[0]

  return {
    name: cpu?.model || '[未知CPU]',
    count: cpus.length,
  }
}
