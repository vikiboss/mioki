import { definePlugin } from 'mioki'

export default definePlugin({
  name: '赞我',
  version: '1.0.0',
  async setup(ctx) {
    ctx.handle('message.group', async (event) => {
      if (event.raw_message === '赞我') {
        await ctx.bot.sendLike(event.sender.user_id, 10)
        await event.addReaction('66')
      }
    })
  },
})
