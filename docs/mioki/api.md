# mioki API {#api}

本文档详细介绍 mioki 框架提供的所有 API，包括命令行工具、上下文对象、工具函数和内置指令。

## CLI 命令行工具 {#cli}

mioki 提供了 CLI 工具用于快速创建项目。你可以通过命令行参数预先指定配置，跳过交互式提问。

### 基本用法 {#cli-usage}

```sh
npx mioki@latest [选项]
```

### 参数列表 {#cli-options}

| 选项                | 说明                              | 默认值      |
| ------------------- | --------------------------------- | ----------- |
| `-h, --help`        | 显示帮助信息                      | -           |
| `-v, --version`     | 显示版本号                        | -           |
| `--name <name>`     | 指定项目/文件夹名称               | `bot`       |
| `--host <host>`     | 指定 NapCat 主机                  | `localhost` |
| `--port <port>`     | 指定 NapCat 端口                  | `3001`      |
| `--token <token>`   | 指定 NapCat 连接令牌              | -           |
| `--prefix <prefix>` | 指定命令前缀                      | `#`         |
| `--owners <qq>`     | 指定主人 QQ，英文逗号分隔         | -           |
| `--admins <qq>`     | 指定管理员 QQ，英文逗号分隔       | -           |
| `--use-npm-mirror`  | 使用 npm 镜像源加速依赖安装       | `false`     |

### 使用示例 {#cli-examples}

**一键创建**（跳过交互式提问）：

```sh
npx mioki@latest --name my-bot --token abc123 --owners 123456789
```

**完整参数**：

```sh
npx mioki@latest \
  --name my-bot \
  --host localhost \
  --port 3001 \
  --token your-napcat-token \
  --prefix "#" \
  --owners 123456789,987654321 \
  --admins 111111111,222222222 \
  --use-npm-mirror
```

::: tip
使用 `npx mioki --help` 可随时查看帮助信息。
:::

## 上下文对象 {#context}

插件的 `setup` 函数接收一个上下文对象 `ctx`，包含以下属性和方法。

### ctx.bot

当前第一个 bot 实例，提供统一的适配器接口。

```ts
ctx.bot?.bot_id    // 机器人 QQ 号
ctx.bot?.nickname  // 机器人昵称
ctx.bot?.online    // 是否在线
ctx.bot?.adapter   // 所属适配器名，如 'onebotv11'

// 发送消息（跨平台 target 语法）
await ctx.bot?.sendMessage({ type: 'group', group_id: '123' }, message)
await ctx.bot?.sendMessage({ type: 'private', user_id: '123' }, message)

// 判断 / 调用能力
ctx.bot?.supports(memberKick)
await ctx.bot?.invoke(memberKick, { group_id, user_id })
```

### ctx.bots

所有已连接的 bot 实例

```ts
ctx.bots[0].bot_id     // 某个实例的 QQ 号
ctx.bots[0].adapter    // 某个实例的适配器名
ctx.bots[0].online     // 是否在线
ctx.bots[0].sendMessage({ type: 'group', group_id: '123' }, message) // 使用某个实例发送群消息
```

### ctx.segment

消息段构造器，用于构造各种类型的消息。

```ts
ctx.segment.text('文本')
ctx.segment.at('123456789')
ctx.segment.at('all')
ctx.segment.image('https://...')
ctx.segment.image(buffer)                    // Buffer 自动转 base64
ctx.segment.image('/path/a.png', { local: true }) // 本地图片
ctx.segment.reply('message_id')
ctx.segment.raw('face', { id: 66 })          // 自定义原始消息段
```

::: tip
OneBot 适配器还扩展了 `face`、`record`、`video`、`json`、`node`、`forward`、`file` 等消息段。
:::

### ctx.logger

插件专属日志器，会自动添加插件标识。

```ts
ctx.logger.debug('调试信息')
ctx.logger.info('普通信息')
ctx.logger.warn('警告信息')
ctx.logger.error('错误信息')
```

