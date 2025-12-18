import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'hi',
  version: '1.0.0',
  priority: 10,
  description: 'A simple hi plugin',
  dependencies: [], // no extra dependencies
  async setup(ctx) {
    ctx.bot.logger.info('plugin has been set up!')

    ctx.bot.logger.info('bot:', ctx.bot.uin, ctx.bot.nickname)

    const info = await ctx.bot.api<{ user_id: number; nickname: string }>('get_login_info')
    ctx.bot.logger.info('bot login info:', info)

    ctx.handle('notice', async (e) => {
      ctx.bot.logger.info('received a notice', JSON.stringify(e))
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
      ctx.bot.logger.info(`cron task executed at ${task.date}`)
      // ctx.bot.sendPrivateMsg(ctx.botConfig.owners[0], 'hi from cron task!')
    })

    return () => {
      ctx.bot.logger.info('plugin has been cleaned up!')
    }
  },
})
