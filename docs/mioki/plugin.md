# mioki 插件进阶 {#plugin-advanced}

本文档深入介绍 mioki 插件开发的高级特性，包括生命周期、事件处理、消息匹配等内容。

## 插件生命周期 {#lifecycle}

### 加载过程

mioki 插件的加载流程如下：

```
读取配置 → 导入插件模块 → 按优先级排序 → 调用 setup() → 注册完成
```

1. **读取配置**：从 `package.json` 的 `mioki.plugins` 读取启用的插件列表
2. **导入模块**：使用 jiti 动态导入 TypeScript/JavaScript 模块
3. **优先级排序**：按 `priority` 属性排序（数值越小越先加载）
4. **调用 setup**：执行插件的 `setup` 函数，传入上下文对象
5. **注册完成**：插件进入运行状态

### 卸载过程

```
调用清理函数 → 移除事件监听 → 停止定时任务 → 从运行时移除
```

清理函数包括：

- `setup` 返回的清理函数
- `ctx.clears` 中注册的清理函数
- `ctx.handle` 注册的事件监听器（自动清理）
- `ctx.cron` 注册的定时任务（自动清理）

### 插件优先级

```ts
export default definePlugin({
  name: 'my-plugin',
  priority: 50, // 数值越小越先加载
  setup(ctx) {
    // ...
  },
})
```

**默认优先级：** 100

**内置插件优先级：** 1

**使用场景：**

- 需要在其他插件之前初始化的基础服务
- 依赖其他插件注册的服务时，应设置较高的 priority 值

## 事件处理 {#event-handling}

### 事件类型

mioki 支持监听 NapCat SDK 的所有事件类型：

```ts
// 消息事件
ctx.handle('message', handler)           // 所有消息
ctx.handle('message.group', handler)     // 群消息
ctx.handle('message.private', handler)   // 私聊消息

// 通知事件
ctx.handle('notice', handler)                    // 所有通知
ctx.handle('notice.group.increase', handler)     // 群成员增加
ctx.handle('notice.group.decrease', handler)     // 群成员减少
ctx.handle('notice.group.recall', handler)       // 群消息撤回
ctx.handle('notice.friend.poke', handler)        // 好友戳一戳

// 请求事件
ctx.handle('request', handler)                   // 所有请求
ctx.handle('request.friend', handler)            // 好友请求
ctx.handle('request.group.add', handler)         // 入群申请

// 系统事件
ctx.handle('napcat.connected', handler)          // 连接成功
ctx.handle('ws.close', handler)                  // 连接断开
```

### 事件对象

不同事件类型的事件对象包含不同的属性和方法：

#### 群消息事件

```ts
ctx.handle('message.group', async (e) => {
  // 基础信息
  e.message_id      // 消息 ID
  e.group_id        // 群号
  e.group_name      // 群名
  e.user_id         // 发送者 QQ
  e.raw_message     // 原始消息文本
  e.message         // 消息段数组
  e.quote_id        // 引用的消息 ID

  // 发送者信息
  e.sender.user_id  // 发送者 QQ
  e.sender.nickname // 发送者昵称
  e.sender.card     // 发送者群名片
  e.sender.role     // 发送者角色: 'owner' | 'admin' | 'member'

  // 群对象
  e.group.sendMsg(msg)           // 发送群消息
  e.group.getInfo()              // 获取群信息
  e.group.getMemberList()        // 获取成员列表
  e.group.ban(user_id, duration) // 禁言

  // 消息操作
  await e.reply('回复内容')       // 回复消息
  await e.reply('回复', true)     // 引用回复
  await e.recall()                // 撤回消息
  await e.addReaction('66')       // 添加表态
  await e.delReaction('66')       // 移除表态
  await e.setEssence()            // 设为精华
  await e.delEssence()            // 取消精华

  // 获取引用消息
  const quoteMsg = await e.getQuoteMsg()
})
```

#### 私聊消息事件

```ts
ctx.handle('message.private', async (e) => {
  e.message_id
  e.user_id
  e.raw_message
  e.message
  e.sender.user_id
  e.sender.nickname

  // 好友对象
  e.friend.sendMsg(msg)
  e.friend.getInfo()

  await e.reply('回复')
})
```

#### 请求事件

