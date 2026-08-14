#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import consola from 'consola'

import type { ConfirmPromptOptions, TextPromptOptions } from 'consola'

type ConfirmOpts = Omit<ConfirmPromptOptions, 'type' | 'required'> & { required?: boolean }
type TextOpts = Omit<TextPromptOptions, 'type' | 'required'> & { required?: boolean }

const confirm = async (message: string, options?: ConfirmOpts): Promise<boolean> =>
  (await consola.prompt(message, { type: 'confirm', cancel: 'reject', ...options })) as boolean

const input = async (message: string, options?: TextOpts): Promise<string> => {
  let result: string
  do {
    result = (await consola.prompt(message, { type: 'text', cancel: 'reject', ...options })) as string
    if (options?.required && !result) continue
    break
  } while (true)
  return result
}

const select = <T extends string>(message: string, options: Array<{ label: string; value: T }>): Promise<T> =>
  consola.prompt(message, { type: 'select', cancel: 'reject', options }) as Promise<T>

export interface OneBotCliContext {
  readonly cwd: string
  readonly logger?: typeof consola
}

export interface OneBotInstanceInput {
  protocol: 'ws' | 'wss'
  host: string
  port: number
  token?: string
  reconnect: boolean
}

export interface OneBotCliConfig {
  instances: OneBotInstanceInput[]
}

export const run = async (ctx: OneBotCliContext): Promise<OneBotCliConfig> => {
  const log = ctx.logger ?? consola
  log.info(`正在配置 onebotv11 适配器连接参数`)
  log.info('')

  const instances: OneBotInstanceInput[] = []
  let addMore = true
  while (addMore) {
    const protocol = await select('连接协议', [
      { label: 'ws (未加密)', value: 'ws' as const },
      { label: 'wss (加密)', value: 'wss' as const },
    ])
    const hostRaw = await input('NapCat 主机地址', {
      default: 'localhost',
      placeholder: 'localhost',
    })
    const host = hostRaw || 'localhost'
    const portRaw = await input('NapCat 端口', { default: '3001', placeholder: '3001' })
    const port = Number(portRaw) || 3001
    const token = await input('访问令牌 (可空)', { placeholder: '可空' })
    const reconnect = await confirm('断线自动重连？', { initial: true })

    const instance: OneBotInstanceInput = {
      protocol: protocol === 'wss' ? 'wss' : 'ws',
      host,
      port,
      reconnect,
    }
    if (token) instance.token = token
    instances.push(instance)
    addMore = await confirm('是否继续添加连接实例？', { initial: false })
    if (addMore) log.info('')
  }

  return { instances }
}

const isRunningAsMain = (): boolean => {
  if (!process.argv[1]) return false
  try {
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  } catch {
    return false
  }
}

if (isRunningAsMain()) {
  void (async () => {
    const cwd = process.cwd()
    const pkgPath = path.join(cwd, 'package.json')
    if (!fs.existsSync(pkgPath)) {
      consola.error('未找到 package.json，请在机器人项目根目录运行此向导')
      process.exit(1)
    }
    const config = await run({ cwd })
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { mioki?: Record<string, unknown> }
    pkg.mioki = pkg.mioki ?? {}
    const adapters = (pkg.mioki.adapters as Record<string, unknown> | undefined) ?? {}
    pkg.mioki.adapters = { ...adapters, onebotv11: config }
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
    consola.success('已写入 onebotv11 适配器配置')
  })()
}

export default run
