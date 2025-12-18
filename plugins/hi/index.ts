import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'hi',
  version: '1.0.0',
  priority: 10,
  description: 'A simple hi plugin',
  dependencies: [], // no extra dependencies
  async setup(ctx) {
    console.log('plugin has been set up!')

    console.log('bot:', ctx.bot.uin, ctx.bot.nickname)

    const info = await ctx.bot.api<{ user_id: number; nickname: string }>('get_login_info')
    console.log('bot login info:', info)

    ctx.handle('notice', async (e) => {
      console.log('received a notice', JSON.stringify(e))
    })

    ctx.handle('message.group', async (e) => {
      if (e.raw_message === 'hi') {
        await e.reply('hi from plugin!')
      }

      // e.recall()
      // e.addEssence()
      // e.addReaction('66')
      // const quoteMsg = await e.getQuoteMessage()
      // const text = await ctx.getQuoteText(e)
      // const { uin, pskey, skey, bkn, gtk, cookie } = await ctx.getCookie('qzone.qq.com')
    })

    ctx.cron('*/3 * * * * *', (ctx, task) => {
      console.log(`cron task executed at ${task.date}`)
      ctx.bot.sendPrivateMsg(ctx.botConfig.owners[0], 'hi from cron task!')
    })

    return () => {
      console.log('plugin has been cleaned up!')
    }
  },
})
