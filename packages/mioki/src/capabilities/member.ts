import { defineCapability } from '../adapter'
import type { GroupId, UserId } from '../types'

export interface MemberInfo {
  readonly user_id: UserId
  readonly nickname?: string
  readonly card?: string
  readonly role?: 'owner' | 'admin' | 'member' | (string & {})
  readonly join_time?: number
  readonly last_sent_time?: number
  readonly [key: string]: unknown
}

export interface MemberBanRequest {
  readonly group_id: GroupId
  readonly user_id: UserId
  /** 禁言时长（秒），0 = 解除禁言 */
  readonly duration: number
}

export interface MemberKickRequest {
  readonly group_id: GroupId
  readonly user_id: UserId
  /** 是否拒绝该成员后续的加群申请 */
  readonly reject_add_request?: boolean
}

export interface MemberSetCardRequest {
  readonly group_id: GroupId
  readonly user_id: UserId
  readonly card: string
}

export interface MemberSetAdminRequest {
  readonly group_id: GroupId
  readonly user_id: UserId
  readonly enable: boolean
}

export interface MemberGetInfoRequest {
  readonly group_id: GroupId
  readonly user_id: UserId
}

export const memberBan = defineCapability<MemberBanRequest, void>('member.ban', 1)
export const memberKick = defineCapability<MemberKickRequest, void>('member.kick', 1)
export const memberSetCard = defineCapability<MemberSetCardRequest, void>('member.setcard', 1)
export const memberSetAdmin = defineCapability<MemberSetAdminRequest, void>('member.setadmin', 1)
export const memberGetInfo = defineCapability<MemberGetInfoRequest, MemberInfo>('member.getinfo', 1)
