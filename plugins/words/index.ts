import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'words',
  version: '1.0.0',
  async setup(ctx) {
    ctx.handle('message', async (event) => {
      ctx.match(
        event,
        {
          hello: 'world',

          现在几点: () => new Date().toLocaleTimeString('zh-CN'),

          赞我: async () => {
            await ctx.bot.sendLike(event.user_id, 10)
            return ['已为您点赞 10 次', ctx.segment.face(66)]
          },

          '我要头衔*': async (matches, event) => {
            if (event.message_type !== 'group') return

            const title = matches[0].slice(4)
            await event.group.setTitle(event.user_id, title)
            return `头衔已设置：${title}`
          },

          '查信息*': async (matches) => {
            const uin = Number(matches[0].slice(3))
            if (!uin || isNaN(uin)) return '请输入正确的 QQ 号'
            const info = await ctx.bot.getStrangerInfo(uin)
            return JSON.stringify(info, null, 2)
          },

          '*油价': async (matches) => {
            const regionEncoded = encodeURIComponent(matches[0].slice(0, -2) || '北京')
            const api = `https://60s.viki.moe/v2/fuel-price?region=${regionEncoded}&encoding=text`
            return await (await fetch(api)).text()
          },

          '/^(?<city>.{2,10})天气$/': async (matches) => {
            const cityEncoded = encodeURIComponent(matches.groups?.city || '北京')
            const api = `https://60s.viki.moe/v2/weather/realtime?query=${cityEncoded}&encoding=text`
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
