import os from 'node:os'
import cp from 'node:child_process'
import pm from 'pretty-ms'
import { BUILTIN_PLUGINS } from '..'
import { filesize, localNum, systemInfo } from '../../utils'
import { findLocalPlugins, runtimePlugins } from '../../plugin'
import { version } from '../../../package.json' with { type: 'json' }

import type { NapCat } from 'napcat-sdk'

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

export interface MiokiStatus {
  bot: {
    uin: number
    nickname: string
    friends: number
    groups: number
    // guilds: number
  }
  plugins: {
    enabled: number
    total: number
  }
  stats: {
    uptime: number
    send: number
    receive: number
  }
  // platform: {
  //   name: string
  //   version: string
  //   subid: string
  // }
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

export async function getMiokiStatus(bot: NapCat): Promise<MiokiStatus> {
  const osType = os.type()
  const osArch = os.arch()
  const isInUnix = ['Linux', 'Darwin'].includes(osType)
  const arch = ArchMap[osArch] || osArch

  const [osInfo, localPlugins, versionInfo, friendList, groupList] = await Promise.all([
    systemInfo.osInfo(),
    findLocalPlugins(),
    bot.getVersionInfo(),
    bot.getFriendList(),
    bot.getGroupList(),
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

  return {
    bot: {
      uin: bot.uin,
      nickname: bot.nickname,
      friends: friendList.length,
      groups: groupList.length,
      // guilds: bot.guilds.size,
    },
    plugins: {
      enabled: runtimePlugins.size,
      total: pluginCount,
    },
    stats: {
      uptime: process.uptime() * 1000,
      send: bot.stat.send.group + bot.stat.send.private,
      receive: bot.stat.recv.group + bot.stat.recv.private,
    },
    versions: {
      node: nodeVersion,
      // icqq: oicqVersion,
      mioki: version,
      napcat: versionInfo.app_version,
      protocol: versionInfo.protocol_version,
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

export async function getMiokiStatusStr(client: NapCat): Promise<string> {
  const { bot, plugins, stats, system, disk, cpu, memory, versions } = await getMiokiStatus(client)

  const diskValid = disk.total > 0 && disk.free >= 0
  const diskDesc = `${disk.percent}%-${filesize(disk.used, { round: 1 })}/${filesize(disk.total, { round: 1 })}`

  return `
👤 ${bot.nickname}
🆔 ${bot.uin}
📋 ${localNum(bot.friends)} 好友 / ${localNum(bot.groups)} 群
🧩 启用了 ${localNum(plugins.enabled)} 个插件，共 ${localNum(plugins.total)} 个
📮 收 ${localNum(stats.receive)} 条，发 ${localNum(stats.send)} 条
🚀 ${filesize(memory.rss.used, { round: 1 })}/${memory.percent}%
⏳ 已运行 ${pm(stats.uptime, { hideYear: true, secondsDecimalDigits: 0 })}
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
