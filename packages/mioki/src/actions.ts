import crypto from 'node:crypto'
import { logger } from './logger'
import * as utils from './utils'
import { segment } from 'napcat-sdk'
import { botConfig } from './config'

import type { NapCat, Sendable } from 'napcat-sdk'

/**
 * 群发群消息
 */
export async function noticeGroups(
  bot: NapCat,
  groupIdList: number[],
  message?: Sendable | null,
  delay = 1000,
): Promise<void> {
  if (!bot.isOnline()) {
    logger.error('发送失败，Bot 不在线')
    return
  }

  if (!message) {
    logger.warn('消息内容为空')
    return
  }

  for (const groupId of groupIdList) {
    const group = await bot.pickGroup(groupId)
    if (!group) continue
    await group.sendMsg(message)
    await utils.wait(delay)
  }
}

/**
 * 群发好友消息
 */
export async function noticeFriends(
  bot: NapCat,
  friendIdList: number[],
  message?: Sendable | null,
  delay = 1000,
): Promise<void> {
  if (!bot.isOnline) {
    logger.error('发送失败，Bot 不在线')
    return
  }

  if (!message) {
    logger.warn('消息内容为空')
    return
  }

  for (const friendId of friendIdList) {
    await bot.sendPrivateMsg(friendId, message)
    await utils.wait(delay)
  }
}

/**
 * 群发通知给管理员
 */
export async function noticeAdmins(bot: NapCat, message?: Sendable | null, delay = 1000): Promise<void> {
  await noticeFriends(bot, botConfig.admins, message, delay)
}

/**
 * 群发通知给主人
 */
export async function noticeOwners(bot: NapCat, message?: Sendable | null, delay = 1000): Promise<void> {
  await noticeFriends(bot, botConfig.owners, message, delay)
}

/**
 * 群发通知给第一个主人
 */
export async function noticeMainOwner(bot: NapCat, message?: Sendable | null): Promise<void> {
  if (!bot.isOnline()) {
    logger.error('发送失败，Bot 不在线')
    return
  }

  if (!message) {
    logger.warn('消息内容为空')
    return
  }

  const mainOwner = botConfig.owners[0]

  if (mainOwner) {
    await (await bot.pickFriend(mainOwner))?.sendMsg(message)
    return
  }

  throw new Error('请至少设置一个主人')
}

/**
 * 签名卡片 json
 */
export async function signArk(bot: NapCat, json: string): Promise<string> {
  const { cookie, gtk } = await bot.getCookie('qzone.qq.com')

  const fetchArk = (url: string) => {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ ark: json }),
    })
  }

  const SignUrl = {
    normal: `https://h5.qzone.qq.com/v2/vip/tx/trpc/ark-share/GenSignedArk?g_tk=${gtk}`,
    new: `https://h5.qzone.qq.com/v2/vip/tx/trpc/ark-share/GenNewSignedArk?g_tk=${gtk}`,
  }

  try {
    const { code, data = {} } = await (await fetchArk(SignUrl.normal)).json()
    if (+code === 0 && data?.signed_ark) return data.signed_ark
    throw new Error('签不了一点')
  } catch {
    const { code, data = {} } = await (await fetchArk(SignUrl.new)).json()
    if (+code === 0 && data?.signed_ark) return data.signed_ark
    throw new Error('签不了一点')
  }
}

/**
 * 运行函数并捕获错误, 并通过 event.reply 发送错误信息
 */
export async function runWithErrorHandler(
  bot: NapCat,
  fn: () => any,
  event?: { reply: (content: Sendable, quote?: boolean) => Promise<{ message_id: number }> },
  message: Sendable | ((error: string) => Sendable) = (err) => `报...报错了啦！ 杂鱼~ 杂鱼~ \n\n${err}`,
): Promise<any> {
  try {
    return await fn()
  } catch (error) {
    const errorMsg = typeof message === 'function' ? message(utils.stringifyError(error)) : message

    if (event) {
      await event.reply(errorMsg)
    } else {
      try {
        await noticeMainOwner(bot, '发送失败，可能被风控，请检查签名状态。')
      } catch {
        logger.error('发送失败，可能被风控，请检查签名状态。')
      }
    }
  }
}

/** 创建和并转发消息 */
export function createForwardMsg(
  bot: NapCat,
  message: Sendable[] = [],
  options: { user_id?: number; nickname?: string } = {},
): Sendable {
  const { user_id = bot.uin, nickname } = options
  const content = message.map((msg) => (typeof msg === 'string' ? segment.text(msg) : msg))
  return segment.node({ user_id: String(user_id), nickname, content })
}

/**
 * 上传图片到收藏
 */
