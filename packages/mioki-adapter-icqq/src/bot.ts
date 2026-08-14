import { parseDmMessageId, parseGroupMessageId } from 'mioki-adapter-icqq/vendor/icqq'
import type {
  Client,
  Domain,
  FriendInfo,
  GroupInfo,
  MemberInfo,
  MessageElem,
  Quotable,
  Sendable,
} from 'mioki-adapter-icqq/vendor/icqq'
import type {
  Bot as MiokiBot,
  ForwardNode,
  FriendInfo as CoreFriendInfo,
  GroupInfo as CoreGroupInfo,
  HistoryMessage,
  MemberInfo as CoreMemberInfo,
  MessageGetResult,
  MessageInput,
  MessageTarget,
  SentMessage,
} from 'mioki'
import { buildSentMessage, fromIcqqMessage, replyIdOf, toIcqqMessage } from './message'

export interface IcqqData {
  bot_id: string
  adapter: string
  nickname: string
  online: boolean
  connected_at?: number
}
const num = (value: string): number => Number(value)
const member = (value: MemberInfo): CoreMemberInfo => ({
  ...value,
  user_id: String(value.user_id),
  join_time: value.join_time,
  last_sent_time: value.last_sent_time,
})
const group = (value: GroupInfo): CoreGroupInfo => ({
  ...value,
  group_id: String(value.group_id),
  group_name: value.group_name,
})
const friend = (value: FriendInfo): CoreFriendInfo => ({
  ...value,
  user_id: String(value.user_id),
  nickname: value.nickname,
  remark: value.remark,
})

export type IcqqBot = MiokiBot & {
  readonly client: Client
  sendApi<T>(action: string, params?: Record<string, unknown> | unknown[]): Promise<T>
  pickGroup(groupId: string): ReturnType<Client['pickGroup']>
  pickFriend(userId: string): ReturnType<Client['pickFriend']>
  getFriendList(): Promise<CoreFriendInfo[]>
  getGroupList(): Promise<CoreGroupInfo[]>
  getGroupInfo(groupId: string): Promise<CoreGroupInfo | null>
  getGroupMembers(groupId: string): Promise<CoreMemberInfo[]>
  getMemberInfo(groupId: string, userId: string): Promise<CoreMemberInfo | null>
  getFriendInfo(userId: string): Promise<CoreFriendInfo | null>
  getHistory(target: MessageTarget, before?: string, limit?: number): Promise<HistoryMessage[]>
  recallMessage(messageId: string): Promise<void>
  getMessage(messageId: string): Promise<MessageGetResult | null>
  getForwardMessage(messageId: string): Promise<ForwardNode[]>
  banMember(groupId: string, userId: string, duration: number): Promise<void>
  kickMember(groupId: string, userId: string, reject?: boolean): Promise<void>
  setMemberCard(groupId: string, userId: string, card: string): Promise<void>
  setMemberAdmin(groupId: string, userId: string, enable: boolean): Promise<void>
  leaveGroup(groupId: string): Promise<void>
  setGroupName(groupId: string, name: string): Promise<void>
  setGroupPortrait(groupId: string, file: string | Buffer): Promise<void>
  deleteFriend(userId: string): Promise<void>
}

/** 尚未绑定能力分发的 IcqqBot，supports/invoke 由 bindCapabilities 提供 */
export type IcqqBotBase = Omit<IcqqBot, 'supports' | 'invoke'>

const toNum = (value: unknown): number => Number(value)
const toStr = (value: unknown): string => String(value)
const toBool = (value: unknown, fallback: boolean | undefined): boolean | undefined =>
  value == null ? fallback : Boolean(value)

