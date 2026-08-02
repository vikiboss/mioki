import { defineCapability } from '../adapter'
import { memberBan, memberGetInfo, memberKick, memberSetAdmin, memberSetCard } from './member'
import { messageRecall, messageSend } from './message'

import type { Bot, Capability, MessageInput, SentMessage } from '../adapter'
import type { MemberInfo } from './member'

export interface GroupInfo {
  readonly group_id: string
  readonly group_name?: string
  readonly member_count?: number
  readonly max_member_count?: number
  readonly [key: string]: unknown
}

export interface GroupGetInfoRequest {
  readonly group_id: string
}

export interface GroupGetMembersRequest {
  readonly group_id: string
}

export interface GroupLeaveRequest {
  readonly group_id: string
  /** 是否解散群 */
  readonly is_dismiss?: boolean
}

export interface GroupSetNameRequest {
  readonly group_id: string
  readonly group_name: string
}

export interface GroupSetPortraitRequest {
  readonly group_id: string
  readonly file: string
}

export interface GroupGetListRequest {}

export const groupGetInfo = defineCapability<GroupGetInfoRequest, GroupInfo>('group.getinfo', 1)
export const groupGetMembers = defineCapability<GroupGetMembersRequest, MemberInfo[]>('group.getmembers', 1)
export const groupLeave = defineCapability<GroupLeaveRequest, void>('group.leave', 1)
export const groupSetName = defineCapability<GroupSetNameRequest, void>('group.setname', 1)
export const groupSetPortrait = defineCapability<GroupSetPortraitRequest, void>('group.setportrait', 1)
export const groupGetList = defineCapability<GroupGetListRequest, GroupInfo[]>('group.getlist', 1)

export interface Group {
  readonly group_id: string
  readonly group_name?: string
  sendMsg(message: MessageInput): Promise<SentMessage>
  getInfo(): Promise<GroupInfo | null>
  getList(): Promise<GroupInfo[]>
  getMemberList(): Promise<MemberInfo[]>
  getMemberInfo(userId: string): Promise<MemberInfo | null>
  ban(userId: string, duration: number): Promise<void>
  kick(userId: string, rejectAddRequest?: boolean): Promise<void>
  setCard(userId: string, card: string): Promise<void>
  setAdmin(userId: string, enable: boolean): Promise<void>
  recall(messageId: string): Promise<void>
  leave(isDismiss?: boolean): Promise<void>
  setName(groupName: string): Promise<void>
  setPortrait(file: string): Promise<void>
}

export const createGroupRef = (bot: Bot, group_id: string, group_name?: string): Group => {
  const invoke = async <I, O>(capability: Capability<I, O>, input: I): Promise<O> => {
    if (!bot.supports(capability)) throw new Error(`Bot does not support ${capability.name}`)
    return await bot.invoke(capability, input)
  }
  return {
    group_id,
    group_name,
    sendMsg: (message) => invoke(messageSend, { target: { type: 'group', group_id }, message }),
    getInfo: async () => await invoke(groupGetInfo, { group_id }),
    getList: async () => await invoke(groupGetList, {}),
    getMemberList: async () => await invoke(groupGetMembers, { group_id }),
    getMemberInfo: async (userId) => await invoke(memberGetInfo, { group_id, user_id: userId }),
    ban: async (userId, duration) => {
      await invoke(memberBan, { group_id, user_id: userId, duration })
    },
    kick: async (userId, rejectAddRequest) => {
      await invoke(memberKick, { group_id, user_id: userId, reject_add_request: rejectAddRequest })
    },
    setCard: async (userId, card) => {
      await invoke(memberSetCard, { group_id, user_id: userId, card })
    },
    setAdmin: async (userId, enable) => {
      await invoke(memberSetAdmin, { group_id, user_id: userId, enable })
    },
    recall: async (messageId) => {
      await invoke(messageRecall, { message_id: messageId })
    },
    leave: async (isDismiss) => {
      await invoke(groupLeave, { group_id, is_dismiss: isDismiss })
    },
    setName: async (groupName) => {
      await invoke(groupSetName, { group_id, group_name: groupName })
    },
    setPortrait: async (file) => {
      await invoke(groupSetPortrait, { group_id, file })
    },
  }
}
