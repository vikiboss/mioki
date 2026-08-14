import { wait } from './utils'

import type { Bot } from './adapter'
import type { Logger } from './logger'
import type { MessageInput } from './adapter'
import type { MessageTarget } from './adapter'

export interface NoticeOptions {
  readonly delay?: number
  readonly target?: MessageTarget
}

const defaultLogger: Logger = {
  level: 'info',
  error: () => undefined,
  warn: () => undefined,
  log: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  withTag() {
    return this
  },
  child() {
    return this
  },
}

export const sendMessage = async (bot: Bot, target: MessageTarget, message: MessageInput): Promise<unknown> => {
  return await bot.sendMessage(target, message)
}

const notifyAll = async (
  bots: readonly Bot[],
  targets: readonly MessageTarget[],
  message: MessageInput,
  options: NoticeOptions = {},
): Promise<void> => {
  const delay = options.delay ?? 1000
  for (const target of targets) {
    let sent = false
    for (const bot of bots) {
      try {
        await bot.sendMessage(target, message)
        sent = true
        break
      } catch {
        // 跳过失败的 bot，尝试下一个
      }
    }
    if (!sent) {
      defaultLogger.warn(`通知目标 ${JSON.stringify(target)} 失败`)
    }
    await wait(delay)
  }
}

export const noticeGroups = async (
  bots: readonly Bot[],
  groupIds: readonly string[],
  message: MessageInput,
  options: NoticeOptions = {},
): Promise<void> => {
  await notifyAll(
    bots,
    groupIds.map((group_id) => ({ type: 'group', group_id })),
    message,
    options,
  )
}

export const noticeFriends = async (
  bots: readonly Bot[],
  userIds: readonly string[],
  message: MessageInput,
  options: NoticeOptions = {},
): Promise<void> => {
  await notifyAll(
    bots,
    userIds.map((user_id) => ({ type: 'private', user_id })),
    message,
    options,
  )
}

export const noticeOwners = async (
  bots: readonly Bot[],
  owners: readonly string[],
  message: MessageInput,
  options: NoticeOptions = {},
): Promise<void> => {
  await notifyAll(
    bots,
    owners.map((user_id) => options.target ?? ({ type: 'private', user_id } as MessageTarget)),
    message,
    options,
  )
}

export const noticeAdmins = async (
  bots: readonly Bot[],
  admins: readonly string[],
  message: MessageInput,
  options: NoticeOptions = {},
): Promise<void> => {
  return noticeOwners(bots, admins, message, options)
}