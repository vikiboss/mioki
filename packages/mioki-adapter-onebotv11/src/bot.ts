import {
  conversationGetHistory,
  groupGetInfo,
  groupGetMembers,
  memberBan,
  memberGetInfo,
  memberKick,
  memberSetAdmin,
  memberSetCard,
  messageRecall,
  messageSend,
} from 'mioki'
import { buildPayload, sentFromOneBot } from './message'
import { buildSegments } from './event'

import type { ApiCaller } from './gateway'
import type {
  Capability,
  Bot as MiokiBot,
  HistoryMessage,
  MemberInfo,
  GroupInfo,
  MessageInput,
  MessageTarget,
  SentMessage,
  AdapterName,
  BotId,
  MessageId,
  UserId,
  GroupId,
} from 'mioki'

export interface OneBotFriendInfo {
  user_id: number
  nickname: string
  [key: string]: unknown
}

export interface OneBotGroupInfo {
  group_id: number
  group_name: string
  member_count: number
  max_member_count: number
  [key: string]: unknown
}

export interface OneBotCookie {
  uin: number
  pskey: string
  skey: string
  gtk: string
  bkn: string
  cookie: string
  legacyCookie: string
}

export interface OneBotBotData {
  bot_id: BotId
  readonly adapter: AdapterName
  nickname: string
  online: boolean
  connected_at?: number
}

export type OneBotBot = MiokiBot & {
  sendApi<T = unknown>(action: string, params?: Record<string, unknown>): Promise<T>
  pickGroup(groupId: GroupId): Promise<OneBotGroupInfo | null>
  pickFriend(userId: UserId): Promise<OneBotFriendInfo | null>
  getCookie(domain: string): Promise<OneBotCookie>
  getPskey(domain: string): Promise<string>
  getVersionInfo(): Promise<{ app_name: string; app_version: string; protocol_version: string }>
  getLoginInfo(): Promise<{ user_id: number; nickname: string }>
  getFriendList(): Promise<OneBotFriendInfo[]>
  getGroupList(): Promise<OneBotGroupInfo[]>
  recallMessage(messageId: MessageId): Promise<void>
  banMember(groupId: GroupId, userId: UserId, duration: number): Promise<void>
  kickMember(groupId: GroupId, userId: UserId): Promise<void>
  setMemberCard(groupId: GroupId, userId: UserId, card: string): Promise<void>
  setMemberAdmin(groupId: GroupId, userId: UserId, enable: boolean): Promise<void>
  getMemberInfo(groupId: GroupId, userId: UserId): Promise<MemberInfo | null>
  getGroupInfo(groupId: GroupId): Promise<GroupInfo | null>
  getGroupMembers(groupId: GroupId): Promise<MemberInfo[]>
  getHistory(target: MessageTarget, before?: MessageId, limit?: number): Promise<HistoryMessage[]>
  sendLike(userId: UserId, times?: number): Promise<boolean>
  as<T extends object = Record<string, unknown>>(): T
}

const toMemberInfo = (raw: Record<string, unknown>): MemberInfo => ({
  ...raw,
  user_id: String(raw.user_id ?? '') as UserId,
})

const toGroupInfo = (raw: Record<string, unknown>): GroupInfo => ({
  ...raw,
  group_id: String(raw.group_id ?? '') as GroupId,
})

const SUPPORTED_CAPABILITIES = [
  messageSend,
  messageRecall,
  memberBan,
  memberKick,
  memberSetCard,
  memberSetAdmin,
  memberGetInfo,
  groupGetInfo,
  groupGetMembers,
  conversationGetHistory,
]

