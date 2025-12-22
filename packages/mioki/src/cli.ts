#!/usr/bin/env node

import fs from 'node:fs'
import mri from 'mri'
import path from 'node:path'
import dedent from 'dedent'
import consola from 'consola'
import { version } from '../package.json'

import type { ConfirmPromptOptions, TextPromptOptions } from 'consola'

const args = process.argv.slice(2)

interface CliOptions {
  name?: string
  protocol?: string
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
    alias: {
      v: 'version',
      h: 'help',
    },
  })

  const helpInfo = dedent(
    `
  mioki 命令行工具 v${version}
  
  用法: mioki <命令> [选项]
  
  选项:
  -h, --help              显示帮助信息
  -v, --version           显示版本号
  --name <name>           指定项目名称
  --protocol <protocol>   指定 NapCat 协议，默认 ws
  --host <host>           指定 NapCat 主机，默认 localhost
  --port <port>           指定 NapCat 端口，默认 3333
  --token <token>         指定 NapCat 连接令牌
  --prefix <prefix>       指定命令前缀，默认 #
  --owners <owners>       指定主人 QQ，英文逗号分隔
  --admins <admins>       指定管理员 QQ，英文逗号分隔
  --use-npm-mirror        使用 npm 镜像源加速依赖安装
`,
  )

  switch (true) {
    case cli.version:
      console.log(`v${version}`)
      process.exit(0)

    case cli.help:
      console.log(helpInfo)
      process.exit(0)
  }

  const {
    name = await input('请输入项目名称', { default: 'bot', placeholder: 'bot', required: true }),
    protocol = await input('请输入 NapCat WS 协议', { default: 'ws', placeholder: 'ws', required: true }),
    host = await input('请输入 NapCat WS 主机', { default: 'localhost', placeholder: 'localhost', required: true }),
    port = parseInt(await input('请输入 NapCat WS 端口', { default: '3333', placeholder: '3333', required: true })),
    token = await input('请输入 NapCat WS Token（必填）', { default: '', placeholder: '请输入', required: true }),
    prefix = await input('请输入消息命令前缀', { default: '#', placeholder: '#', required: true }),
    owners = await input('请输入主人 QQ (最高权限，英文逗号分隔，必填)', { placeholder: '请输入', required: true }),
    admins = (await input('请输入管理员 QQ (插件权限，英文逗号分隔，可空)', { placeholder: '可空' })) || '',
    'use-npm-mirror': useNpmMirror = await confirm('是否使用 npm 镜像源加速依赖安装？'),
  } = cli

  const pkgJson = dedent(`
  {
    "name": "mioki-bot",
    "private": true,
    "dependencies": {
      "mioki": "^${version}"
    },
    "mioki": {
      "prefix": "${prefix}",
      "owners": [${owners
        .split(',')
        .map((o) => o.trim())
        .join(', ')}],
      "admins": [${
        admins
          ? admins
              .split(',')
              .map((o) => `"${o.trim()}"`)
              .join(', ')
          : ''
      }],
      "plugins": [],
      "log_level": "info",
      "online_push": true,
      "error_push": true,
      "napcat": {
        "protocol": "${protocol}",
        "port": ${port},
        "host": "${host}",
        "token": "${token}"
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

      // ctx.bot.nickname;
      // ctx.bot.uin;
      // ctx.bot.api('xxx', params);

      // ctx.bot.sendGroupMsg(123456789, 'Hello Group!') // 发送群消息

      // const group = await ctx.bot.pickGroup(123456789) // 使用群号选择一个群实例
      // group?.sign() // 调用群实例方法

      // const friend = await ctx.bot.pickFriend(987654321) // 使用好友号选择一个好友实例
      // friend?.delete() // 调用好友实例方法

      // 处理所有消息：群、好友
      ctx.handle('message', async (e) => {
        // 收到 hello 消息时回复 world
        if (e.raw_message === 'hello') {
          // 第二个参数表示是否回复原消息
          e.reply('world', true)
        }

        // 收到 love 消息时回复"爱你哟"和一个爱心 QQ 表情
        if (e.raw_message === 'love') {
          // 复杂消息消息可以使用数组组合
          e.reply(['爱你哟 ', ctx.segment.face(66)])
        }

        // 收到 壁纸 消息时回复今天的 bing 壁纸
        if (e.raw_message === '壁纸') {
          e.reply(ctx.segment.image('https://60s.viki.moe/v2/bing?encoding=image'))
        }

        // 收到 一言 消息时回复一言
        if (e.raw_message === '一言') {
          const data = await (await fetch('https://v1.hitokoto.cn/')).json()
          e.reply(data.hitokoto, true)
        }
      })

      ctx.handle('message.group', (e) => {
        // 处理群消息
        // 调用消息实例上挂载的快速方法
        // e.reply('这是群消息的回复') // 回复消息
        // e.recall() // 撤回消息
        // e.getQuoteMsg() // 获取引用的消息
        // e.group.getInfo(); // 也可以通过群消息事件获取群实例，并调用群实例方法获取群信息
      })

      ctx.handle('message.private', (e) => {
        // 处理好友消息
      })

      // 处理所有请求：好友、群，添加好友、邀请入群等等
      ctx.handle('request', (e) => {
        e.approve() // 同意请求
        // e.reject()  // 拒绝请求
      })

      // 处理所有通知，好友、群的数量增加与减少、戳一戳、撤回等等
      ctx.handle('notice', (e) => {
        ctx.logger.info('Notice', e)
      })

      // 注册定时任务
      ctx.cron('*/3 * * * * *', async (ctx, task) => {
        ctx.logger.info('Cron', task)
      })

      return () => {
        ctx.logger.info('Demo 插件已卸载')
      }
    },
  })

`)

  const npmrc = dedent(`
  registry=https://registry.npmmirror.com
  fund=false
`)

  const fileTree = {
    'app.ts': "require('mioki').start({ cwd: __dirname })",
    'package.json': pkgJson,
    plugins: { demo: { 'index.ts': pluginCode } },
    ...(useNpmMirror ? { '.npmrc': npmrc } : {}),
  }

  createNewProject(name, fileTree)
})()

