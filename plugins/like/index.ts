import { definePlugin } from 'mioki'
import 'mioki-adapter-onebotv11'

export default definePlugin({
  name: 'like',
  version: '1.0.0',
  description: '名片赞插件',
  setup(ctx) {
    ctx.handle('onebotv11:message.group', async (e) => {
      await ctx.match(e, {
        赞我: async () => {
          if (!e.user_id) return
          let count = 0
          while (await e.bot.sendLike(e.user_id, 10)) count += 10
          return count > 0 ? `赞了你 ${count} 下` : '今天点过了，明天再来'
        },
      })
    })
  },
})