/** OneBot 风格 action → icqq client 调用。参数与 OneBot v11 一致，便于跨适配器迁移。 */
const STANDARD_API: Record<string, (client: Client, p: Record<string, unknown>) => Promise<unknown>> = {
  get_login_info: async (client) => ({ user_id: client.uin, nickname: client.nickname }),
  get_friend_list: async (client) => client.getFriendList(),
  get_group_list: async (client) => client.getGroupList(),
  get_stranger_info: async (client, p) => client.getStrangerInfo(toNum(p.user_id)),
  get_group_info: async (client, p) => client.getGroupInfo(toNum(p.group_id)),
  get_group_member_list: async (client, p) => client.getGroupMemberList(toNum(p.group_id)),
  get_group_member_info: async (client, p) => client.getGroupMemberInfo(toNum(p.group_id), toNum(p.user_id)),
  get_msg: async (client, p) => client.getMsg(toStr(p.message_id)),
  get_forward_msg: async (client, p) => client.getForwardMsg(toStr(p.message_id)),
  get_cookies: async (client, p) => client.getCookies(p.domain as Domain | undefined),
  image_ocr: async (client, p) => client.imageOcr(p.file as string),
  send_private_msg: async (client, p) => client.sendPrivateMsg(toNum(p.user_id), p.message as Sendable),
  send_group_msg: async (client, p) => client.sendGroupMsg(toNum(p.group_id), p.message as Sendable),
  send_temp_msg: async (client, p) => client.sendTempMsg(toNum(p.group_id), toNum(p.user_id), p.message as Sendable),
  send_group_sign: async (client, p) => client.sendGroupSign(toNum(p.group_id)),
  send_group_poke: async (client, p) => client.sendGroupPoke(toNum(p.group_id), toNum(p.user_id)),
  send_group_notice: async (client, p) => client.sendGroupNotice(toNum(p.group_id), toStr(p.content)),
  delete_msg: async (client, p) => client.deleteMsg(toStr(p.message_id)),
  delete_friend: async (client, p) => client.deleteFriend(toNum(p.user_id), toBool(p.block, false)),
  set_group_ban: async (client, p) => client.setGroupBan(toNum(p.group_id), toNum(p.user_id), toNum(p.duration)),
  set_group_kick: async (client, p) =>
    client.setGroupKick(toNum(p.group_id), toNum(p.user_id), toBool(p.reject_add_request, false)),
  set_group_whole_ban: async (client, p) => client.setGroupWholeBan(toNum(p.group_id), toBool(p.enable, undefined)),
  set_group_card: async (client, p) => client.setGroupCard(toNum(p.group_id), toNum(p.user_id), toStr(p.card)),
  set_group_admin: async (client, p) =>
    client.setGroupAdmin(toNum(p.group_id), toNum(p.user_id), toBool(p.enable, undefined)),
  set_group_leave: async (client, p) => client.setGroupLeave(toNum(p.group_id)),
  set_group_name: async (client, p) => client.setGroupName(toNum(p.group_id), toStr(p.group_name)),
  set_group_special_title: async (client, p) =>
    client.setGroupSpecialTitle(toNum(p.group_id), toNum(p.user_id), toStr(p.special_title)),
  set_essence_message: async (client, p) => client.setEssenceMessage(toStr(p.message_id)),
  remove_essence_message: async (client, p) => client.removeEssenceMessage(toStr(p.message_id)),
}