```ts
// 好友请求
ctx.handle('request.friend', async (e) => {
  e.user_id         // 请求者 QQ
  e.comment         // 验证信息
  e.flag            // 请求标识

  await e.approve() // 同意
  await e.reject('拒绝理由')
})

// 入群请求
ctx.handle('request.group.add', async (e) => {
  e.user_id
  e.group_id
  e.comment

  await e.approve()
  await e.reject('拒绝理由')
})
```

### 多事件监听

同一个插件可以注册多个事件监听器：

```ts
export default definePlugin({
  name: 'multi-events',
  setup(ctx) {
    // 消息处理
    ctx.handle('message', async (e) => {
      // ...
    })

    // 入群欢迎
    ctx.handle('notice.group.increase', async (e) => {
      // ...
    })

    // 好友请求自动通过
    ctx.handle('request.friend', async (e) => {
      await e.approve()
    })
  },
})
```

### 多实例去重

在连接多个 NapCat 实例的情况下，mioki 已经自动对消息进行了基本的去重处理。  
包括：  
- 消息事件 `message`
- 请求事件 `request`
- 群通知事件 `notice`

你也可以在插件中自行决定是否需要使用自动去重：

```ts
export default definePlugin({
  name: 'like-bot',
  setup(ctx) {
    // 禁用去重：每个 bot 都会执行点赞
    ctx.handle(
      'message.group',
      async (event) => {
        if (event.raw_message === '赞我') {
          // 当前 bot 给发送者点赞
          await ctx.bot.like(event.user_id)
          ctx.logger.info(`Bot ${ctx.self_id} 给 ${event.user_id} 点赞`)
        }
      },
      { deduplicate: false }, //标记事件不需要自动去重
    )
  },
})
```

## 消息匹配 {#message-matching}

### 基础匹配

```ts
ctx.handle('message', (e) => {
  // 精确匹配
  if (e.raw_message === 'hello') {
    e.reply('world')
  }

  // 包含匹配
  if (e.raw_message.includes('天气')) {
    e.reply('今天天气不错')
  }

  // 正则匹配
  const match = e.raw_message.match(/^签到(\d+)?$/)
  if (match) {
    const times = match[1] ? parseInt(match[1]) : 1
    e.reply(`签到 ${times} 次成功`)
  }
})
```

### 使用 match 函数

`ctx.match` 提供了更简洁的匹配语法：

```ts
ctx.handle('message', (e) => {
  ctx.match(e, {
    // 字符串匹配
    hello: 'world',
    ping: 'pong',

    // 动态回复
    时间: () => new Date().toLocaleString(),
    
    // 异步回复
    天气: async () => {
      const data = await fetchWeather()
      return `今日天气：${data.weather}`
    },

    // 返回消息段数组
    测试: () => [ctx.segment.text('测试成功 '), ctx.segment.face(66)],

    // 返回 null/undefined/false 则不回复
    静默: () => null,
  })
})
```

### 指令解析

对于复杂的指令，可以使用 `ctx.createCmd` 或 `mri` 进行解析：

```ts
import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'command',
  setup(ctx) {
    ctx.handle('message', (e) => {
      // 使用 mri 解析命令行参数
      const { cmd, params, options } = ctx.createCmd(e.raw_message, {
        prefix: '/',
      })

      if (cmd === 'ban') {
        const [userId, duration] = params
        const reason = options.reason || '违规'
        // 执行禁言
      }

      if (cmd === 'echo') {
        e.reply(params.join(' '))
      }
    })
  },
})
```

### 权限控制

```ts
ctx.handle('message', async (e) => {
  // 仅主人可用
  if (!ctx.isOwner(e)) return

  // 仅管理员可用
  if (!ctx.isOwnerOrAdmin(e)) return

  // 仅群管理员可用（群主/管理员）
  if (ctx.isGroupMsg(e)) {
    if (!['owner', 'admin'].includes(e.sender.role)) return
  }

  // 执行敏感操作
})
```

## 定时任务 {#cron-tasks}

### Cron 表达式

```ts
// 每分钟
ctx.cron('* * * * *', handler)

// 每小时整点
ctx.cron('0 * * * *', handler)

// 每天早上 8 点
ctx.cron('0 8 * * *', handler)

// 每周一早上 9 点
ctx.cron('0 9 * * 1', handler)

// 每月 1 号 0 点
ctx.cron('0 0 1 * *', handler)

// 每 5 秒（包含秒字段）
ctx.cron('*/5 * * * * *', handler)

// 每天 8 点和 20 点
ctx.cron('0 8,20 * * *', handler)

// 工作日每天 9 点
ctx.cron('0 9 * * 1-5', handler)
```

