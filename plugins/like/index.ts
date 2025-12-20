import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'like',
  version: '1.0.0',
  async setup(ctx) {
    ctx.handle('message.group', async (event) => {
      if (event.raw_message === '赞我') {
        const isOK = await ctx.bot.sendLike(event.sender.user_id, 10)
        await event.addReaction(isOK ? '66' : '67')
      }
    })
  },
})
