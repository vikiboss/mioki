# 插件开发入门 {#plugin}

本章节将带你快速上手 mioki 插件开发，学习如何编写、加载和管理插件。

## 插件基础 {#basics}

mioki 的插件是一个符合特定结构的 TypeScript/JavaScript 模块，通过 `definePlugin` 函数定义。

### 最简插件

```ts
// plugins/hello/index.ts
import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'hello',
  version: '1.0.0',
  setup(ctx) {
    ctx.logger.info('Hello 插件已加载！')
  },
})
```

### 插件结构

| 属性           | 类型       | 必填 | 说明                                   |
| -------------- | ---------- | ---- | -------------------------------------- |
| `name`         | `string`   | ✅   | 插件唯一标识，应与插件目录名一致       |
| `version`      | `string`   | ❌   | 插件版本号，推荐使用语义化版本         |
| `priority`     | `number`   | ❌   | 加载优先级，数值越小越先加载，默认 100 |
| `description`  | `string`   | ❌   | 插件描述信息                           |
| `dependencies` | `string[]` | ❌   | 插件依赖（仅供参考，框架不处理）       |
| `setup`        | `function` | ❌   | 插件初始化函数，接收上下文对象         |

### 创建插件

1. 在 `plugins` 目录下创建插件文件夹，文件夹名即为插件 ID
2. 在插件文件夹中创建 `index.ts`（或 `index.js`）
3. 使用 `definePlugin` 定义插件并默认导出

```
plugins/
└── my-plugin/
    └── index.ts
```

## 上下文对象 {#context}

`setup` 函数接收一个上下文对象 `ctx`，包含了插件运行时所需的各种工具和方法。

### 核心属性

```ts
export default definePlugin({
  name: 'demo',
  setup(ctx) {
    // 机器人实例（第一个已连接的 bot，可能为 undefined）
    ctx.bot

    // 所有已连接的 bot 列表
    ctx.bots

    // 第一个 bot 的 QQ 号
    ctx.self_id

    // 按 bot_id / (adapter, bot_id) 选取 bot
    ctx.pickBot(bot_id)
    ctx.pickAdapterBot('onebotv11', bot_id)

    // 消息段构造器（通用段）
    ctx.segment

    // 日志器
    ctx.logger

    // 配置信息（只读）
    ctx.config
    ctx.isOwner(event) // 检查是否为主人
    ctx.isAdmin(event) // 检查是否为管理员
  },
})
```

### 事件处理

使用 `ctx.handle` 注册事件监听器：

```ts
export default definePlugin({
  name: 'demo',
  setup(ctx) {
    // 监听所有消息
    ctx.handle('message', async (event) => {
      ctx.logger.info(`收到消息：${event.message.text()}`)
    })

    // 仅监听群消息
    ctx.handle('message.group', async (event) => {
      ctx.logger.info(`收到群 ${event.group_id} 的消息`)
    })

    // 仅监听私聊消息
    ctx.handle('message.private', async (event) => {
      ctx.logger.info(`收到来自 ${event.user_id} 的私聊消息`)
    })

    // 监听通知事件
    ctx.handle('notice', async (event) => {
      ctx.logger.info(`收到通知：${event.notice_type}`)
    })

    // 监听请求事件
    ctx.handle('request.friend', async (event) => {
      ctx.logger.info(`收到好友请求：${event.user_id}`)
      await event.approve() // 自动同意
    })
  },
})
```

::: tip 💡 适配器绑定路由
只想监听某个平台？在路由前加 `<适配器名>:` 前缀，`event.bot` 还会自动推断为对应平台类型：

```ts
import 'mioki-adapter-onebotv11' // 引入类型增补

ctx.handle('onebotv11:message.group', async (event) => {
  await event.bot.sendLike(event.user_id!, 10) // event.bot 是 OneBot
})
```
:::

### 定时任务

使用 `ctx.cron` 注册定时任务（基于 cron 表达式）：

```ts
export default definePlugin({
  name: 'demo',
  setup(ctx) {
    // 每天早上 8 点执行
    ctx.cron('0 8 * * *', async (ctx) => {
      ctx.logger.info('早上好！')
    })

    // 每 30 分钟执行一次
    ctx.cron('*/30 * * * *', async () => {
      ctx.logger.info('定时任务执行中...')
    })

    // 每 5 秒执行一次（包含秒字段）
    ctx.cron('*/5 * * * * *', async () => {
      ctx.logger.debug('心跳检测...')
    })
  },
})
```

