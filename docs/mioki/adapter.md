# 编写适配器 {#adapter}

mioki 拥有可扩展的内核，通过**适配器（Adapter）**对接不同的机器人平台（如 OneBot v11 / NapCat、Telegram、Discord 等）

本文以官方 `mioki-adapter-onebotv11` 为例，介绍如何编写一个完整的适配器。

## 适配器是什么 {#what-is-adapter}

一个适配器负责：

- 建立与平台的连接（WebSocket / HTTP）
- 接收平台事件并转换为内核统一的 `Event` 分发到事件总线
- 实现 `Bot` 接口，提供发消息、调用平台 API 的能力
- 注册平台支持的能力（Capability）

## 包结构 {#package-structure}

```
mioki-adapter-xxx/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts      # 默认导出适配器定义，声明 AdapterBotMap
    ├── adapter.ts    # defineAdapter 定义适配器
    ├── bot.ts        # Bot 实现
    ├── event.ts      # 平台事件 → 内核 Event
    ├── message.ts    # 消息段转换
    └── config.ts     # 适配器配置
```

### package.json {#package-json}

```jsonc
{
  "name": "mioki-adapter-xxx",
  "type": "module",
  "exports": {
    ".": {
      "require": "./dist/index.cjs",
      "import": "./dist/index.mjs"
    }
  },
  "peerDependencies": {
    "mioki": ">=0.16.0"
  },
  "keywords": ["mioki"]
}
```

关键点：

- 包名必须以 `mioki-adapter-` 开头，`xxx` 部分就是适配器 ID（与 `AdapterBotMap` 的 key 一致）
- `keywords` 中包含 `mioki`，用于适配器商店收录
- `peerDependencies` 声明 `mioki`

## 定义适配器 {#define-adapter}

```ts
import { defineAdapter } from 'mioki'

import type { Adapter, AdapterContext, AdapterFactoryOptions } from 'mioki'

export default defineAdapter<MyAdapterConfig>({
  name: 'xxx',
  version: '1.0.0',
  apiVersion: 1,

  // 校验用户配置
  validateConfig: (config): MyAdapterConfig => config,

  // 创建适配器实例
  create: (options: AdapterFactoryOptions<MyAdapterConfig>): Adapter => ({
    name: 'xxx',
    version: '1.0.0',
    async start(context: AdapterContext) {
      // 建立连接、注册 Bot、注册能力、注册 Gateway
    },
    async stop(reason?: string) {
      // 清理资源
    },
  }),
})
```

### AdapterContext {#adapter-context}

`start` 收到的 `AdapterContext` 是适配器与内核的桥梁：

| 方法                                                | 说明                                      |
|---------------------------------------------------|-----------------------------------------|
| `registerBot(bot)`                                | 注册一个 Bot，返回 `{ unregister }`            |
| `unregisterBot(bot_id)`                           | 注销 Bot                                  |
| `getDriver()`                                     | 获取 Driver（WS / HTTP 客户端）                |
| `registerCapability(capability, target, handler)` | 注册能力，`target` 形如 `{ adapter, bot_id }`  |
| `registerGateway(gateway)`                        | 注册连接网关                                  |
| `registerResource(resource)`                      | 注册可清理的资源                                |
| `dispatch(event)`                                 | 将转换好的 Event 分发到事件总线                     |
| `emitLifecycle(event)`                            | 触发 `bot:connected` / `bot:disconnected` |

## 实现 Bot {#implement-bot}

Bot 是实现内核 `Bot` 接口的对象，至少需要：

```ts
import type { Bot, MessageInput, MessageTarget, SentMessage } from 'mioki'

const bot: Bot = {
  bot_id: '123456789',
  adapter: 'xxx',
  nickname: 'bot',
  online: true,
  connected_at: Date.now(),

  // 发送消息
  async sendMessage(target: MessageTarget, message: MessageInput): Promise<SentMessage> {
    // 根据 target.type 调用平台 API
  },

  // 能力判断与调用
  supports(capability) {
    return SUPPORTED_CAPABILITIES.some((cap) => cap.token === capability.token)
  },
  async invoke(capability, input) {
    // 分发到平台实现
  },

  // 逃生舱：任意平台 API
  as<T extends object = Record<string, unknown>>(): T {
    return this as unknown as T
  },
}
```

## 事件与路由 {#events-and-routes}

适配器收到平台事件后，需要转换为内核统一的 `Event` 并 `dispatch`。路由是插件监听的入口，命名规则：

- 语义路由：`message`、`message.group`、`notice.group.increase`、`request.friend` 等
- 适配器作用域路由：`<adapter>:<语义路由>`，如 `onebotv11:message.group`

事件对象同时携带这两类路由，插件既可跨平台监听（`message`），也可指定平台监听（`onebotv11:message`）。构造路由的参考实现：

```ts
const buildRoutes = (adapter: string, ...parts: (string | undefined | null)[]): string[] => {
  const cleaned = parts.filter((p): p is string => typeof p === 'string' && p.length > 0)
  const routes: string[] = []
  const platformParts = [adapter, ...cleaned]
  for (let length = platformParts.length; length > 0; length--) {
    const [head, ...rest] = platformParts.slice(0, length)
    routes.push(rest.length > 0 ? `${head}:${rest.join('.')}` : head)
  }
  for (let length = cleaned.length; length > 0; length--) {
    routes.push(cleaned.slice(0, length).join('.'))
  }
  return Array.from(new Set(routes))
}
```

