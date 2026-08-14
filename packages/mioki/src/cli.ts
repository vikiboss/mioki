#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import mri from 'mri'
import dedent from 'dedent'
import consola from 'consola'
import { version } from '../package.json'

import type { ConfirmPromptOptions, TextPromptOptions } from 'consola'

const args = process.argv.slice(2)

interface CliOptions {
  name?: string
  prefix?: string
  owners?: string
  admins?: string
  help?: boolean
  version?: boolean
  'use-npm-mirror'?: boolean
}

interface StorePackage {
  name: string
  description: string
  version: string
}

interface AdapterCliContext {
  cwd: string
}

type OmitTypeWithRequired<T> = Omit<T, 'type' | 'required'> & { required?: boolean }

const NPM_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search'

const confirm = async (message: string, options?: OmitTypeWithRequired<ConfirmPromptOptions>): Promise<boolean> =>
  (await consola.prompt(message, { type: 'confirm', cancel: 'reject', ...options })) as boolean

const input = async (message: string, options?: OmitTypeWithRequired<TextPromptOptions>): Promise<string> => {
  let result: string
  do {
    result = (await consola.prompt(message, { type: 'text', cancel: 'reject', ...options })) as string
    if (options?.required && !result) continue
    break
  } while (true)
  return result
}

const searchStore = async (keyword: string): Promise<StorePackage[]> => {
  const url = new URL(NPM_SEARCH_URL)
  url.searchParams.set('text', 'mioki')
  url.searchParams.set('size', '200')
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`npm 搜索失败 (HTTP ${res.status})`)
  const data = (await res.json()) as { objects?: { package?: { name?: string; description?: string; version?: string; keywords?: string[] } }[] }
  const list: StorePackage[] = []
  for (const obj of data?.objects || []) {
    const pkg = obj?.package
    if (!pkg?.name) continue
    const name = String(pkg.name).trim()
    if (!name.startsWith(keyword)) continue
    const keywords = Array.isArray(pkg.keywords) ? pkg.keywords.map(String) : []
    if (!keywords.includes('mioki')) continue
    list.push({
      name,
      description: String(pkg.description || '').trim(),
      version: String(pkg.version || '').trim(),
    })
  }
  return list
}

const pickPackages = async (
  promptText: string,
  keyword: string,
): Promise<StorePackage[]> => {
  const install = await confirm(promptText, { initial: true })
  if (!install) return []

  let list: StorePackage[] = []
  try {
    list = await searchStore(keyword)
  } catch (err) {
    consola.warn(err instanceof Error ? err.message : String(err))
    consola.info(`无法从 npm 获取列表，请稍后手动安装包`)
    return []
  }
  if (list.length === 0) {
    consola.info(`没有找到相关包，可稍后手动安装`)
    return []
  }

  const options = list.map((p) => ({
    label: `${p.name}${p.description ? ` — ${p.description.slice(0, 40)}` : ''}`,
    value: p.name,
  }))
  const selected = (await consola.prompt(promptText, {
    type: 'multiselect',
    options,
    required: false,
  })) as Array<string | { label: string; value: string }>

  const selectedNames = new Set(selected.map((s) => (typeof s === 'string' ? s : s.value)))

  return list.filter((p) => selectedNames.has(p.name))
}

const resolveAdapterConfigCliEntry = async (
  projectPath: string,
  adapterName: string,
): Promise<{ resolve: () => Promise<{ default?: (ctx: AdapterCliContext) => Promise<unknown>; run?: (ctx: AdapterCliContext) => Promise<unknown> }> } | null> => {
  const pkgDir = path.join(projectPath, 'node_modules', adapterName)
  const pkgFile = path.join(pkgDir, 'package.json')
  if (!fs.existsSync(pkgFile)) return null

  type PackageJson = {
    name?: string
    exports?: string | Record<string, unknown>
  }
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8')) as PackageJson

  const pickFromExports = (exportsField: PackageJson['exports']): string | null => {
    if (!exportsField || typeof exportsField !== 'object') return null
    const map = exportsField as Record<string, unknown>
    const cliEntry = map['./cli']
    if (!cliEntry) return null
    if (typeof cliEntry === 'string') return cliEntry
    if (typeof cliEntry === 'object') {
      const obj = cliEntry as Record<string, unknown>
      return (obj.import as string | undefined) ?? (obj.require as string | undefined) ?? null
    }
    return null
  }

  let relEntry: string | null = null
  if (pkg.exports) relEntry = pickFromExports(pkg.exports)

  if (!relEntry) {
    const candidateTs = path.join(pkgDir, 'src', 'cli.ts')
    const candidateMjs = path.join(pkgDir, 'dist', 'cli.mjs')
    if (fs.existsSync(candidateTs)) relEntry = './src/cli.ts'
    else if (fs.existsSync(candidateMjs)) relEntry = './dist/cli.mjs'
  }

  if (!relEntry) return null

  const absEntry = path.resolve(pkgDir, relEntry)
  const url = pathToFileURL(absEntry).href
  return {
    resolve: async () => (await import(url)) as { default?: (ctx: AdapterCliContext) => Promise<unknown>; run?: (ctx: AdapterCliContext) => Promise<unknown> },
  }
}

