import { definePlugin } from 'mioki'

export default definePlugin({
  name: 'hi',
  version: '1.0.0', // optional
  priority: 10, // optional, default is 10
  description: 'A simple hi plugin', // optional
  dependencies: [], // no extra dependencies, optional, default is []
  async setup(ctx) {
    ctx.bot.logger.info('plugin has been set up!')

    ctx.bot.logger.info(`bot: ${ctx.bot.uin}, ${ctx.bot.nickname}`)

    const info = await ctx.bot.api<{ user_id: number; nickname: string }>('get_login_info')
    ctx.bot.logger.info(`bot login info: user_id=${info.user_id}, nickname=${info.nickname}`)

    ctx.handle('notice', async (e) => {
      ctx.bot.logger.info(`received a notice: ${JSON.stringify(e)}`)
    })

    ctx.handle('request.friend', async (e) => {
      ctx.bot.logger.info('收到好友请求：', e.user_id)
      await e.approve()
      ctx.bot.logger.info('已自动通过好友请求')
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