export const createIcqqBot = (client: Client, data: IcqqData): IcqqBotBase => {
  const bot = {
    get bot_id() {
      return data.bot_id
    },
    adapter: data.adapter,
    get nickname() {
      return data.nickname
    },
    get online() {
      return data.online
    },
    get connected_at() {
      return data.connected_at
    },
    client,
    async sendMessage(target: MessageTarget, message: MessageInput): Promise<SentMessage> {
      if (!data.online) {
        throw new Error(`Bot ${data.bot_id} is not online`)
      }
      const replyId = replyIdOf(message)
      let source: Quotable | undefined
      if (replyId) {
        try {
          source = (await client.getMsg(replyId)) as Quotable | undefined
        } catch {
          // 引用的消息不存在或已失效，降级为不带引用的普通发送
        }
      }
      const content = toIcqqMessage(message)
      const sent =
        target.type === 'group' && target.group_id
          ? await client.sendGroupMsg(num(target.group_id), content, source)
          : target.user_id
            ? await client.sendPrivateMsg(num(target.user_id), content, source)
            : undefined
      if (!sent) throw new Error(`Unsupported target type: ${target.type}`)
      return buildSentMessage(sent)
    },
    // 优先走 OneBot 风格 action 映射；未映射的 action 若与 client 方法同名，
    // 则按数组参数直接透传，从而覆盖 icqq client 的全部方法。
    async sendApi<T>(action: string, params: Record<string, unknown> | unknown[] = {}): Promise<T> {
      const standard = STANDARD_API[action]
      if (standard) return (await standard(client, params as Record<string, unknown>)) as Promise<T>
      const fn = (client as unknown as Record<string, unknown>)[action]
      if (typeof fn === 'function') {
        const args = Array.isArray(params) ? params : [params]
        return (fn as (...args: unknown[]) => Promise<unknown>).apply(client, args) as Promise<T>
      }
      throw new Error(`Unsupported icqq api: ${action}`)
    },
    pickGroup: (groupId: string) => client.pickGroup(num(groupId)),
    pickFriend: (userId: string) => client.pickFriend(num(userId)),
    getFriendList: async () => Array.from(client.getFriendList().values()).map(friend),
    getGroupList: async () => Array.from(client.getGroupList().values()).map(group),
    getGroupInfo: async (groupId: string) => {
      try {
        return group(await client.getGroupInfo(num(groupId)))
      } catch {
        return null
      }
    },
    getGroupMembers: async (groupId: string) =>
      Array.from((await client.getGroupMemberList(num(groupId))).values()).map(member),
    getMemberInfo: async (groupId: string, userId: string) => {
      try {
        return member(await client.getGroupMemberInfo(num(groupId), num(userId)))
      } catch {
        return null
      }
    },
    getFriendInfo: async (userId: string) => {
      try {
        const friend = client.pickFriend(num(userId))
        const simple = await friend.getSimpleInfo().catch(() => null)
        return {
          user_id: String(friend.user_id),
          nickname: friend.nickname ?? simple?.nickname,
          remark: friend.remark,
          user_uid: friend.user_uid,
        }
      } catch {
        return null
      }
    },
    getHistory: async (target: MessageTarget, before?: string, limit = 20) => {
      const list =
        target.type === 'group' && target.group_id
          ? await client
              .pickGroup(num(target.group_id))
              .getChatHistory(before ? parseGroupMessageId(before).seq : 0, limit)
          : target.user_id
            ? await client
                .pickFriend(num(target.user_id))
                .getChatHistory(before ? parseDmMessageId(before).time : undefined, limit)
            : []
      return list.map((item) => ({
        message_id: item.message_id,
        time: item.time * 1000,
        message: fromIcqqMessage(item.message, item.raw_message),
      }))
    },
    recallMessage: async (messageId: string) => {
      const ok = await client.deleteMsg(messageId)
      if (!ok) throw new Error(`Failed to recall message ${messageId}`)
    },
    getMessage: async (messageId: string) => {
      const item = await client.getMsg(messageId)
      return item
        ? {
            message_id: item.message_id,
            time: item.time * 1000,
            user_id: String(item.user_id),
            raw_message: item.raw_message,
            message: fromIcqqMessage(item.message, item.raw_message),
          }
        : null
    },
    getForwardMessage: async (messageId: string) => {
      const msg = await client.getMsg(messageId)
      const element = (msg?.message ?? []).find(
        (item): item is Extract<MessageElem, { resid: string }> =>
          typeof item === 'object' && item !== null && 'resid' in item && typeof item.resid === 'string',
      )
      if (!element) return []
      return (await client.getForwardMsg(element.resid)).map((item) => ({
        user_id: String(item.user_id),
        nickname: item.nickname,
        time: item.time * 1000,
        message: fromIcqqMessage(item.message, item.raw_message),
      }))
    },
    banMember: async (g: string, u: string, d: number) => {
      await client.setGroupBan(num(g), num(u), d)
    },
    kickMember: async (g: string, u: string, reject = false) => {
      await client.setGroupKick(num(g), num(u), reject)
    },
    setMemberCard: async (g: string, u: string, c: string) => {
      await client.setGroupCard(num(g), num(u), c)
    },
    setMemberAdmin: async (g: string, u: string, e: boolean) => {
      await client.setGroupAdmin(num(g), num(u), e)
    },
    leaveGroup: async (g: string) => {
      await client.setGroupLeave(num(g))
    },
    setGroupName: async (g: string, n: string) => {
      await client.setGroupName(num(g), n)
    },
    setGroupPortrait: async (g: string, f: string | Buffer) => {
      await client.setGroupPortrait(num(g), f as Parameters<typeof client.setGroupPortrait>[1])
    },
    deleteFriend: async (userId: string) => {
      await client.deleteFriend(num(userId))
    },
    as<T extends object = Record<string, unknown>>() {
      return this as unknown as T
    },
  } satisfies IcqqBotBase
  return bot
}