## 消息回复 {#reply}

### 基础回复

```ts
ctx.handle('message', async (event) => {
  // 简单回复
  await event.reply('Hello!')

  // 引用回复
  await event.reply('这是引用回复', { quote: true })
  await event.reply('这也是引用回复', true) // 兼容写法

  // 发送多个消息段
  await event.reply(['Hello, ', ctx.segment.at(event.user_id!), '!'])
})
```

### 消息段构造

核心 `segment` 提供跨平台通用段：

```ts
ctx.segment.text('Hello')                    // 文本
ctx.segment.at(userId)                       // @某人
ctx.segment.image('https://example.com/a.png') // 图片（支持 URL / Buffer / 本地文件）
ctx.segment.image(buffer)                    // Buffer 自动转 base64
ctx.segment.image('/path/to/a.png', { local: true }) // 本地文件
ctx.segment.reply(messageId)                 // 回复
ctx.segment.raw('face', { id: '66' })        // 兜底任意段
```

QQ 专属段（`face`、`record`、`video`、`json`、`forward` 等）由适配器包提供：

```ts
import { segment } from 'mioki-adapter-onebotv11'

segment.face(66) // 爱心表情
```

## 消息匹配 {#match}

使用 `ctx.match` 快速实现关键词匹配：

```ts
ctx.handle('message', async (event) => {
  ctx.match(event, {
    // 字符串：直接回复
    ping: 'pong',
    hello: 'world',

    // 函数：动态回复（matches / event 自动推断类型）
    时间: () => new Date().toLocaleString('zh-CN'),

    // 异步函数
    天气: async () => {
      const weather = await fetchWeather()
      return `今日天气：${weather}`
    },

    // 返回 null/undefined/false 则不回复
    测试: () => null,
  })
})
```

## 插件清理 {#cleanup}

`setup` 函数可以返回一个清理函数，在插件卸载时自动执行。`ctx.handle` 和 `ctx.cron` 注册的回调会自动清理，无需手动处理。

```ts
export default definePlugin({
  name: 'demo',
  setup(ctx) {
    const timer = setInterval(() => {
      ctx.logger.info('定时任务...')
    }, 60000)

    // 返回清理函数
    return () => {
      clearInterval(timer)
      ctx.logger.info('插件已卸载，定时器已清理')
    }
  },
})
```

## 插件示例 {#examples}

### 复读机插件

```ts
import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'repeater',
  version: '1.0.0',
  setup(ctx) {
    ctx.handle('message.group', async (event) => {
      const text = event.message.text()
      if (text === '复读') {
        await event.reply(event.message.text())
      }
    })
  },
})
```

### 入群欢迎插件

```ts
import { definePlugin, segment } from 'mioki'

export default definePlugin({
  name: 'welcome',
  version: '1.0.0',
  setup(ctx) {
    ctx.handle('notice.group.increase', async (event) => {
      const { bot, group_id, user_id } = event
      if (!group_id || !user_id) return
      await bot.sendMessage(
        { type: 'group', group_id },
        [segment.at(user_id), ' 欢迎加入群聊！请阅读群公告～'],
      )
    })
  },
})
```

### 自动审批插件

```ts
import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'auto-approve',
  version: '1.0.0',
  setup(ctx) {
    // 自动同意好友请求
    ctx.handle('request.friend', async (event) => {
      ctx.logger.info(`自动同意好友请求：${event.user_id}`)
      await event.approve()
    })

    // 自动同意入群申请（包含特定答案）
    ctx.handle('request.group.add', async (event) => {
      if (event.comment?.includes('暗号')) {
        ctx.logger.info(`自动同意入群申请：${event.user_id}`)
        await event.approve()
      } else {
        await event.reject('请填写正确的暗号')
      }
    })
  },
})
```

## 插件管理 {#management}

通过 QQ 消息指令管理插件（仅主人可用）：

```
#插件 列表          # 查看所有插件
#插件 启用 hello    # 启用 hello 插件
#插件 禁用 hello    # 禁用 hello 插件
#插件 重载 hello    # 重载 hello 插件
```

插件启用后会自动记录到 `package.json` 的 `mioki.plugins` 配置中，下次启动时自动加载。

## 下一步 {#next-steps}

- 查看 [mioki 插件进阶](/mioki/plugin) 学习更多高级特性
- 阅读 [mioki API 文档](/mioki/api) 了解完整 API
- 到 [插件商店](/mioki/plugin-store) 看看别人写的插件
