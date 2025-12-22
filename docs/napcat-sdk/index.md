# NapCat SDK {#napcat-sdk}

<div style="display: flex; gap: 8px; margin-top: 12px; margin-bottom: 16px;">
  <img src="https://img.shields.io/npm/v/napcat-sdk?color=527dec&label=napcat-sdk&style=flat-square" title="npm" alt="npm" class="inline"/>
</div>

NapCat SDK 是 mioki 框架的底层通信库，提供了与 [NapCat](https://napneko.github.io/) 服务端通信的能力。它是 mioki 的核心组件，也可以独立使用。

## 特性 {#features}

- 🔌 **WebSocket 连接**：基于 WebSocket 的稳定连接
- 📦 **完整类型支持**：TypeScript 优先，提供完整的类型定义
- 🎯 **事件驱动**：基于事件的消息处理机制
- 🛠️ **丰富的 API**：封装了 OneBot 11 标准 API 和 NapCat 扩展 API
- 🧩 **消息段构造器**：便捷的消息构造工具

## 安装 {#installation}

```sh
# pnpm
pnpm add napcat-sdk

# npm
npm install napcat-sdk

# yarn
yarn add napcat-sdk

# bun
bun add napcat-sdk
```

## 快速开始 {#quick-start}

### 基础用法

```ts
import { NapCat } from 'napcat-sdk'

// 创建 NapCat 实例
const napcat = new NapCat({
  token: 'your-napcat-token',
  protocol: 'ws',
  host: 'localhost',
  port: 3001,
})

// 监听连接成功事件
napcat.on('napcat.connected', (info) => {
  console.log(`已连接！机器人：${info.nickname}（${info.user_id}）`)
})

// 监听消息事件
napcat.on('message', async (event) => {
  console.log(`收到消息：${event.raw_message}`)

  // 回复消息
  if (event.raw_message === 'ping') {
    await event.reply('pong')
  }
})

// 监听群消息
napcat.on('message.group', async (event) => {
  console.log(`[群${event.group_id}] ${event.sender.nickname}: ${event.raw_message}`)
})

// 监听私聊消息
napcat.on('message.private', async (event) => {
  console.log(`[私聊] ${event.sender.nickname}: ${event.raw_message}`)
})

// 启动连接
await napcat.run()
```

### 发送消息

```ts
import { NapCat, segment } from 'napcat-sdk'

const napcat = new NapCat({ token: 'xxx' })

napcat.on('napcat.connected', async () => {
  // 发送群消息
  await napcat.sendGroupMsg(123456789, 'Hello, World!')

  // 发送私聊消息
  await napcat.sendPrivateMsg(987654321, 'Hello!')

  // 发送复合消息
  await napcat.sendGroupMsg(123456789, [
    segment.at(111222333),
    segment.text(' 你好！'),
    segment.face(66),
  ])

  // 发送图片
  await napcat.sendGroupMsg(123456789, segment.image('https://example.com/image.png'))
})

await napcat.run()
```

### 获取信息

```ts
napcat.on('napcat.connected', async () => {
  // 获取机器人信息
  console.log(`QQ: ${napcat.uin}`)
  console.log(`昵称: ${napcat.nickname}`)

  // 获取好友列表
  const friends = await napcat.getFriendList()
  console.log(`好友数量: ${friends.length}`)

  // 获取群列表
  const groups = await napcat.getGroupList()
  console.log(`群数量: ${groups.length}`)

  // 获取群成员列表
  const members = await napcat.getGroupMemberList(123456789)
  console.log(`群成员数量: ${members.length}`)
})
```

### 处理请求

```ts
// 处理好友请求
napcat.on('request.friend', async (event) => {
  console.log(`收到好友请求：${event.user_id}，验证信息：${event.comment}`)

  // 同意请求
  await event.approve()

  // 或拒绝请求
  // await event.reject('暂不添加好友')
})

// 处理入群请求
napcat.on('request.group.add', async (event) => {
  console.log(`收到入群请求：${event.user_id}，群：${event.group_id}`)

  if (event.comment.includes('暗号')) {
    await event.approve()
  } else {
    await event.reject('请提供正确的暗号')
  }
})
```

## 配置选项 {#options}

创建 `NapCat` 实例时可传入以下配置：

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `token` | `string` | - | NapCat 访问令牌（必填） |
| `protocol` | `'ws' \| 'wss'` | `ws` | WebSocket 协议 |
| `host` | `string` | `localhost` | NapCat 服务器地址 |
| `port` | `number` | `3001` | NapCat 服务器端口 |
| `logger` | `Logger` | 内置 Logger | 自定义日志记录器 |

```ts
const napcat = new NapCat({
  token: 'your-token',
  protocol: 'wss',
  host: '192.168.1.100',
  port: 6700,
})
```

## 完整示例 {#example}

```ts
import { NapCat, segment } from 'napcat-sdk'

const napcat = new NapCat({
  token: 'your-napcat-token',
  host: 'localhost',
  port: 3001,
})

// WebSocket 连接事件
napcat.on('ws.open', () => {
  console.log('WebSocket 连接已建立')
})

napcat.on('ws.close', () => {
  console.log('WebSocket 连接已断开')
})

// NapCat 连接成功
napcat.on('napcat.connected', async ({ user_id, nickname, app_version }) => {
  console.log(`✅ 已连接到 NapCat ${app_version}`)
  console.log(`🤖 机器人：${nickname}（${user_id}）`)
})

// 消息处理
napcat.on('message', async (event) => {
  const { raw_message, sender } = event

  // 关键词回复
  if (raw_message === 'hello') {
    await event.reply([segment.at(sender.user_id), ' Hello!'])
  }

  // 获取引用的消息
  if (event.quote_id) {
    const quoteMsg = await event.getQuoteMsg()
    if (quoteMsg) {
      console.log('引用的消息:', quoteMsg.raw_message)
    }
  }
})

// 群消息表态
napcat.on('message.group', async (event) => {
  if (event.raw_message === '点赞') {
    await event.addReaction('66') // 添加 👍 表态
  }
})

// 通知事件
napcat.on('notice.group.increase', async (event) => {
  await event.group.sendMsg([segment.at(event.user_id), ' 欢迎加入！'])
})

// 启动
napcat.run().catch(console.error)
```

## 下一步 {#next-steps}

- 查看 [API 文档](/napcat-sdk/api) 了解完整 API
- 阅读 [事件文档](/napcat-sdk/event) 了解所有事件类型
- 回到 [mioki 文档](/intro) 学习框架使用
