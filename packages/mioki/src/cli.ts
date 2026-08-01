#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import mri from 'mri'
import dedent from 'dedent'
import consola from 'consola'
import { version } from '../package.json'

import type { ConfirmPromptOptions, TextPromptOptions } from 'consola'

const args = process.argv.slice(2)

interface CliOptions {
  name?: string
  host?: string
  port?: number
  token?: string
  prefix?: string
  owners?: string
  admins?: string
  help?: boolean
  version?: boolean
  'use-npm-mirror'?: boolean
}

;(async () => {
  const cli = mri<CliOptions>(args, {
    alias: { v: 'version', h: 'help' },
  })

  const helpInfo = dedent(
    `
  mioki 命令行工具 v${version}

  用法: mioki <命令> [选项]

  选项:
  -h, --help              显示帮助信息
  -v, --version           显示版本号

  --name <name>           指定项目/文件夹名称，默认 bot
  --host <host>           指定 NapCat 主机，默认 localhost
  --port <port>           指定 NapCat 端口，默认 3001
  --token <token>         指定 NapCat 连接 Token，默认空
  --prefix <prefix>       指定命令前缀，默认 #
  --owners <owners>       指定主人 QQ，英文逗号分隔，必填
  --admins <admins>       指定管理员 QQ，英文逗号分隔，可空
  --use-npm-mirror        使用 npm 镜像源加速依赖安装，默认否
`,
  )

  if (cli.version) {
    console.log(`v${version}`)
    process.exit(0)
  }
  if (cli.help) {
    console.log(helpInfo)
    process.exit(0)
  }

  const name =
    cli.name ?? (await input('请输入项目名称', { default: 'bot', placeholder: 'bot', required: true }))
  const owners =
    cli.owners ?? (await input('请输入主人 QQ (最高权限，英文逗号分隔，必填)', {
      placeholder: '请输入',
      default: '',
      required: true,
    }))
  const token = cli.token ?? (await input('请输入 NapCat WS Token', { default: '', placeholder: '请输入' }))
  const host = cli.host ?? (await input('请输入 NapCat WS 主机', { default: 'localhost', placeholder: 'localhost', required: true }))
  const port = cli.port ?? parseInt(await input('请输入 NapCat WS 端口', { default: '3001', placeholder: '3001', required: true }))
  const prefix = cli.prefix ?? (await input('请输入消息命令前缀', { default: '#', placeholder: '#', required: true }))
  const admins = cli.admins ?? ((await input('请输入管理员 QQ (插件权限，英文逗号分隔，可空)', { placeholder: '可空' })) || '')
  const useNpmMirror =
    cli['use-npm-mirror'] ?? (await confirm('是否使用 npm 镜像源加速依赖安装？', { initial: false }))

  const pkgJson = dedent(`
  {
    "name": "mioki-bot",
    "private": true,
    "type": "module",
    "dependencies": {
      "mioki": "^${version}",
      "mioki-adapter-napcat": "^${version}"
    },
    "mioki": {
      "prefix": "${prefix}",
      "owners": [${String(owners)
        .split(',')
        .map((o) => `"${o.trim()}"`)
        .join(', ')}],
      "admins": [${
        admins
          ? String(admins)
              .split(',')
              .map((o) => `"${o.trim()}"`)
              .join(', ')
          : ''
      }],
      "plugins": [],
      "log_level": "info",
      "online_push": true,
      "error_push": true,
      "adapters": {
        "napcat": {
          "instances": [
            {
              "protocol": "ws",
              "host": "${host}",
              "port": ${port},
              "token": "${token}"
            }
          ]
        }
      }
    },
    "scripts": {
      "start": "node app.ts"
    }
  }
`)

  const pluginCode = dedent(`
  import { definePlugin } from 'mioki'

  export default definePlugin({
    name: 'demo',
    version: '${version}',
    async setup(ctx) {
      ctx.logger.info('Demo 插件已加载')

      // ctx.bot?.nickname
      // ctx.bot?.sendMessage(...)

      // ctx.handle('message', async (event) => {
      //   await event.reply('Hello!', { quote: true })
      // })
    },
    teardown() {
      // optional cleanup
    },
  })
`)

  const npmrc = dedent(`
  registry=https://registry.npmmirror.com
  fund=false
`)

  const appTs = dedent(`
  import { start } from 'mioki'

  await start({ cwd: import.meta.dirname })
`)

  const fileTree = {
    'app.ts': appTs,
    'package.json': pkgJson,
    plugins: { demo: { 'index.ts': pluginCode } },
    ...(useNpmMirror ? { '.npmrc': npmrc } : {}),
  }

  createNewProject(name, fileTree)
})()

async function createNewProject(name: string, fileTree: Record<string, unknown>): Promise<void> {
  const projectName = name
  const projectPath = path.resolve(process.cwd(), `./${projectName}`)

  if (fs.existsSync(projectPath)) {
    const overwrite = await confirm(`项目 ${projectName} 已存在，是否覆盖？`)
    if (!overwrite) gracefullyExit()
    if (projectPath === process.cwd()) {
      if (fs.readdirSync(projectPath).length !== 0) {
        const confirmOver = await confirm('项目路径与当前路径相同，将删除当前目录下所有内容再创建，是否继续？')
        if (!confirmOver) gracefullyExit()
      }
    }
    fs.rmSync(projectPath, { recursive: true })
  }

  fs.mkdirSync(projectPath)
  makeFileTree(fileTree, projectPath)

  console.log(`项目 ${projectName} 创建成功！根据下面的引导启动 mioki。`)
  console.log(`\ncd ${projectPath} && npm install && npm start\n`)
}

function gracefullyExit(): void {
  console.log('Bye!')
  process.exit(0)
}

type OmitTypeWithRequired<T> = Omit<T, 'type' | 'required'> & { required?: boolean }

async function confirm(message: string, options?: OmitTypeWithRequired<ConfirmPromptOptions>): Promise<boolean> {
  return (await consola.prompt(message, { type: 'confirm', cancel: 'reject', ...options })) as boolean
}

async function input(message: string, options?: OmitTypeWithRequired<TextPromptOptions>): Promise<string> {
  let result: string
  do {
    result = (await consola.prompt(message, { type: 'text', cancel: 'reject', ...options })) as string
    if (options?.required && !result) continue
    break
  } while (true)
  return result
}

function makeFileTree(fileTree: Record<string, unknown>, base: string): void {
  for (const [name, content] of Object.entries(fileTree)) {
    if (typeof content === 'object' && content !== null) {
      const subPath = `${base}/${name}`
      if (!fs.existsSync(subPath)) fs.mkdirSync(subPath)
      for (const [subName, subContent] of Object.entries(content as Record<string, unknown>)) {
        if (typeof subContent === 'object' && subContent !== null) {
          makeFileTree(content as Record<string, unknown>, subPath)
        } else {
          fs.writeFileSync(`${subPath}/${subName}`, String(subContent))
        }
      }
    } else {
      const filePath = `${base}/${name}`
      const dirname = path.dirname(filePath)
      if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, { recursive: true })
      fs.writeFileSync(filePath, String(content))
    }
  }
}