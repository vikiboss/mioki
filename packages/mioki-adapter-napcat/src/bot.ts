import { messageReaction, messageRecall, messageSend } from 'mioki'
import { buildPayload, sentFromOneBot } from './message'

import type { ApiCaller } from './gateway'
import type {
  Capability,
  Bot as MiokiBot,
  MessageInput,
  MessageTarget,
  SentMessage,
  AdapterName,
  BotId,
  MessageId,
  UserId,
  GroupId,
} from 'mioki'

export interface NapCatFriendInfo {
  user_id: number
  nickname: string
  [key: string]: unknown
}

export interface NapCatGroupInfo {
  group_id: number
  group_name: string
  member_count: number
  max_member_count: number
  [key: string]: unknown
}

export interface NapCatCookie {
  uin: number
  pskey: string
  skey: string
  gtk: string
  bkn: string
  cookie: string
  legacyCookie: string
}

export interface NapCatBotData {
  bot_id: BotId
  readonly adapter: AdapterName
  nickname: string
  online: boolean
  connected_at?: number
}

export type NapCatBot = MiokiBot & {
  sendApi<T = unknown>(action: string, params?: Record<string, unknown>): Promise<T>
  pickGroup(groupId: GroupId): Promise<NapCatGroupInfo | null>
  pickFriend(userId: UserId): Promise<NapCatFriendInfo | null>
  getCookie(domain: string): Promise<NapCatCookie>
  getPskey(domain: string): Promise<string>
  getVersionInfo(): Promise<{ app_name: string; app_version: string; protocol_version: string }>
  getLoginInfo(): Promise<{ user_id: number; nickname: string }>
  getFriendList(): Promise<NapCatFriendInfo[]>
  getGroupList(): Promise<NapCatGroupInfo[]>
  recallMessage(messageId: MessageId): Promise<void>
  addReaction(messageId: MessageId, emojiId: string): Promise<void>
  removeReaction(messageId: MessageId, emojiId: string): Promise<void>
  sendLike(userId: UserId, times?: number): Promise<boolean>
  as<T extends object = Record<string, unknown>>(): T
}

export const createNapCatBot = (params: {
  data: NapCatBotData
  api: ApiCaller
  logger: import('mioki').Logger
}): NapCatBot => {
  const { data, api, logger } = params
  const bot: NapCatBot = {
    get bot_id(): BotId {
      return data.bot_id
    },
    adapter: data.adapter,
    get nickname(): string | undefined {
      return data.nickname
    },
    get online(): boolean {
      return data.online
    },
    get connected_at(): number | undefined {
      return data.connected_at
    },
    async sendMessage(target: MessageTarget, message: MessageInput): Promise<SentMessage> {
      if (!data.online) {
        throw new Error(`Bot ${data.bot_id} is not online`)
      }
      if (target.type === 'group' && target.group_id) {
        const sent = await api('send_group_msg', { group_id: target.group_id, message: buildPayload(message) })
        return sentFromOneBot(sent as { message_id?: number | string })
      }
      if (target.type === 'private' && target.user_id) {
        const sent = await api('send_private_msg', { user_id: target.user_id, message: buildPayload(message) })
        return sentFromOneBot(sent as { message_id?: number | string })
      }
      throw new Error(`Unsupported target type: ${target.type}`)
    },
    supports<I, O>(capability: Capability<I, O>): boolean {
      return capability.token === messageSend.token || capability.token === messageRecall.token || capability.token === messageReaction.token
    },
    async invoke<I, O>(capability: Capability<I, O>, input: I): Promise<O> {
      if (capability.token === messageSend.token) {
        const request = input as { target: MessageTarget; message: MessageInput }
        return (await bot.sendMessage(request.target, request.message)) as O
      }
      if (capability.token === messageRecall.token) {
        await bot.recallMessage((input as { message_id: MessageId }).message_id)
        return undefined as O
      }
      if (capability.token === messageReaction.token) {
        const request = input as { message_id: MessageId; reaction_id: string; set: boolean }
        if (request.set) await bot.addReaction(request.message_id, request.reaction_id)
        else await bot.removeReaction(request.message_id, request.reaction_id)
        return undefined as O
      }
      throw new Error(`Unsupported capability: ${capability.name}`)
    },
    async sendApi<T = unknown>(action: string, actionParams: Record<string, unknown> = {}): Promise<T> {
      return (await api(action, actionParams)) as T
    },
    async pickGroup(groupId: GroupId) {
      try {
        const result = await api('get_group_info', { group_id: groupId })
        return result as NapCatGroupInfo
      } catch (err) {
        logger.warn(`pickGroup(${groupId}) failed`, err)
        return null
      }
    },
    async pickFriend(userId: UserId) {
      try {
        const result = await api('get_stranger_info', { user_id: userId })
        return result as NapCatFriendInfo
      } catch (err) {
        logger.warn(`pickFriend(${userId}) failed`, err)
        return null
      }
    },
    async getCookie(domain: string) {
      const { cookies, bkn } = await api<{ cookies: string; bkn: string }>('get_cookies', { domain })
      const skey = cookies.match(/skey=([^;]*)/)?.[1] ?? ''
      const pskey = cookies.match(/p_skey=([^;]*)/)?.[1] ?? ''
      let gkt = 5381
      for (let i = 0, len = pskey.length; i < len; ++i) {
        gkt += (gkt << 5) + pskey.charCodeAt(i)
      }
      const gtk = gkt & 0x7fffffff
      const uin = Number(data.bot_id)
      return {
        uin,
        pskey,
        skey,
        gtk: String(gtk),
        bkn,
        cookie: `uin=${uin}; skey=${skey}; p_uin=${uin}; p_skey=${pskey};`,
        legacyCookie: `uin=o${uin}; skey=${skey}; p_uin=o${uin}; p_skey=${pskey};`,
      }
    },
    async getPskey(domain: string) {
      const { pskey } = await this.getCookie(domain)
      return pskey
    },
    async getVersionInfo() {
      return (await api('get_version_info')) as { app_name: string; app_version: string; protocol_version: string }
    },
    async getLoginInfo() {
      return (await api('get_login_info')) as { user_id: number; nickname: string }
    },
    async getFriendList() {
      return (await api('get_friend_list')) as NapCatFriendInfo[]
    },
    async getGroupList() {
      return (await api('get_group_list')) as NapCatGroupInfo[]
    },
    async recallMessage(messageId: MessageId) {
      await api('delete_msg', { message_id: messageId })
    },
    async addReaction(messageId: MessageId, emojiId: string) {
      await api('set_msg_emoji_like', { message_id: messageId, emoji_id: emojiId, set: true })
    },
    async removeReaction(messageId: MessageId, emojiId: string) {
      await api('set_msg_emoji_like', { message_id: messageId, emoji_id: emojiId, set: false })
    },
    async sendLike(userId: UserId, times = 1) {
      try {
        await api('send_like', { user_id: userId, times })
        return true
      } catch {
        return false
      }
    },
    as<T extends object = Record<string, unknown>>(): T {
      return data as unknown as T
    },
  }
  return bot
}
