import { definePlugin } from 'mioki'
import 'mioki-adapter-onebotv11'

export default definePlugin({
  name: 'qzone',
  async setup(ctx) {
    ctx.handle('onebotv11:message', async (e) => {
      if (!ctx.isOwner(e)) return

      const text = e.message.text()
      if (text.startsWith('发说说')) {
        const content = text.replace('发说说', '').trim()
        const { legacyCookie } = await e.bot.getCookie('qzone.qq.com')
        const success = await sendQzonePost(legacyCookie, content)
        await e.reply(success ? '说说发布成功' : '说说发布失败')
      }
    })
  },
})

async function uploadQzoneImage(qzone_ck: string, base64Image: string) {
  try {
    const UA_iOS_QQ = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 QQ/8.9.28.635'

    const qq = /uin=o?(\d+);/.exec(qzone_ck)?.[1] || ''
    const skey = /skey=([^;]+);/.exec(qzone_ck)?.[1] || ''
    const p_uin = /p_uin=o?(\d+);/.exec(qzone_ck)?.[1] || ''
    const p_skey = /p_skey=([^;]+);/.exec(qzone_ck)?.[1] || ''
    const uploadApi = `https://up.qzone.qq.com/cgi-bin/upload/cgi_upload_image?g_tk=${qq_encrypt(p_skey)}`

    const postData = new URLSearchParams({
      uin: qq,
      skey,
      p_uin,
      p_skey,
      albumtype: '7',
      upload_hd: '1',
      base64: '1',
      picfile: base64Image,
    })

    const data = await (
      await fetch(uploadApi, {
        method: 'POST',
        body: postData,
        headers: {
          Cookie: qzone_ck,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': UA_iOS_QQ,
          Referer: 'https://user.qzone.qq.com/',
        },
      })
    ).text()

    const jsonStr = data.replace('_Callback(', '').replace(');', '')
    return JSON.parse(jsonStr)?.data || {}
  } catch (e) {
    return ''
  }
}

async function sendQzonePost(qzone_ck: string, content: string, imagesBase64: string = '', isPrivate = false) {
  try {
    const UA_iOS_QQ = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 QQ/8.9.28.635'

    const qq = /uin=o?(\d+);/.exec(qzone_ck)?.[1] || ''
    const pskey = /p_skey=([^;]+);/.exec(qzone_ck)?.[1] || ''

    const postData: Record<string, string> = {
      con: content.trim(),
      ugc_right: isPrivate ? '64' : '1',
      hostuin: qq,
    }

    if (imagesBase64) {
      const res = await uploadQzoneImage(qzone_ck, imagesBase64)
      postData.richtype = '1'
      postData.richval = `,${res.albumid},${res.lloc},${res.sloc},${res.type},${res.width},${res.height},,${res.width},${res.height}`
      postData.subrichtype = '1'
    }

    const proxyApi = 'https://user.qzone.qq.com/proxy/domain'
    const qzonePostApi = `${proxyApi}/taotao.qzone.qq.com/cgi-bin/emotion_cgi_publish_v6?g_tk=${qq_encrypt(pskey)}`

    const data = await (
      await fetch(qzonePostApi, {
        method: 'POST',
        body: new URLSearchParams(postData),
        headers: {
          Cookie: qzone_ck,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': UA_iOS_QQ,
        },
      })
    ).text()

    const code = /"code":\s?(-?[0-9]+)/.exec(data)
    return code && code.length && +code[1] >= 0
  } catch (e) {
    return false
  }
}

function qq_encrypt(str: string): number {
  let bkn = 5381

  for (const c of str) {
    bkn += (bkn << 5) + c.charCodeAt(0)
  }

  return bkn & 2147483647
}
