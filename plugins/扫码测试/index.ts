import { definePlugin } from 'mioki'

export default definePlugin({
  name: '扫码测试',
  description: '扫码测试',
  version: '1.0.0',
  setup(ctx) {
    ctx.handle('message.group', async (e) => {
      const text = ctx.text(e)

      // ctx.logger.info(`services: ${Object.keys(ctx.services)}`)

      // const { QRLogin, qrLogin, loginMiniProgram } = ctx.services.login

      if (text === '登录会员') {
        const { QRLoginSession, createQRLogin } = ctx.services.login

        const session = createQRLogin(QRLoginSession.Presets.vip)

        session.onQRCode((qrcode) => {
          e.reply([ctx.segment.image(qrcode), '请在 2 分钟之内扫描下方二维码'])
        })

        session.onRefused(({ nickname }) => {
          e.reply(`本次登录已被 ${nickname} 拒绝`, true)
        })

        session.onExpired(() => {
          e.reply('二维码已失效，请重新获取', true)
        })

        session.onSuccess(({ nickname }) => {
          e.reply(`${nickname} 登录成功`, true)
        })

        session.onTimeout(() => {
          e.reply('登录超时，请重新获取二维码', true)
        })

        const cookie = await session.login().catch((err) => {
          ctx.bot.logger.error('扫码登录会员失败', err)
          e.reply('>>> 登录会员失败，请稍后重试', true)
          return null
        })

        if (cookie) {
          ctx.bot.logger.info('扫码登录会员成功', cookie)
          e.reply(`>>> 登录会员成功，请通过控制台查看 cookie`)
        }
      }

      // if (text === '登录空间') {
      //   const cookie = await qrLogin(QRLogin.qzone, {
      //     onQRcode: (qrcode) => {
      //       e.reply([ctx.segment.image(qrcode), '请在 2 分钟之内扫描下方二维码'])
      //     },
      //     onRefused: () => {
      //       e.reply('本次登录已被拒绝', true)
      //     },
      //     onExpired: () => {
      //       e.reply('二维码已失效，请重新获取', true)
      //     },
      //     onSuccess: () => {
      //       e.reply('登录成功')
      //     },
      //     onTimeout: () => {
      //       e.reply('登录超时，请重新获取二维码', true)
      //     },
      //   }).catch((err) => {
      //     ctx.bot.logger.error('扫码登录空间失败', err)
      //     e.reply('>>> 登录空间失败，请稍后重试', true)
      //     return null
      //   })

      //   if (cookie) {
      //     ctx.bot.logger.info('扫码登录空间成功', cookie)
      //     e.reply(`>>> 登录空间成功，请通过控制台查看 cookie`)
      //   }
      // }

      // if (text.startsWith('登录小程序')) {
      //   const appid = text.replace('登录小程序', '').trim() || '1109907872'

      //   const result = await loginMiniProgram?.(appid, {
      //     onLink: (link) => {
      //       e.reply(link)
      //     },
      //     onRefused: () => {
      //       e.reply('本次登录已被拒绝', true)
      //     },
      //     onExpired: () => {
      //       e.reply('二维码已失效，请重新获取', true)
      //     },
      //     onSuccess: () => {
      //       e.reply('登录成功')
      //     },
      //     onTimeout: () => {
      //       e.reply('登录超时，请重新获取二维码', true)
      //     },
      //   }).catch((err) => {
      //     ctx.bot.logger.error('扫码登录小程序失败', err)
      //     e.reply('>>> 登录小程序失败，请稍后重试', true)
      //     return null
      //   })

      //   if (result) {
      //     ctx.bot.logger.info('扫码登录小程序成功', result)
      //     e.reply(`>>> 登录小程序成功，appid: ${appid}`)
      //   }
      // }
    })
  },
})