export async function uploadImageToCollection(bot: NapCat, buffer: ArrayBuffer): Promise<string> {
  const pskey = (await bot.getPskey('weiyun.com')) || ''
  const uuid = crypto.randomUUID()

  let randomID: string | number = crypto.randomInt(1, 99)
  if (randomID < 10) randomID = `0${randomID}`

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      Cookie: `uin=${bot.uin}; vt=27; vi=${pskey}; pid=00${randomID}/${uuid}; appid=30243`,
      'User-Agent': 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)',
    },
    body: buffer,
  }

  let code: number | undefined = undefined

  for (let i = 3; i > 0; i--) {
    const response = await fetch('https://uploader.collector.weiyun.com/pic_uploader.fcg', options)
    const headers = response.headers
    code = +(headers.get('user-returncode') || '')
    const msg = headers.get('user-errmsg')
    console.log(3 - i, 'uploadImageToCollector', response.status, code, msg)
    if (code === 0) break
  }

  return code === 0 ? `https://shp.qpic.cn/collector//${uuid}/0` : ''
}

/**
 * 上传图片到群作业
 */
export async function uploadImageToGroupHomework(bot: NapCat, imgBase64: string): Promise<string> {
  const { cookie, bkn } = await bot.getCookie('qun.qq.com')

  const res = await fetch('https://qun.qq.com/cgi-bin/hw/util/image', {
    method: 'POST',
    headers: {
      cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      origin: 'https://qun.qq.com',
      referer: 'https://qun.qq.com/homework/p/features/index.html',
    },
    body: `pic=${encodeURIComponent(imgBase64)}&client_type=1&bkn=${bkn}`,
  })

  const data = await res.json()

  if (+data.retcode !== 0) return ''

  return data?.data?.url?.origin || ''
}

/**
 * 上传图片到群公告
 */
export async function uploadImageToGroupNotice(
  bot: NapCat,
  urlOrBlob: string | Blob,
): Promise<{
  h: string
  w: string
  id: string
  url: string
  url2: string
  url3: string
  url4: string
  url5: string
  url6: string
}> {
  const { bkn, legacyCookie } = await bot.getCookie('qun.qq.com')

  const blob = urlOrBlob instanceof Blob ? urlOrBlob : await (await fetch(urlOrBlob)).blob()
  const form = new FormData()

  form.append('m', '0')
  form.append('source', 'troopNotice')
  form.append('bkn', String(bkn))
  form.append('qid', '0')
  form.append('pic_up', blob, `image.${blob.type.split('/')[1]}`)

  const data = await (
    await fetch('https://web.qun.qq.com/cgi-bin/announce/upload_img', {
      method: 'POST',
      body: form,
      headers: { 'content-type': 'multipart/form-data', cookie: legacyCookie },
    })
  ).json()

  const { id, ec } = data || {}

  if (!id) {
    throw new Error(`图片上传失败，ec: ${ec}`)
  }

  const imgData = (JSON.parse(id.replace(/&quot;/g, '"')) || {}) as {
    h: string
    w: string
    id: string
  }

  if (!imgData.id) {
    throw new Error('图片上传失败，未获取到图片 id')
  }

  return {
    ...imgData,
    url: `https://p.qpic.cn/gdynamic/${imgData.id}/0`,
    url2: `https://p.qlogo.cn/gdynamic/${imgData.id}/0`,
    url3: `https://p2.qpic.cn/gdynamic/${imgData.id}/0`,
    url4: `https://gdynamic.qpic.cn/gdynamic/${imgData.id}/0`,
    url5: `https://img.wecar.qq.com/gdynamic/${imgData.id}/0`,
    url6: `https://cross.store.qq.com/gdynamic/${imgData.id}/0`,
  }
}

/**
 * 获取 QQ 安全中心违规记录
 */
export async function getViolationRecords(
  bot: NapCat,
  authCode: string,
  appid: number,
  size = 100,
): Promise<
  {
    type: string
    time: string
    duration: string
    reason: number
  }[]
> {
  const minicoData = await utils.getMinicoTokenViaAuthCode(authCode, appid)

  if (!minicoData) return []

  const params = new URLSearchParams({
    ...minicoData,
    appid,
    token: minicoData.minico_token,
  })

  params.delete('expire')
  params.delete('minico_token')

  const response = await fetch(
    `https://minico.qq.com/minico/cgiproxy/v3_release/v3/getillegalityhistory?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        com: {
          src: 0,
          scene: 1001,
          platform: 2,
          version: '8.9.85.12820',
        },
        pageNum: 0,
        pageSize: size,
      }),
    },
  )

  const { retcode, records } = await response.json()

  if (+retcode !== 0 || !records) return []

  return records || []
}
