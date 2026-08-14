import { definePlugin, segment } from 'mioki'

export default definePlugin({
  name: 'demo',
  version: '1.0.0',
  async setup(ctx) {
    ctx.logger.info('Demo 插件已加载')

    // 处理所有消息：群、好友
    ctx.handle('message', async (e) => {
      const text = e.message.text()

      // 收到 hello 消息时回复 world（quote 表示引用原消息）
      if (text === 'hello') {
        await e.reply('world', { quote: true })
      }

      // 收到 love 消息时回复"爱你哟"
      if (text === 'love') {
        await e.reply('爱你哟')
      }

      // 收到 壁纸 消息时回复今天的 bing 壁纸
      if (text === '壁纸') {
        await e.reply(segment.image('https://60s.viki.moe/v2/bing?encoding=image'))
      }

      // 收到 一言 消息时回复一言
      if (text === '一言') {
        const data = await (await fetch('https://v1.hitokoto.cn/')).json()
        await e.reply(data.hitokoto, { quote: true })
      }
    })

    ctx.handle('message.group', (e) => {
      // 处理群消息，e 为 MessageEvent
      // e.message / e.user_id / e.group_id / e.reply(...)
    })

    ctx.handle('message.private', (e) => {
      // 处理好友消息
    })

    // 处理所有请求：好友、群，添加好友、邀请入群等等
    ctx.handle('request', (e) => {
      // e.approve() // 同意请求
      // e.reject()  // 拒绝请求
    })

    // 处理所有通知，好友、群的数量增加与减少、戳一戳、撤回等等
    ctx.handle('notice', (e) => {
      ctx.logger.info('Notice', e)
    })

    ctx.cron('0 0 9 * * *', (ctx) => {
      ctx.logger.info('每天早上 9 点执行')
    })

    return () => {
      ctx.logger.info('Demo 插件已卸载')
    }
  },
})