### 任务上下文

```ts
ctx.cron('0 8 * * *', async (ctx, task) => {
  // ctx 是插件上下文
  // task 是任务上下文，包含当前时间等信息

  await ctx.noticeGroups([123456789], '早上好！')
})
```

### 任务控制

```ts
const task = ctx.cron('* * * * *', handler)

// 暂停任务
task.stop()

// 恢复任务
task.start()
```

## 数据持久化 {#data-persistence}

### 使用 createStore

```ts
interface Store {
  count: number
  users: string[]
}

export default definePlugin({
  name: 'storage-demo',
  async setup(ctx) {
    // 创建持久化存储
    const store = await ctx.createStore<Store>({count: 0, users: [] }, { __dirname })

    ctx.handle('message', async (e) => {
      if (e.raw_message === '计数') {
        store.data.count++
        await store.write()
        await e.reply(`当前计数: ${store.data.count}`)
      }
    })
  },
})
```

### 使用 createDB

```ts
interface SigninData {
  [userId: string]: {
    lastSignin: string
    count: number
  }
}

export default definePlugin({
  name: 'signin',
  async setup(ctx) {
    const filePath = ctx.path.join(__dirname, 'signin.json')
    const db = await ctx.createDB<SigninData>(filePath, { defaultData: {} })

    ctx.handle('message', async (e) => {
      if (e.raw_message !== '签到') return

      const userId = String(e.user_id)
      const today = ctx.localeDate()

      if (db.data[userId]?.lastSignin === today) {
        await e.reply('今天已经签到过了！')
        return
      }

      db.data[userId] = {
        lastSignin: today,
        count: (db.data[userId]?.count || 0) + 1,
      }
      await db.write()

      await e.reply(`签到成功！累计签到 ${db.data[userId].count} 天`)
    })
  },
})
```

## 服务注册 {#service-registration}

插件可以注册服务供其他插件使用：

```ts
// service-provider 插件
export default definePlugin({
  name: 'service-provider',
  priority: 10, // 优先加载
  setup(ctx) {
    const myService = {
      getData: () => ({ message: 'Hello from service!' }),
      doSomething: async () => {
        // ...
      },
    }

    // 注册服务
    ctx.addService('myService', myService)
  },
})

// service-consumer 插件
export default definePlugin({
  name: 'service-consumer',
  priority: 100, // 后加载
  setup(ctx) {
    ctx.handle('message', async (e) => {
      // 使用服务
      const data = ctx.services.myService.getData()
      await e.reply(data.message)
    })
  },
})
```

## 插件示例 {#examples}

### 签到插件

```ts
import { definePlugin } from 'mioki'

interface SigninData {
  [key: string]: {
    date: string
    count: number
    totalCoins: number
  }
}

export default definePlugin({
  name: 'signin',
  version: '1.0.0',
  async setup(ctx) {
    const store = await ctx.createStore<SigninData>({}, { __dirname })

    ctx.handle('message', async (e) => {
      if (e.raw_message !== '签到') return

      const key = `${e.user_id}`
      const today = ctx.localeDate()
      const userData = store.data[key]

      if (userData?.date === today) {
        await e.reply([
          ctx.segment.at(e.user_id),
          ` 今天已经签到过啦！\n`,
          `累计签到：${userData.count} 天\n`,
          `金币余额：${userData.totalCoins}`,
        ], true)
        return
      }

      // 随机金币奖励（稳定随机）
      const coins = ctx.randomInt(10, 50, e.user_id, today)
      const newCount = (userData?.count || 0) + 1
      const newCoins = (userData?.totalCoins || 0) + coins

      store.data[key] = {
        date: today,
        count: newCount,
        totalCoins: newCoins,
      }
      await store.write()

      await e.reply([
        ctx.segment.at(e.user_id),
        ` 签到成功！\n`,
        `获得金币：+${coins}\n`,
        `累计签到：${newCount} 天\n`,
        `金币余额：${newCoins}`,
      ], true)
    })
  },
})
```

### 关键词回复插件