### ctx.config

框架配置对象（来自项目 `package.json` 的 `mioki` 字段）。

```ts
ctx.config.prefix       // 指令前缀
ctx.config.owners       // 主人列表
ctx.config.admins       // 管理员列表
ctx.config.plugins      // 启用的插件列表
ctx.config.log_level    // 日志级别
ctx.config.plugins_dir  // 插件目录
ctx.config.status_permission // 状态指令权限：'all' | 'admin-only'
ctx.config.adapters     // 适配器配置
```

### ctx.updateConfig()

修改并持久化配置。

```ts
await ctx.updateConfig((c) => {
  c.prefix = '!'
})
```

### ctx.handle()

注册事件处理器。路由支持语义路由和带适配器前缀的路由。

```ts
ctx.handle<R extends string | readonly string[]>(
  route: R,
  handler: (event: RouteEvent<R>) => any
): () => void
```

**参数：**

| 参数        | 类型         | 默认值 | 说明     |
|-----------|------------|-----|--------|
| `route`   | `string`   | -   | 事件路由   |
| `handler` | `function` | -   | 事件处理函数 |

**返回值：** 取消订阅函数

**示例：**

```ts
// 监听所有消息
ctx.handle('message', async (e) => {
  console.log(e.raw_message)
})

// 监听群消息
ctx.handle('message.group', async (e) => {
  console.log(`群 ${e.group_id}: ${e.raw_message}`)
})

// 绑定 OneBot 适配器（e.bot 自动推断为 OneBot 类型）
ctx.handle('onebotv11:message.group', async (e) => {
  // ...
})

// 监听好友请求
ctx.handle('request.friend', async (e) => {
  await e.approve()
})
```

