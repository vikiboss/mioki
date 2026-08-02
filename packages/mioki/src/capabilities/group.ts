import { defineCapability } from '../adapter'
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

export const groupGetInfo = defineCapability<GroupGetInfoRequest, GroupInfo>('group.getinfo', 1)
export const groupGetMembers = defineCapability<GroupGetMembersRequest, MemberInfo[]>('group.getmembers', 1)