```ts
import { definePlugin } from 'mioki'

interface KeywordData {
  keywords: {
    trigger: string
    response: string
    creator: number
  }[]
}

export default definePlugin({
  name: 'keywords',
  version: '1.0.0',
  async setup(ctx) {
    const store = await ctx.createStore<KeywordData>({ keywords: [] }, { __dirname })

    ctx.handle('message', async (e) => {
      const text = ctx.text(e)

      // 添加关键词（仅主人）
      if (text.startsWith('添加关键词 ') && ctx.isOwner(e)) {
        const [trigger, ...responseParts] = text.slice(6).split(' ')
        const response = responseParts.join(' ')

        if (!trigger || !response) {
          await e.reply('格式：添加关键词 触发词 回复内容', true)
          return
        }

        store.data.keywords.push({
          trigger,
          response,
          creator: e.user_id,
        })
        await store.write()
        await e.reply(`关键词 "${trigger}" 添加成功！`, true)
        return
      }

      // 匹配关键词
      const keyword = store.data.keywords.find((k) => text === k.trigger)
      if (keyword) {
        await e.reply(keyword.response)
      }
    })
  },
})
```

### 群管理插件

```ts
import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'group-admin',
  version: '1.0.0',
  setup(ctx) {
    ctx.handle('message.group', async (e) => {
      // 仅管理员可用
      if (!['owner', 'admin'].includes(e.sender.role)) return

      const text = ctx.text(e)

      // 禁言
      if (text.startsWith('禁言 ')) {
        const atElement = e.message.find((m) => m.type === 'at')
        if (!atElement || atElement.qq === 'all') {
          await e.reply('请 @要禁言的成员', true)
          return
        }

        const duration = parseInt(text.split(' ')[1]) || 10
        const userId = parseInt(atElement.qq)

        await e.group.ban(userId, duration * 60)
        await e.reply(`已禁言 ${duration} 分钟`, true)
      }

      // 解禁
      if (text.startsWith('解禁 ')) {
        const atElement = e.message.find((m) => m.type === 'at')
        if (!atElement || atElement.qq === 'all') {
          await e.reply('请 @要解禁的成员', true)
          return
        }

        const userId = parseInt(atElement.qq)
        await e.group.ban(userId, 0)
        await e.reply('已解除禁言', true)
      }

      // 踢人
      if (text === '踢') {
        const atElement = e.message.find((m) => m.type === 'at')
        if (!atElement || atElement.qq === 'all') {
          await e.reply('请 @要踢出的成员', true)
          return
        }

        const userId = parseInt(atElement.qq)
        await ctx.bot.api('set_group_kick', {
          group_id: e.group_id,
          user_id: userId,
        })
        await e.reply('已踢出', true)
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
    // 工作日早上 9 点打卡提醒
    ctx.cron('0 9 * * 1-5', async () => {
      await ctx.noticeGroups([123456789], '📢 打卡时间到！别忘了打卡哦～')
    })

    // 每周五下午 5 点周报提醒
    ctx.cron('0 17 * * 5', async () => {
      await ctx.noticeOwners('📝 周五了，记得写周报！')
    })

    // 每天晚上 11 点提醒早睡
    ctx.cron('0 23 * * *', async () => {
      await ctx.noticeGroups([123456789], '🌙 夜深了，早点休息吧～')
    })

    // 每月 1 号发送月报
    ctx.cron('0 10 1 * *', async () => {
      const stats = await ctx.services.miokiStatus()
      await ctx.noticeOwners(`📊 本月统计\n收到消息：${stats.recv}\n发送消息：${stats.send}`)
    })
  },
})
```

## 调试技巧 {#debugging}

### 日志输出

```ts
ctx.logger.debug('调试信息')  // 仅 debug 级别可见
ctx.logger.info('普通信息')
ctx.logger.warn('警告信息')
ctx.logger.error('错误信息')
```

### 热重载

开发过程中，可以通过 QQ 消息指令热重载插件：

```
#插件 重载 my-plugin
```

### 错误处理

```ts
ctx.handle('message', async (e) => {
  await ctx.runWithErrorHandler(async () => {
    // 可能出错的代码
    const result = await riskyOperation()
    await e.reply(result)
  }, e, (error) => `出错了：${error}`)
})
```

## 下一步 {#next-steps}

- 查看 [mioki API 文档](/mioki/api) 了解完整 API
- 阅读 [NapCat SDK 事件文档](/napcat-sdk/event) 了解所有事件类型
- 回到 [插件入门](/plugin) 复习基础知识
