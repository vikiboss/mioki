import { definePlugin } from 'mioki'
import {segment} from 'mioki-adapter-onebotv11'


export default definePlugin({
  name: 'words',
  version: '1.0.0',
  async setup(ctx) {
    ctx.handle('onebotv11:message', async (event) => {
      await ctx.match(
        event,
        {
          hello: 'world',

          现在几点: () => new Date().toLocaleTimeString('zh-CN'),

          赞我: async () => {
            await event.bot.sendLike(event.user_id!, 10)
            return ['已为您点赞 10 次', segment.face(66)]
          },

          '我要头衔*': async (matches) => {
            if (event.message_type !== 'group') return
            await event.bot.setMemberCard(event.group_id!, event.user_id!, matches[0].slice(4))
            return `头衔已设置：${matches[0].slice(4)}`
          },

          '查信息*': async (matches) => {
            const uin = Number(matches[0].slice(3))
            if (!uin || isNaN(uin)) return '请输入正确的 QQ 号'
            const info = await event.bot.sendApi<{ user_id: string; nickname: string }>('get_stranger_info', {
              user_id: uin,
            })
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