const runAdapterCliProgrammatic = async (
  projectPath: string,
  adapterName: string,
): Promise<unknown> => {
  const entry = await resolveAdapterConfigCliEntry(projectPath, adapterName)
  if (!entry) {
    consola.warn(`未在 ${adapterName} 包中找到 cli 入口，请稍后手动运行：npx ${adapterName}`)
    return undefined
  }
  const mod = await entry.resolve()
  const fn = mod.default ?? mod.run
  if (typeof fn !== 'function') {
    consola.warn(`${adapterName} 的 cli 入口未导出默认函数，请稍后手动运行：npx ${adapterName}`)
    return undefined
  }
  return await fn({ cwd: projectPath })
}

const adapterNameKey = (pkgName: string): string => {
  const prefix = 'mioki-adapter-'
  return pkgName.startsWith(prefix) ? pkgName.slice(prefix.length) : pkgName
}

const runCommand = (cmd: string, args: string[], cwd: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' })
    child.on('error', (err) => {
      consola.warn(`执行命令失败: ${err.message}`)
      resolve(false)
    })
    child.on('close', (code) => resolve(code === 0))
  })
}

const mergeAdapterConfigsIntoPackageJson = async (
  projectPath: string,
  adapterConfigs: Record<string, unknown>,
): Promise<void> => {
  const pkgPath = path.join(projectPath, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { mioki?: Record<string, unknown> }
  pkg.mioki = pkg.mioki ?? {}
  pkg.mioki.adapters = { ...(pkg.mioki.adapters as Record<string, unknown> | undefined), ...adapterConfigs }
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
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

function gracefullyExit(): void {
  console.log('Bye!')
  process.exit(0)
}

async function createNewProject(name: string, fileTree: Record<string, unknown>): Promise<string> {
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

  console.log(`项目 ${projectName} 创建成功！`)
  return projectPath
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
  const prefix = cli.prefix ?? (await input('请输入消息命令前缀', { default: '#', placeholder: '#', required: true }))
  const admins = cli.admins ?? ((await input('请输入管理员 QQ (插件权限，英文逗号分隔，可空)', { placeholder: '可空' })) || '')
  const useNpmMirror =
    cli['use-npm-mirror'] ?? (await confirm('是否使用 npm 镜像源加速依赖安装？', { initial: false }))

  consola.info('接下来选择要安装的适配器')
  const adapters = await pickPackages('是否安装适配器？', 'mioki-adapter-')

  consola.info('接下来选择要安装的插件')
  const plugins = await pickPackages('是否安装插件？', 'mioki-plugin-')

  const deps: string[] = [`"mioki": "^${version}"`]
  for (const a of adapters) deps.push(`"${a.name}": "^${a.version || '1.0.0'}"`)
  for (const p of plugins) deps.push(`"${p.name}": "^${p.version || '1.0.0'}"`)

  const pluginIds = plugins
    .map((p) => p.name.slice('mioki-plugin-'.length))
    .map((id) => `"${id}"`)
    .join(', ')

  const pkgJson = dedent(`
  {
    "name": "mioki-bot",
    "private": true,
    "type": "module",
    "dependencies": {
      ${deps.join(',\n      ')}
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
      "plugins": [${pluginIds}],
      "log_level": "info",
      "online_push": true,
      "error_push": true
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

  const projectPath = await createNewProject(name, fileTree)

  if (adapters.length > 0) {
    consola.info('')
    const installNow = await confirm('是否立即安装依赖并配置适配器连接参数？', { initial: true })
    if (installNow) {
      consola.info('正在安装依赖，请稍候...')
      const installOk = await runCommand('npm', ['install'], projectPath)
      if (!installOk) {
        consola.warn('依赖安装失败，请稍后手动执行 npm install 后再运行各适配器的配置向导')
      } else {
        const adapterConfigs: Record<string, unknown> = {}
        for (const adapter of adapters) {
          consola.info('')
          consola.info(`正在进入 ${adapter.name} 配置向导...`)
          const config = await runAdapterCliProgrammatic(projectPath, adapter.name)
          if (config !== undefined) adapterConfigs[adapterNameKey(adapter.name)] = config
        }
        if (Object.keys(adapterConfigs).length > 0) {
          await mergeAdapterConfigsIntoPackageJson(projectPath, adapterConfigs)
          consola.success('适配器配置已写入 package.json')
        }
      }
    } else {
      consola.info('跳过依赖安装与配置向导，可稍后手动运行：')
      consola.info(`cd ${projectPath}`)
      consola.info('npm install')
      for (const adapter of adapters) {
        consola.info(`npx ${adapter.name}`)
      }
    }
  }

  console.log('')
  console.log(`启动机器人: cd ${path.resolve(process.cwd(), `./${name}`)} && npm start`)
})()
