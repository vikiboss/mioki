import { wait } from './utils'

import type { Bot } from './adapter'
import type { Logger } from './logger'
import type { MessageInput } from './adapter'
import type { UserId } from './types'
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

export const noticeOwners = async (
  bots: readonly Bot[],
  owners: readonly UserId[],
  message: MessageInput,
  options: NoticeOptions = {},
): Promise<void> => {
  const delay = options.delay ?? 1000
  for (const owner of owners) {
    const bot = bots[0]
    if (!bot) return
    const target = options.target ?? ({ type: 'private', user_id: owner } as MessageTarget)
    try {
      await bot.sendMessage(target, message)
    } catch (err) {
      defaultLogger.warn(`通知主人 ${owner} 失败`, err)
    }
    await wait(delay)
  }
}

export const noticeAdmins = async (
  bots: readonly Bot[],
  admins: readonly UserId[],
  message: MessageInput,
  options: NoticeOptions = {},
): Promise<void> => {
  return noticeOwners(bots, admins, message, options)
}