<img src="/logo.png" title="mioki" alt="mioki" style="max-width: 160px; border-radius: 4px; border: none;" />

# mioki 简介 {#mioki}

<div style="display: flex; gap: 8px; margin-top: 12px; margin-bottom: 16px;">
  <img src="https://img.shields.io/npm/v/mioki?color=527dec&label=mioki&style=flat-square" title="npm" alt="npm" class="inline"/>
  <img src="https://shields.io/npm/dm/mioki?label=downloads&style=flat-square" title="npm-download" alt="npm-download" class="inline"/>
</div>

`mioki` 是一个基于跨平台的插件式机器人框架，[KiviBot](https://b.viki.moe) 的精神继任者。

mioki 继承了 KiviBot 的轻量、优雅和易用的设计理念，提供了更现代化的 TypeScript 支持和更强大的功能扩展能力。

本项目开发初衷在于提高群活跃氛围、方便群管理，仅供个人娱乐、学习和交流使用，**不得将本项目用于任何非法用途**。

## 为什么选择 mioki {#why}

- 🌟 **KiviBot 继任者**：继任 KiviBot 的优良传统和设计理念
- 🧩 **插件式架构**：支持热插拔插件，运行时动态启用/禁用/重载，方便扩展功能
- 🔌 **插件可移植**：适配器可插拔，可适配不同聊天平台
- 💡 **简单易用**：简洁的 API 设计，快速上手
- 📦 **TypeScript 优先**：完整的类型定义，路由级事件类型推断，极致的开发体验
- ⏱️ **定时任务**：内置 cron 表达式支持，轻松实现定时任务
- 🛠️ **丰富的工具函数**：提供大量实用工具函数，简化插件开发

更多特性等你探索...

## 插件示例 {#plugin-example}

仅需编写少量代码即可实现丰富功能，比如：

```ts
import { definePlugin } from 'mioki'
import { segment } from 'mioki-adapter-onebotv11' //以 OneBot 为例

export default definePlugin({
  name: 'words',
  version: '1.0.0',
  async setup(ctx) {
    ctx.logger.info('插件 Words 已加载！')

    ctx.handle('onebotv11:message', async (event) => {
      ctx.match(
        event,
        {
          hello: 'world',

          现在几点: () => new Date().toLocaleTimeString('zh-CN'),

          赞我: async () => {
            await event.bot.sendLike(event.user_id!, 10)
            return ['已为您点赞 10 次', segment.face(66)]
          },

          '我要头衔*': async (matches) => {
            if (event.message_type !== 'group' || !event.group_id || !event.user_id) return
            await event.bot.setMemberCard(event.group_id, event.user_id, matches[0].slice(4))
            return `头衔已设置：${matches[0].slice(4)}`
          },

          '*油价': async (matches) => {
            const regionEncoded = encodeURIComponent(matches[0].slice(0, -2) || '北京')
            const api = `https://60s.viki.moe/v2/fuel-price?region=${regionEncoded}&encoding=text`
            return await (await fetch(api)).text()
          },
        },
        true,
      )
    })

    return () => {
      ctx.logger.info('插件 Words 已卸载！')
    }
  },
})
```

## 下一步 {#next-steps}

- 跟随 [快速开始](/start) 搭建你的第一个机器人
- 阅读 [插件入门](/plugin) 学习插件开发
