import { defineCapability } from '../adapter'
import { messageSend } from './message'

import type { Bot, Capability, MessageInput, SentMessage } from '../adapter'

export interface FriendInfo {
  readonly user_id: string
  readonly nickname?: string
  readonly remark?: string
  readonly [key: string]: unknown
}

export interface FriendGetInfoRequest {
  readonly user_id: string
}

export interface FriendDeleteRequest {
  readonly user_id: string
}

export interface FriendGetListRequest {}

export const friendGetInfo = defineCapability<FriendGetInfoRequest, FriendInfo>('friend.getinfo', 1)
export const friendDelete = defineCapability<FriendDeleteRequest, void>('friend.delete', 1)
export const friendGetList = defineCapability<FriendGetListRequest, FriendInfo[]>('friend.getlist', 1)

export interface Friend {
  readonly user_id: string
  readonly nickname?: string
  sendMsg(message: MessageInput): Promise<SentMessage>
  getInfo(): Promise<FriendInfo | null>
  getList(): Promise<FriendInfo[]>
  delete(): Promise<void>
}

export const createFriendRef = (bot: Bot, user_id: string, nickname?: string): Friend => {
  const invoke = async <I, O>(capability: Capability<I, O>, input: I): Promise<O> => {
    if (!bot.supports(capability)) throw new Error(`Bot does not support ${capability.name}`)
    return await bot.invoke(capability, input)
  }
  return {
    user_id,
    nickname,
    sendMsg: (message) => invoke(messageSend, { target: { type: 'private', user_id }, message }),
    getInfo: async () => await invoke(friendGetInfo, { user_id }),
    getList: async () => await invoke(friendGetList, {}),
    delete: async () => {
      await invoke(friendDelete, { user_id })
    },
  }
}