事件对象需包含 `kind`、`type`、`routes`、`identity`、`bot`、`self_id`、`raw` 等字段。参考内核 `MessageEvent` / `NoticeEvent` / `RequestEvent` / `MetaEvent` 接口。

## 注册能力 {#capabilities}

能力（Capability）是跨适配器的语义化 API。内核内置了消息、成员、群组等能力 token，适配器在 `start` 时注册实现：

```ts
import { messageSend, memberKick, defineCapability } from 'mioki'

context.registerCapability(
  memberKick,
  { adapter: 'xxx', bot_id: bot.bot_id },
  async (req) => {
    await platform.kickMember(req.group_id, req.user_id)
  },
)
```

插件侧即可通过 `bot.supports(capability)` / `bot.invoke(capability, input)` 调用，无需关心平台差异。

## 暴露平台类型 {#adapter-bot-map}

为了让 `ctx.handle('xxx:message', (e) => e.bot.sendLike(...))` 中 `e.bot` 自动推断为平台 Bot 类型，需要在适配器入口声明模块增补：

```ts
declare module 'mioki' {
  interface AdapterBotMap {
    xxx: import('./bot').MyBot
  }
}
```

## 使用 Driver {#driver}

Driver 提供 WS / HTTP 能力，避免每个适配器重复实现连接层：

```ts
const driver = context.getDriver()

// 建立 WebSocket 连接
const connection = await driver.websocket.connect(url, { headers })
connection.onMessage((data) => handleMessage(data))

// 发起 HTTP 请求
const res = await driver.http.request({ method: 'GET', url: 'https://api.example.com' })
```

## 提供 CLI 配置向导 {#provide-cli}

适配器可以自带一个 CLI，在用户安装或初始化项目时引导填写 `mioki.adapters[<id>]` 所需字段。mioki 主 CLI 会在创建项目阶段依次调用每个已选适配器的 CLI，无需用户手动编辑 `package.json`。

### 1. 约定文件结构 {#cli-structure}

```
mioki-adapter-xxx/
├── package.json
└── src/
    ├── index.ts
    └── cli.ts          # ← 配置向导（导出 default run 函数）
```

### 2. `src/cli.ts` {#cli-source}

默认导出一个 `run(ctx)` 异步函数，接收 `{ cwd }`（用户项目根目录），返回该适配器的配置对象。返回的字段会被主 CLI 直接合并到 `mioki.adapters[<id>]`。

```ts
import consola from 'consola'

const confirm = (message: string, options?: Parameters<typeof consola.prompt>[1]) =>
  consola.prompt(message, { type: 'confirm', cancel: 'reject', ...options }) as Promise<boolean>

const input = async (message: string, options?: Parameters<typeof consola.prompt>[1]): Promise<string> => {
  let result: string
  do {
    result = (await consola.prompt(message, { type: 'text', cancel: 'reject', ...options })) as string
    if (options?.required && !result) continue
    break
  } while (true)
  return result
}

const select = <T>(message: string, options: Array<{ label: string; value: T }>): Promise<T> =>
  consola.prompt(message, { type: 'select', cancel: 'reject', options }) as Promise<T>

export interface CliContext {
  readonly cwd: string
  readonly logger?: typeof consola
}

export const run = async (ctx: CliContext) => {
  ctx.logger?.info(`正在配置 xxx 适配器连接参数`)
  const host = await input('主机地址', { default: 'localhost' })
  const port = Number(await input('端口', { default: '3001' })) || 3001
  const token = await input('访问令牌 (可空)', { placeholder: '可空' })
  const reconnect = await confirm('断线自动重连？', { initial: true })

  return {
    instances: [
      { host, port, ...(token ? { token } : {}), reconnect },
    ],
  }
}

export default run
```

要点：

- 必须提供 `export default run`，主 CLI 会优先使用 default 导出，回退到具名 `run`。
- 返回值即该适配器在 `mioki.adapters[<id>]` 下的最终 JSON，**不要**在这里写 `package.json`，写盘由主 CLI 统一处理。
- 使用 `consola` 提问以保持与主 CLI 风格一致。

### 3. 自执行入口（可选） {#cli-bin}

如果希望用户可以单独运行 `npx mioki-adapter-xxx` 进入向导，再让脚本自执行一遍 prompt 并写盘：

```ts
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import consola from 'consola'

// ... run 函数与上文一致 ...

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
    const config = await run({ cwd })
    const pkgPath = path.join(cwd, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { mioki?: Record<string, unknown> }
    pkg.mioki = pkg.mioki ?? {}
    const adapters = (pkg.mioki.adapters as Record<string, unknown> | undefined) ?? {}
    pkg.mioki.adapters = { ...adapters, xxx: config }
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
    consola.success('已写入 xxx 适配器配置')
  })()
}

export default run
```

### 4. `package.json` 与构建产物 {#cli-package-json}

把 `cli` 加为额外的构建入口，并在 `exports` 中暴露：

```jsonc
{
  "bin": {
    "mioki-adapter-xxx": "./dist/cli.mjs"
  },
  "exports": {
    ".": {
      "require": "./dist/index.cjs",
      "import": "./dist/index.mjs"
    },
    "./cli": {
      "require": "./dist/cli.cjs",
      "import": "./dist/cli.mjs"
    },
    "./package.json": "./package.json"
  }
}
```