关于路由的完整列表，见 [插件进阶 - 事件处理](/mioki/plugin#events)。

### ctx.cron()

注册定时任务（基于 cron 表达式）。

```ts
ctx.cron(
  cronExpression: string,
  handler: (ctx: MiokiContext, task: TaskContext) => any
): ScheduledTask
```

**参数：**

| 参数             | 类型       | 说明             |
| ---------------- | ---------- | ---------------- |
| `cronExpression` | `string`   | cron 表达式      |
| `handler`        | `function` | 定时任务处理函数 |

**Cron 表达式格式：**

```
┌────────────── 秒 (0-59) [可选]
│ ┌──────────── 分 (0-59)
│ │ ┌────────── 时 (0-23)
│ │ │ ┌──────── 日 (1-31)
│ │ │ │ ┌────── 月 (1-12)
│ │ │ │ │ ┌──── 周 (0-7, 0 和 7 都是周日)
│ │ │ │ │ │
* * * * * *
```

**示例：**

```ts
// 每天早上 8 点
ctx.cron('0 8 * * *', async (ctx) => {
  await ctx.noticeOwners('早安！')
})

// 每小时整点
ctx.cron('0 * * * *', async () => {
  ctx.logger.info('整点报时')
})

// 每 30 秒（包含秒字段）
ctx.cron('*/30 * * * * *', async () => {
  ctx.logger.debug('心跳')
})
```

### ctx.deduplicator

::: warning
`ctx.deduplicator` 已移除。框架会自动对事件去重，无需手动处理。
:::

### 清理函数

插件通过 `setup` 返回清理函数，在插件卸载时自动执行（`ctx.handle`、`ctx.cron` 注册的内容也会自动清理）。

```ts
export default definePlugin({
  name: 'demo',
  setup(ctx) {
    const timer = setInterval(() => {}, 1000)
    return () => {
      clearInterval(timer)
    }
  },
})
```

## 权限检查 {#permissions}

### ctx.isOwner()

检查是否为机器人主人。

```ts
ctx.isOwner(event): boolean
ctx.isOwner(user_id: number): boolean
ctx.isOwner({ user_id }): boolean
ctx.isOwner({ sender: { user_id } }): boolean
```

**示例：**

```ts
ctx.handle('message', (e) => {
  if (ctx.isOwner(e)) {
    // 主人专属功能
  }
})
```

### ctx.isAdmin()

检查是否为机器人管理员（不包含主人）。

```ts
ctx.isAdmin(event): boolean
ctx.isAdmin(user_id: number): boolean
```

### ctx.isOwnerOrAdmin()

检查是否为主人或管理员。

```ts
ctx.isOwnerOrAdmin(event): boolean
ctx.isOwnerOrAdmin(user_id: number): boolean
```

## 消息处理 {#message-handling}

### ctx.match()

关键词匹配并自动回复，支持精确匹配、正则表达式和通配符。

```ts
ctx.match(
  event: MessageEvent,
  pattern: Record<string, MatchHandler | MatchValue>,
  quote?: boolean
): Promise<{ message_id: string } | null>
```

**参数：**

| 参数      | 类型           | 默认值 | 说明         |
| --------- | -------------- | ------ | ------------ |
| `event`   | `MessageEvent` | -      | 消息事件     |
| `pattern` | `object`       | -      | 匹配模式对象 |
| `quote`   | `boolean`      | `true` | 是否引用回复 |

**MatchValue 类型：**

```ts
type MatchValue =
  | string
  | number
  | boolean
  | Message
  | MessageSegment
  | readonly (string | MessageSegment)[]

type MatchHandler<T> = (matches: RegExpMatchArray, event: T) => MatchValue | Promise<MatchValue>
```

#### 匹配模式 {#match-patterns}

| 模式       | 语法             | 说明                         |
| ---------- | ---------------- | ---------------------------- |
| 精确匹配   | `"关键词"`       | 消息内容完全等于关键词时触发 |
| 正则匹配   | `"/正则表达式/"` | 以 `/` 包裹的正则表达式      |
| 通配符匹配 | `"前缀*后缀"`    | 使用 `*` 匹配任意字符        |

#### 基础示例 {#match-basic}

```ts
ctx.handle('message', (e) => {
  ctx.match(e, {
    // ===== 精确匹配 =====
    ping: 'pong',
    你好: '你好呀~',

    // ===== 函数回复 =====
    时间: () => new Date().toLocaleString(),

    // ===== 异步函数 =====
    天气: async () => {
      const weather = await fetchWeather()
      return `今日天气：${weather}`
    },

    // ===== 返回 null/undefined/false 则不回复 =====
    test: () => null,
  })
})
```

#### 正则表达式匹配 {#match-regex}

使用 `/正则表达式/` 格式的字符串进行正则匹配，回调函数可以获取匹配组：

```ts
ctx.handle('message', (e) => {
  ctx.match(e, {
    // 匹配 "计算 1+2" 格式
    '/计算\\s*(\\d+)\\s*\\+\\s*(\\d+)/': (matches) => {
      const [, a, b] = matches
      return `${a} + ${b} = ${Number(a) + Number(b)}`
    },

    // 匹配任意数字
    '/^\\d+$/': (matches) => `你输入了数字: ${matches[0]}`,

    // 匹配 "翻译 xxx" 并获取内容
    '/^翻译\\s+(.+)$/': async (matches, event) => {
      const text = matches[1]
      const result = await translateText(text)
      return `翻译结果: ${result}`
    },

    // 匹配 "搜索 xxx 第n页"
    '/搜索\\s+(.+?)(?:\\s+第(\\d+)页)?$/': async (matches) => {
      const [, keyword, page = '1'] = matches
      const results = await search(keyword, Number(page))
      return `搜索 "${keyword}" 第${page}页:\n${results}`
    },
  })
})
```

#### 通配符匹配 {#match-wildcard}

使用 `*` 作为通配符匹配任意字符：

```ts
ctx.handle('message', (e) => {
  ctx.match(e, {
    // 匹配以 "早安" 开头的消息
    '早安*': '早安！今天也要元气满满哦~',

    // 匹配以 "晚安" 结尾的消息
    '*晚安': '晚安，好梦~',

    // 匹配包含 "好看" 的消息
    '*好看*': '确实很好看！',

    // 匹配 "查询xxx余额" 格式
    '查询*余额': async (matches, event) => {
      const balance = await getBalance(event.user_id)
      return `你的余额: ${balance}`
    },
  })
})
```

#### 高级用法 {#match-advanced}

```ts
ctx.handle('message', (e) => {
  ctx.match(e, {
    // 使用 event 对象获取更多信息
    '/^签到$/': async (matches, event) => {
      const userId = event.user_id
      const result = await doSignIn(userId)
      return [ctx.segment.at(userId), ctx.segment.text(`\n签到成功！获得 ${result.points} 积分`)]
    },

    // 返回图片消息
    状态卡片: async () => {
      const imageUrl = await renderStatusCard()
      return ctx.segment.image(imageUrl)
    },

    // 返回组合消息
    '/^抽卡$/': async (matches, event) => {
      const card = await drawCard(event.user_id)
      return [ctx.segment.image(card.image), ctx.segment.text(`\n恭喜获得: ${card.name} ⭐${card.rarity}`)]
    },

    // 根据条件决定是否回复
    管理员测试: (matches, event) => {
      if (!ctx.isOwnerOrAdmin(event)) {
        return null // 非管理员不回复
      }
      return '你是管理员！'
    },
  })
})
```

::: tip 💡 匹配优先级
匹配按照对象属性的定义顺序进行，第一个匹配成功的规则会触发回复并结束匹配。建议将更具体的规则放在前面。
:::

::: warning ⚠️ 注意事项

- 正则表达式中的 `\` 需要双重转义，例如 `\\d` 匹配数字
- 通配符 `*` 会被转换为 `.*`，匹配任意字符（包括空字符串）
- 回调函数的 `matches` 参数在精确匹配时为 `null`
  :::

### ctx.text()

从消息中提取纯文本内容。

```ts
ctx.text(event: MessageEvent, options?: { trim?: boolean | 'whole' | 'each' }): string
ctx.text(message: Message, options?: { trim?: boolean | 'whole' | 'each' }): string
```

**示例：**

```ts
ctx.handle('message', (e) => {
  const text = ctx.text(e)
  console.log(`纯文本: ${text}`)
})
```

## 消息发送 {#message-sending}

### ctx.noticeGroups()

向多个群发送消息。

```ts
ctx.noticeGroups(
  groupIds: string[],
  message: MessageInput,
  options?: { delay?: number }
): Promise<void>
```

**参数：**

| 参数         | 类型                   | 默认值 | 说明              |
|------------|----------------------|-----|-----------------|
| `groupIds` | `string[]`           | -   | 群号列表            |
| `message`  | `MessageInput`       | -   | 消息内容            |
| `options`  | `{ delay?: number }` | -   | `delay`: 每条间隔毫秒 |

### ctx.noticeFriends()

向多个好友发送消息。

```ts
ctx.noticeFriends(
  userIds: string[],
  message: MessageInput,
  options?: { delay?: number }
): Promise<void>
```

### ctx.noticeAdmins()

向所有管理员发送消息。

```ts
ctx.noticeAdmins(message: MessageInput, options?: { delay?: number }): Promise<void>
```

### ctx.noticeOwners()

向所有主人发送消息。

```ts
ctx.noticeOwners(message: MessageInput, options?: { delay?: number }): Promise<void>
```

## 工具函数 {#utils}

### ctx.wait()

异步延时函数。

```ts
ctx.wait(ms: number): Promise<void>

await ctx.wait(1000) // 等待 1 秒
```

### ctx.unique()

数组去重。

```ts
ctx.unique<T>(array: T[]): T[]

ctx.unique([1, 2, 2, 3]) // [1, 2, 3]
```

### ctx.toArray()

确保值为数组。

```ts
ctx.toArray<T>(value: T | T[]): T[]

ctx.toArray(1)     // [1]
ctx.toArray([1,2]) // [1, 2]
```

### ctx.md5()

MD5 哈希。

```ts
ctx.md5(text: string, encoding?: 'hex' | 'base64' | 'buffer'): string | Buffer

ctx.md5('hello')           // '5d41402abc4b2a76b9719d911017c592'
ctx.md5('hello', 'base64') // 'XUFAKrxLKna5cZ2REBfFkg=='
```

### ctx.randomInt()

生成随机整数。

```ts
ctx.randomInt(min: number, max: number, ...hashArgs: any[]): number

// 随机数
ctx.randomInt(1, 100)

// 稳定随机（相同参数返回相同结果）
ctx.randomInt(1, 100, 'seed', userId, localeDate())
```

### ctx.randomItem()

从数组中随机选择一项。

```ts
ctx.randomItem<T>(array: T[], ...hashArgs: any[]): T

ctx.randomItem(['a', 'b', 'c'])
ctx.randomItem(['a', 'b', 'c'], 'seed') // 稳定随机
```

### ctx.randomItems()

从数组中随机选择多项（不重复）。

```ts
ctx.randomItems<T>(array: T[], count: number, ...hashArgs: any[]): T[]

ctx.randomItems([1, 2, 3, 4, 5], 3) // 随机选 3 个
```

### ctx.localeDate()

获取本地化日期字符串。

```ts
ctx.localeDate(ts?: number | Date, options?: FormatOptions): string

ctx.localeDate()                    // '2024/12/19'
ctx.localeDate(Date.now())          // '2024/12/19'
ctx.localeDate(Date.now(), { timeZone: 'UTC' })
```

### ctx.localeTime()

获取本地化时间字符串。

```ts
ctx.localeTime(ts?: number | Date, options?: FormatOptions): string

ctx.localeTime()                    // '2024/12/19 14:30:00'
ctx.localeTime(Date.now(), { seconds: false }) // '2024/12/19 14:30'
```

### ctx.formatDuration()

格式化时间间隔为可读字符串。

```ts
ctx.formatDuration(ms: number): string

ctx.formatDuration(1000)        // '1秒'
ctx.formatDuration(60000)       // '1分钟0秒'
ctx.formatDuration(3600000)     // '1小时0分钟'
ctx.formatDuration(86400000)    // '1天0小时'
```

### ctx.isGroupMsg()

检查是否为群消息。

```ts
ctx.isGroupMsg(event: MessageEvent): event is GroupMessageEvent
```

### ctx.isPrivateMsg()

检查是否为私聊消息。

```ts
ctx.isPrivateMsg(event: MessageEvent): event is PrivateMessageEvent
```

## 数据持久化 {#storage}

### ctx.createDB()

创建 LowDB 数据库实例。

```ts
ctx.createDB<T>(filename: string, options?: {
  defaultData?: T
  compress?: boolean
}): Promise<Low<T>>
```

**示例：**

```ts
interface MyData {
  count: number
  users: string[]
}

const db = await ctx.createDB<MyData>('data.json', {
  defaultData: { count: 0, users: [] },
})

// 读取数据
console.log(db.data.count)

// 修改数据
db.data.count++
await db.write()
```

### ctx.createStore()

创建持久化存储（基于 createDB 封装）。

```ts
ctx.createStore<T>(defaultData: T, options?: {
  __dirname?: string
  importMeta?: ImportMeta
  compress?: boolean
  filename?: string
}): Promise<Low<T>>
```

**示例：**

```ts
const store = await ctx.createStore({ count: 0 }, { __dirname })

store.data.count++
await store.write()
```

## 内置指令 {#commands}

mioki 核心插件提供了以下 QQ 消息指令（仅主人可用）：

### 帮助指令

```
#帮助
```

显示所有可用指令。

### 状态指令

```
#状态
```

显示框架运行状态，包括：

- 运行时间
- 内存占用
- 消息统计
- 系统信息

::: tip 💡 提示
状态指令默认任何人都可以使用，如果需要仅主人和管理员可用，配置 `mioki.status_permission` 为 `admin-only` 并重启即可。
:::

### 插件管理

```
#插件 列表              # 查看所有插件
#插件 启用 <插件名>     # 启用插件
#插件 禁用 <插件名>     # 禁用插件
#插件 重载 <插件名>     # 重载插件
```

### 设置管理

```
#设置 详情              # 查看当前配置
#设置 加主人 <QQ/AT>    # 添加主人
#设置 删主人 <QQ/AT>    # 删除主人
#设置 加管理 <QQ/AT>    # 添加管理员
#设置 删管理 <QQ/AT>    # 删除管理员
```

### 退出指令

```
#退出
```

退出机器人进程。如需自动重启，建议使用 pm2 部署。

## 服务系统 {#services}

### ctx.addService()

添加自定义服务到全局服务容器。

```ts
ctx.addService(name: string, service: any, cover?: boolean): () => void
```

**参数：**

| 参数      | 类型      | 默认值  | 说明               |
| --------- | --------- | ------- | ------------------ |
| `name`    | `string`  | -       | 服务名称           |
| `service` | `any`     | -       | 服务实例或工厂函数 |
| `cover`   | `boolean` | `true`  | 是否覆盖已有服务   |

**返回值：** 移除服务的函数

**示例：**

```ts
// 添加服务
ctx.addService('myService', {
  doSomething: () => console.log('hello'),
})

// 其他插件中使用
ctx.services.myService.doSomething()
```

### ctx.services

全局服务容器，可访问其他插件注册的服务。

```ts
ctx.services.myService
```

## 状态信息 {#status}

### buildMiokiStatus()

构建框架与系统的实时状态对象。

```ts
import { buildMiokiStatus } from 'mioki'

const status = await buildMiokiStatus({
  bots: ctx.bots,
  adapters: ctx.bots.map((b) => ({ name: b.adapter })),
  enabledPlugins: ctx.plugins.list().length,
  totalPlugins: ctx.plugins.list().length + ctx.plugins.localPlugins().length,
})
```

**返回值：** `MiokiStatus` 对象，包含以下信息：

| 属性         | 说明                  |
|------------|---------------------|
| `bots`     | bot 列表（QQ号、昵称、在线状态） |
| `adapters` | 适配器列表               |
| `plugins`  | 插件状态（启用数、总数）        |
| `stats`    | 运行统计（运行时间）          |
| `versions` | 版本信息（Node、mioki）    |
| `system`   | 系统信息（名称、版本、架构）      |
| `memory`   | 内存使用情况              |
| `disk`     | 磁盘使用情况              |
| `cpu`      | CPU 信息及使用率          |

### formatMiokiStatus()

将状态对象格式化为可读的文本字符串。

```ts
import { formatMiokiStatus } from 'mioki'

const text = await formatMiokiStatus(status)
```

### setStatusFormatter() {#custom-format-status}

自定义 `#状态` 命令的输出文本格式。

```ts
import { setStatusFormatter } from 'mioki'

setStatusFormatter((status) => {
  return `🤖 插件: ${status.plugins.enabled}/${status.plugins.total}
⏳ 运行时长: ${prettyMs(status.stats.uptime)}
💾 内存: ${status.memory.percent}%`
})
```

### registerStatusProvider()

为适配器注册状态提供者（适配器内部使用），将平台数据合并进 `#状态` 输出。

```ts
import { registerStatusProvider } from 'mioki'

registerStatusProvider('onebotv11', async ({ bot }) => {
  return { version: '1.0.0', data: { friends: 100, groups: 50 } }
})
```

## 下一步 {#next-steps}

- 阅读 [插件进阶](/mioki/plugin) 了解更多高级特性
- 查看 [NapCat SDK 文档](/napcat-sdk/) 了解底层能力
- 回到 [快速开始](/start) 创建你的第一个机器人
