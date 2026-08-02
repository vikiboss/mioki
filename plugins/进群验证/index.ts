import { definePlugin, segment } from 'mioki'
import 'mioki-adapter-onebotv11'

import type { OneBot } from 'mioki-adapter-onebotv11'
import type { MessageEvent } from 'mioki'

interface TempUser {
  triedTimes: number
  verifyNumbers: [number, number, number]
  kickTimer: ReturnType<typeof setTimeout>
  remindTimer: ReturnType<typeof setTimeout> | null
}

const DEFAULT_CONFIG = {
  timeout: 3 * 60_000, // 验证超时时间，默认 3 分钟
  lastRemindTime: 60_000 as number | false, // 最后一次提醒时间，单位毫秒，设置为 false 则不提醒
  maxRetryTimes: 3, // 最大重试次数
  // 进群验证相关命令
  cmds: { on: '#开启验证', off: '#关闭验证', bypass: '#绕过验证', reverify: '#重新验证' },
  // 验证成功提示语，支持群号自定义
  tips: {
    fallback: '✅ 验证成功，欢迎入群，这个号是机器人，有问题请先查看群公告',
  } as Record<string, string>,
  // 开启进群验证的群号列表
  groups: [] as string[],
}

export default definePlugin({
  name: '进群验证',
  version: '1.0.2',
  priority: 10,
  description: '进群验证',
  setup: async (ctx) => {
    const tempUsers = new Map<string, TempUser>()
    const config = await ctx.createStore(DEFAULT_CONFIG, { __dirname })

    const getMemberRole = async (bot: OneBot, group_id: string, user_id: string) =>
      (await bot.getMemberInfo(group_id, user_id))?.role

    const isBotCanBanUser = async (bot: OneBot, group_id: string, user_id: string) => {
      const role = await getMemberRole(bot, group_id, bot.bot_id)
      if (role === 'member') return false
      if (role === 'owner') return true
      return (await getMemberRole(bot, group_id, user_id)) === 'member'
    }

    const getMentionedUserId = (event: MessageEvent): string | undefined => {
      const at = event.message.find((seg) => seg.type === 'at')
      const qq = at?.data?.qq ?? at?.data?.target
      return qq != null ? String(qq) : undefined
    }

    // 处理群消息中的验证相关命令
    ctx.handle('onebotv11:message.group', async (e) => {
      if (!e.group_id) return
      const text = ctx.text(e)
      const isMatchCmd = Object.values(config.data.cmds).includes(text)

      if (!isMatchCmd) return
      if (!ctx.hasRight(e)) return void e.reply('不支持小处男使用')

      const mentionedUser = getMentionedUserId(e)

      switch (text) {
        case config.data.cmds.on: {
          const role = await getMemberRole(e.bot, e.group_id, e.bot.bot_id)
          if (role === 'member') return void e.reply('权限不足，请给我群主/管理员')
          config.data.groups = ctx.unique([...config.data.groups, e.group_id])
          await config.write()
          return void e.reply('✅ 已开启进群验证')
        }

        case config.data.cmds.off: {
          const idx = config.data.groups.indexOf(e.group_id)
          if (idx === -1) return void e.reply('进群验证已经关闭')
          config.data.groups.splice(idx, 1)
          await config.write()
          return void e.reply('✅ 已关闭进群验证')
        }
      }

      if (!mentionedUser) return void e.reply('请 @ 需要操作的用户')

      if (!config.data.groups.includes(e.group_id))
        return void e.reply(`请先发送「${config.data.cmds.on}」开启本群「进群验证」功能`)

      switch (text) {
        case config.data.cmds.bypass: {
          clearUser(e.group_id, mentionedUser)
          return void e.reply(`✅ 已绕过验证，欢迎入群`)
        }

        case config.data.cmds.reverify: {
          if (e.bot.bot_id === mentionedUser) return void e.reply('八嘎！！！')
          if (ctx.hasRight(mentionedUser)) return void e.reply('不能对我的主人这么无礼')

          if (!(await isBotCanBanUser(e.bot, e.group_id, mentionedUser))) {
            return void e.reply('权限不足，请给我群主或者确保目标用户不是管理员/群主')
          }

          return void startVerifyUser(e.bot, e.group_id, mentionedUser)
        }
      }
    })

    // 处理用户进群事件
    ctx.handle('onebotv11:notice.group.increase', async (e) => {
      if (!e.group_id || !e.user_id) return
      if (!config.data.groups.includes(e.group_id)) return
      if (ctx.hasRight(e)) return

      startVerifyUser(e.bot, e.group_id, e.user_id)
    })

    // 处理用户退群事件
    ctx.handle('onebotv11:notice.group.decrease', async (e) => {
      if (!e.group_id || !e.user_id) return
      if (!config.data.groups.includes(e.group_id)) return

      if (tempUsers.has(genVerifyKey(e.group_id, e.user_id))) {
        clearUser(e.group_id, e.user_id)
        await e.bot.sendMessage({ type: 'group', group_id: e.group_id }, `${e.user_id} 溜掉了，验证流程结束了`)
      }
    })

    // 处理群消息中的答案消息
    ctx.handle('onebotv11:message.group.normal', async (e) => {
      const { group_id, user_id, bot } = e
      if (!group_id || !user_id) return
      const { tips, groups, maxRetryTimes } = config.data

      if (!groups.includes(group_id) || ctx.hasRight(e)) return

      const user = tempUsers.get(genVerifyKey(group_id, user_id))
      if (!user) return

      const [, , result] = user.verifyNumbers
      const text = ctx.text(e)

      if (+text === result) {
        await bot.sendMessage({ type: 'group', group_id }, tips[group_id] || tips.fallback)
        clearUser(group_id, user_id)
      } else {
        user.triedTimes += 1
        if (user.triedTimes >= maxRetryTimes) {
          clearUser(group_id, user_id)
          await e.reply([segment.at(user_id), ` ❌ 验证失败，次数达上限了，请重新申请`])
          await bot.kickMember(group_id, user_id)
        } else {
          await bot.sendMessage(
            { type: 'group', group_id },
            [segment.at(user_id), ` ❌ 回答错误，还剩 ${maxRetryTimes - user.triedTimes} 次机会`],
          )
        }
      }
    })

    // 开始验证用户
    function startVerifyUser(bot: OneBot, group_id: string, user_id: string) {
      const user = tempUsers.get(genVerifyKey(group_id, user_id))
      if (user) clearUser(group_id, user_id)

      const { lastRemindTime, timeout } = config.data
      const [x, y] = [ctx.randomInt(10, 99), ctx.randomInt(10, 99)]
      const [m, n] = [Math.max(x, y), Math.min(x, y)]
      const operator = ctx.randomItem(['+', '-'])
      const verifyCode = operator === '+' ? m + n : m - n
      const mathFormula = `${m}${operator}${n}`

      const kickTimer = setTimeout(async () => {
        clearUser(group_id, user_id)
        await bot.sendMessage({ type: 'group', group_id }, [segment.at(user_id), `❌ 验证超时，请重新申请`])
        await bot.kickMember(group_id, user_id)
      }, timeout)

      const remindTimer =
        lastRemindTime && lastRemindTime > 0
          ? setTimeout(() => {
              void bot.sendMessage(
                { type: 'group', group_id },
                [
                  segment.at(user_id),
                  ` 进群验证还剩 ${lastRemindTime / 1000} 秒，请发送「${mathFormula}」的运算结果，不听话会被移出群聊`,
                ],
              )
            }, timeout - lastRemindTime)
          : null

      tempUsers.set(genVerifyKey(group_id, user_id), {
        triedTimes: 0,
        verifyNumbers: [m, n, verifyCode],
        kickTimer,
        remindTimer,
      })

      const seconds = Math.round(timeout / 1000)

      void bot.sendMessage(
        { type: 'group', group_id },
        [segment.at(user_id), ` 请在「${seconds}」秒内发送「${mathFormula}」的运算结果，不听话会被移出群聊`],
      )
    }

    // 清理用户验证状态
    function clearUser(group_id: string, user_id: string) {
      const mapKey = genVerifyKey(group_id, user_id)
      const user = tempUsers.get(mapKey)

      if (user) {
        user.kickTimer && clearTimeout(user.kickTimer)
        user.remindTimer && clearTimeout(user.remindTimer)
        tempUsers.delete(mapKey)
      }
    }

    // 生成用户验证的唯一 key
    function genVerifyKey(group_id: string, user_id: string) {
      return `${group_id}_${user_id}`
    }

    // 插件卸载时清理所有待验证用户
    return () => {
      for (const key of tempUsers.keys()) {
        const [group_id, user_id] = key.split('_')
        clearUser(group_id, user_id)
      }
    }
  },
})