export const createOneBotBot = (params: {
  data: OneBotBotData
  api: ApiCaller
  logger: import('mioki').Logger
  onSend?: () => void
}): OneBotBot => {
  const { data, api, logger, onSend } = params
  const bot: OneBotBot = {
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
        onSend?.()
        return sentFromOneBot(sent as { message_id?: number | string })
      }
      if (target.type === 'private' && target.user_id) {
        const sent = await api('send_private_msg', { user_id: target.user_id, message: buildPayload(message) })
        onSend?.()
        return sentFromOneBot(sent as { message_id?: number | string })
      }
      throw new Error(`Unsupported target type: ${target.type}`)
    },
    supports<I, O>(capability: Capability<I, O>): boolean {
      return SUPPORTED_CAPABILITIES.some((cap) => cap.token === capability.token)
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
      if (capability.token === memberBan.token) {
        const request = input as { group_id: GroupId; user_id: UserId; duration: number }
        await bot.banMember(request.group_id, request.user_id, request.duration)
        return undefined as O
      }
      if (capability.token === memberKick.token) {
        const request = input as { group_id: GroupId; user_id: UserId }
        await bot.kickMember(request.group_id, request.user_id)
        return undefined as O
      }
      if (capability.token === memberSetCard.token) {
        const request = input as { group_id: GroupId; user_id: UserId; card: string }
        await bot.setMemberCard(request.group_id, request.user_id, request.card)
        return undefined as O
      }
      if (capability.token === memberSetAdmin.token) {
        const request = input as { group_id: GroupId; user_id: UserId; enable: boolean }
        await bot.setMemberAdmin(request.group_id, request.user_id, request.enable)
        return undefined as O
      }
      if (capability.token === memberGetInfo.token) {
        const request = input as { group_id: GroupId; user_id: UserId }
        return (await bot.getMemberInfo(request.group_id, request.user_id)) as O
      }
      if (capability.token === groupGetInfo.token) {
        const request = input as { group_id: GroupId }
        return (await bot.getGroupInfo(request.group_id)) as O
      }
      if (capability.token === groupGetMembers.token) {
        const request = input as { group_id: GroupId }
        return (await bot.getGroupMembers(request.group_id)) as O
      }
      if (capability.token === conversationGetHistory.token) {
        const request = input as { target: MessageTarget; before?: MessageId; limit?: number }
        return (await bot.getHistory(request.target, request.before, request.limit)) as O
      }
      throw new Error(`Unsupported capability: ${capability.name}`)
    },
    async sendApi<T = unknown>(action: string, actionParams: Record<string, unknown> = {}): Promise<T> {
      return (await api(action, actionParams)) as T
    },
    async pickGroup(groupId: GroupId) {
      try {
        const result = await api('get_group_info', { group_id: groupId })
        return result as OneBotGroupInfo
      } catch (err) {
        logger.warn(`pickGroup(${groupId}) failed`, err)
        return null
      }
    },
    async pickFriend(userId: UserId) {
      try {
        const result = await api('get_stranger_info', { user_id: userId })
        return result as OneBotFriendInfo
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
      return (await api('get_friend_list')) as OneBotFriendInfo[]
    },
    async getGroupList() {
      return (await api('get_group_list')) as OneBotGroupInfo[]
    },
    async recallMessage(messageId: MessageId) {
      await api('delete_msg', { message_id: messageId })
    },
    async banMember(groupId: GroupId, userId: UserId, duration: number) {
      await api('set_group_ban', { group_id: groupId, user_id: userId, duration })
    },
    async kickMember(groupId: GroupId, userId: UserId) {
      await api('set_group_kick', { group_id: groupId, user_id: userId })
    },
    async setMemberCard(groupId: GroupId, userId: UserId, card: string) {
      await api('set_group_card', { group_id: groupId, user_id: userId, card })
    },
    async setMemberAdmin(groupId: GroupId, userId: UserId, enable: boolean) {
      await api('set_group_admin', { group_id: groupId, user_id: userId, enable })
    },
    async getMemberInfo(groupId: GroupId, userId: UserId) {
      try {
        const result = await api<Record<string, unknown>>('get_group_member_info', {
          group_id: groupId,
          user_id: userId,
        })
        return toMemberInfo(result)
      } catch (err) {
        logger.warn(`getMemberInfo(${groupId},${userId}) failed`, err)
        return null
      }
    },
    async getGroupInfo(groupId: GroupId) {
      try {
        const result = await api<Record<string, unknown>>('get_group_info', { group_id: groupId })
        return toGroupInfo(result)
      } catch (err) {
        logger.warn(`getGroupInfo(${groupId}) failed`, err)
        return null
      }
    },
    async getGroupMembers(groupId: GroupId) {
      const result = await api<Record<string, unknown>[]>('get_group_member_list', { group_id: groupId })
      return result.map(toMemberInfo)
    },
    async getHistory(target: MessageTarget, before?: MessageId, limit = 20) {
      let raw: unknown
      if (target.type === 'group' && target.group_id) {
        raw = await api('get_group_msg_history', {
          group_id: target.group_id,
          message_id: before,
          count: limit,
        })
      } else if (target.type === 'private' && target.user_id) {
        raw = await api('get_friend_msg_history', {
          user_id: target.user_id,
          message_id: before,
          count: limit,
        })
      } else {
        throw new Error(`Unsupported target type: ${target.type}`)
      }
      const list = Array.isArray(raw)
        ? raw
        : (raw as { messages?: unknown[] }).messages ?? []
      return (list as Record<string, unknown>[]).map((entry) => ({
        message_id: String(entry.message_id ?? '') as MessageId,
        time: typeof entry.time === 'number' ? (entry.time as number) * 1000 : undefined,
        message: buildSegments(Array.isArray(entry.message) ? (entry.message as unknown[]) : []),
      }))
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