async function createNewProject(name: string, fileTree: Record<string, any>) {
  const projectName = name
  const projectPath = withRoot(`./${projectName}`)

  if (fs.existsSync(projectPath)) {
    const overwrite = await confirm(`项目 ${projectName} 已存在，是否覆盖？`)

    if (!overwrite) {
      gracefullyExit()
    }

    if (projectPath === process.cwd()) {
      if (fs.readdirSync(projectPath).length !== 0) {
        const confirmOver = await confirm('项目路径与当前路径相同，将删除当前目录下所有内容再创建，是否继续？')
        if (!confirmOver) {
          gracefullyExit()
        }
      }
    }

    fs.rmSync(projectPath, { recursive: true })
  }

  fs.mkdirSync(projectPath)

  makeFileTree(fileTree, projectPath)

  console.log(`项目 ${projectName} 创建成功！根据下面的引导启动 mioki。`)
  console.log(`\ncd ${projectPath} && npm install && npm start\n`)
}

function gracefullyExit() {
  console.log('Bye!')
  process.exit(0)
}

function withRoot(_path: string) {
  return path.resolve(process.cwd(), _path)
}

type OmitTypeWithRequired<T> = Omit<T, 'type' | 'required'> & { required?: boolean }

async function confirm(message: string, options?: OmitTypeWithRequired<ConfirmPromptOptions>) {
  return consola.prompt(message, { type: 'confirm', cancel: 'reject', ...options })
}

async function input(message: string, options?: OmitTypeWithRequired<TextPromptOptions>) {
  const result = await consola.prompt(message, { type: 'text', cancel: 'reject', ...options })
  if (options?.required && !result) return input(message, options)
  return result
}

function makeFileTree(
  fileTree: Record<string, string | Record<string, string | Record<string, string>>>,
  base: string,
) {
  for (const [name, content] of Object.entries(fileTree)) {
    if (typeof content === 'object' && content !== null) {
      const subPath = `${base}/${name}`
      if (!fs.existsSync(subPath)) {
        fs.mkdirSync(subPath)
      }
      for (const [subName, subContent] of Object.entries(content)) {
        if (typeof subContent === 'object') {
          makeFileTree(content, subPath)
        } else {
          fs.writeFileSync(`${subPath}/${subName}`, subContent)
        }
      }
    } else {
      const filePath = `${base}/${name}`
      const dirname = path.dirname(filePath)
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname)
      }
      fs.writeFileSync(filePath, content)
    }
  }
}
