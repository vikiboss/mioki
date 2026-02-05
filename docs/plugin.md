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
| `name`         | `string`   | ✅    | 插件唯一标识，应与插件目录名一致       |
| `version`      | `string`   | ❌    | 插件版本号，推荐使用语义化版本         |
| `priority`     | `number`   | ❌    | 加载优先级，数值越小越先加载，默认 100 |
| `description`  | `string`   | ❌    | 插件描述信息                           |
| `dependencies` | `string[]` | ❌    | 插件依赖（仅供参考，框架不处理）       |
| `setup`        | `function` | ❌    | 插件初始化函数，接收上下文对象         |

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
    // 机器人实例（当前处理事件的 bot）
    ctx.bot // NapCat 实例

    // 所有已连接的 bot 列表
    ctx.bots // ExtendedNapCat[]

    // 当前 bot 的 QQ 号
    ctx.self_id // number

    // 机器人信息
    ctx.bot.uin // QQ 号
    ctx.bot.nickname // 昵称

    // 消息构造器
    ctx.segment // 消息段构造器

    // 日志器
    ctx.logger // 插件专属日志器

    // 消息去重器
    ctx.deduplicator // MessageDeduplicator

    // 配置信息
    ctx.botConfig // 框架配置
    ctx.isOwner(event) // 检查是否为主人
    ctx.isAdmin(event) // 检查是否为管理员
  },
})
```

### 多实例支持

mioki 支持连接多个 NapCat 实例。  
当配置了多个 NapCat 实例时，上下文对象会提供额外的能力：

```ts
export default definePlugin({
  name: 'multi-bot',
  setup(ctx) {
    // 获取所有 bot 信息
    ctx.bots.forEach((bot) => {
      ctx.logger.info(`Bot: ${bot.nickname} (${bot.bot_id})`)
      ctx.logger.info(`App: ${bot.app_name} v${bot.app_version}`)
      if (bot.name) {
        ctx.logger.info(`Name: ${bot.name}`)
      }
    })

    // 遍历所有群
    for (const bot of ctx.bots) {
      const groups = await bot.getGroupList()
      ctx.logger.info(`${bot.name || bot.nickname}: ${groups.length} 个群`)
    }
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
      ctx.logger.info(`收到消息：${event.raw_message}`)
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

### 定时任务

使用 `ctx.cron` 注册定时任务（基于 cron 表达式）：

```ts
export default definePlugin({
  name: 'demo',
  setup(ctx) {
    // 每天早上 8 点执行
    ctx.cron('0 8 * * *', async (ctx, task) => {
      await ctx.noticeOwners('早上好！')
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

  // 引用回复（第二个参数为 true）
  await event.reply('这是引用回复', true)

  // 发送多个消息段
  await event.reply(['Hello, ', ctx.segment.at(event.user_id), '!'])
})
```

### 消息段构造

使用 `ctx.segment` 构造各种类型的消息：

```ts
ctx.handle('message', async (event) => {
  // 纯文本
  ctx.segment.text('Hello')

  // @某人
  ctx.segment.at(123456789)
  ctx.segment.at('all') // @全体成员

  // QQ 表情
  ctx.segment.face(66) // 爱心表情

  // 图片
  ctx.segment.image('https://example.com/image.png')
  ctx.segment.image('file:///path/to/image.png')
  ctx.segment.image('base64://...')

  // 语音
  ctx.segment.record('https://example.com/audio.mp3')

  // 视频
  ctx.segment.video('https://example.com/video.mp4')

  // JSON 卡片
  ctx.segment.json('{"app":"com.tencent.xxx",...}')

  // 合并转发
  ctx.segment.forward('转发消息ID')

  // 回复
  ctx.segment.reply('消息ID')

  // 组合发送
  await event.reply([
    ctx.segment.at(event.user_id),
    ' 这是一条测试消息 ',
    ctx.segment.face(66),
    ctx.segment.image('https://example.com/image.png'),
  ])
})
```

## 消息匹配 {#match}

使用 `ctx.match` 快速实现关键词匹配：

```ts
ctx.handle('message', async (event) => {
  ctx.match(event, {
    // 字符串：直接回复
    ping: 'pong',
    hello: 'world',

    // 函数：动态回复
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

`setup` 函数可以返回一个清理函数，在插件卸载时自动执行：

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

你也可以使用 `ctx.clears` 手动注册清理函数：

```ts
export default definePlugin({
  name: 'demo',
  setup(ctx) {
    const timer = setInterval(() => {}, 60000)

    // 注册清理函数
    ctx.clears.add(() => clearInterval(timer))
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
      if (event.raw_message === '复读') {
        const lastMessage = event.message
          .filter((m) => m.type === 'text')
          .map((m) => m.text)
          .join('')

        if (lastMessage) {
          await event.reply(lastMessage)
        }
      }
    })
  },
})
```

### 入群欢迎插件

```ts
import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'welcome',
  version: '1.0.0',
  setup(ctx) {
    ctx.handle('notice.group.increase', async (event) => {
      await event.group.sendMsg([
        ctx.segment.at(event.user_id),
        ' 欢迎加入群聊！请阅读群公告～',
      ])
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
      if (event.comment.includes('暗号')) {
        ctx.logger.info(`自动同意入群申请：${event.user_id}`)
        await event.approve()
      } else {
        await event.reject('请填写正确的暗号')
      }
    })
  },
})
```

### 定时提醒插件

```ts
import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'reminder',
  version: '1.0.0',
  setup(ctx) {
    // 每天早上 9 点提醒打卡
    ctx.cron('0 9 * * *', async () => {
      await ctx.noticeGroups([123456789], '📢 各位早上好，别忘了打卡！')
    })

    // 每周五下午 5 点提醒周报
    ctx.cron('0 17 * * 5', async () => {
      await ctx.noticeOwners('📝 周五了，记得写周报！')
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
- 探索 [NapCat SDK 文档](/napcat-sdk/) 了解底层能力
