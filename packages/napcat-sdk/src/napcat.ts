import crypto from 'node:crypto'
import mitt from 'mitt'
import pkg from '../package.json' with { type: 'json' }
import { segment } from './segment'
import { CONSOLE_LOGGER } from './logger'

import type { Emitter } from 'mitt'
import type { Logger } from './logger'
import type {
  API,
  EventMap,
  Friend,
  FriendWithInfo,
  Group,
  GroupMemberInfo,
  GroupMessageEvent,
  GroupWithInfo,
  NapcatOptions,
  NormalizedElementToSend,
  OptionalProps,
  PrivateMessageEvent,
  RecvElement,
  Sendable,
  Stat,
} from './types'

export const name: string = pkg.name
export const version: string = pkg.version

const DEFAULT_NAPCAT_OPTIONS: Required<OptionalProps<NapcatOptions>> = {
  protocol: 'ws',
  host: 'localhost',
  port: 3333,
  logger: CONSOLE_LOGGER,
}

export class NapCat {
  /** WebSocket 实例 */
  #ws: WebSocket | null = null
  /** 事件发射器 */
  #event: Emitter<EventMap & Record<string | symbol, unknown>> = mitt()
  /** Echo 事件发射器 */
  #echoEvent: Emitter<Record<string, unknown>> = mitt()
  /** 机器人 ID */
  #uin: number = 0
  /** 机器人昵称  */
  #nickname: string = ''
  /** 机器人状态 */
  #online: boolean = false
  /** nickname 缓存 */
  #nicknameCache = new Map<number, string>()
  /** 消息数据 */
  #stat: Stat = {
    start_time: Date.now(),
    recv: { group: 0, private: 0 },
    send: { group: 0, private: 0 },
  }
  /** Cookies 缓存 */
  #cookieCache = new Map<
    string,
    {
      uin: number
      pskey: string
      skey: string
      gtk: string
      bkn: string
      cookie: string
      legacyCookie: string
    }
  >()

  constructor(private readonly options: NapcatOptions) {}

  /** 统计数据 */
  get stat(): Stat {
    return this.#stat
  }

  /** 配置项 */
  get #config(): Required<NapcatOptions> {
    return {
      protocol: this.options.protocol || DEFAULT_NAPCAT_OPTIONS.protocol,
      host: this.options.host || DEFAULT_NAPCAT_OPTIONS.host,
      port: this.options.port || DEFAULT_NAPCAT_OPTIONS.port,
      logger: this.options.logger || DEFAULT_NAPCAT_OPTIONS.logger,
      token: this.options.token,
    }
  }

  /** WebSocket 实例 */
  get ws(): WebSocket {
    if (!this.#ws) {
      this.logger.error('WebSocket 未连接。')
      throw new Error('WebSocket 未连接。')
    }

    return this.#ws
  }

  /** 日志记录器 */
  get logger(): Logger {
    return this.#config.logger
  }

  /** 消息段构建器 */
  get segment(): typeof segment {
    return segment
  }

  /**
   * 机器人 QQ 号
   *
   * @deprecated 建议使用 `uin` 属性
   */
  get user_id(): number {
    return this.uin
  }

  /**
   * 机器人 QQ 号
   */
  get uin(): number {
    return this.#uin
  }

  /**
   * 机器人昵称
   */
  get nickname(): string {
    return this.#nickname
  }

  /** 生成唯一的 echo ID */
  #echoId() {
    return crypto.randomBytes(16).toString('hex')
  }

  /** 构建 WebSocket 连接地址 */
  #buildWsUrl(): string {
    const { protocol, host, port, token } = this.#config
    return `${protocol}://${host}:${port}?access_token=${token}`
  }

  /** 包装回复消息 */
  #wrapReply(sendable: Sendable | Sendable[], message_id?: number, reply?: boolean): Sendable[] {
    const sendableList = typeof sendable === 'string' ? [sendable] : [sendable].flat()

    if (reply && message_id) {
      return [segment.reply(String(message_id)), ...sendableList]
    }

    return sendableList
  }

  /** 确保 WebSocket 已连接 */
  #ensureWsConnection(ws: WebSocket | null): asserts ws is WebSocket {
    if (!ws) {
      this.logger.error('WebSocket 未连接。')
      throw new Error('WebSocket 未连接。')
    }

    if (ws.readyState !== WebSocket.OPEN) {
      this.logger.error('WebSocket 未打开。')
      throw new Error('WebSocket 未打开。')
    }
  }

  /** 标准化可发送消息元素 */
  normalizeSendable(msg: Sendable | Sendable[]): NormalizedElementToSend[] {
    return [msg].flat(2).map((item) => {
      if (typeof item === 'string') {
        return { type: 'text', data: { text: item } }
      }
      if (item.type === 'at') {
        return { type: 'at', data: { qq: String(item.qq) } }
      }
      const { type, ...data } = item
      return { type, data } as NormalizedElementToSend
    })
  }

  /** 等待服务器响应操作 */
  #waitForAction<T extends any>(echoId: string) {
    const eventName = `echo#${echoId}`

    return new Promise<T>((resolve, reject) => {
      const handle = (data: any) => {
        if (!data || data.echo !== echoId) return

        this.#echoEvent.off(eventName, handle)

        if (data.retcode === 0) {
          resolve(data.data as T)
        } else {
          reject(`API 错误：${data.message}`)
        }
      }

      this.#echoEvent.on(eventName, handle)
    })
  }

  /** 构建群对象 */
  #buildGroup<T extends object>(group_id: number, group_name: string = '', extraInfo: T = {} as T): Group & T {
    return {
      ...extraInfo,
      group_id,
      group_name,
      napcat: this,
      sign: this.setGroupSign.bind(this, group_id),
      setTitle: this.setGroupSpecialTitle.bind(this, group_id),
      setCard: this.setGroupCard.bind(this, group_id),
      setEssence: this.setEssenceMsg.bind(this),
      delEssence: this.deleteEssenceMsg.bind(this),
      getInfo: this.getGroupInfo.bind(this, group_id),
      getMemberList: this.getGroupMemberList.bind(this, group_id),
      getMemberInfo: this.getGroupMemberInfo.bind(this, group_id),
      recall: this.recallMsg.bind(this),
      ban: this.setGroupBan.bind(this, group_id),
      sendMsg: this.sendGroupMsg.bind(this, group_id),
    }
  }

  /** 构建好友对象 */
  #buildFriend<T extends object>(user_id: number, nickname: string = '', extraInfo: T = {} as T): Friend & T {
    const name = nickname || this.#nicknameCache.get(user_id) || ''
    this.#nicknameCache.set(user_id, name)

    return {
      ...extraInfo,
      user_id,
      nickname: name,
      napcat: this,
      delete: this.deleteFriend.bind(this, user_id),
      sendMsg: this.sendPrivateMsg.bind(this, user_id),
      getInfo: this.getStrangerInfo.bind(this, user_id),
    }
  }

  #transformOneBotMessage(message: any[]): RecvElement[] {
    return (message || []).filter((e) => e.type !== 'reply').map((el: any) => ({ type: el.type, ...el.data }))
  }

  /** 构建私聊消息事件 */
  #buildPrivateMessageEvent(event: Omit<PrivateMessageEvent, 'message'> & { message: any[] }): PrivateMessageEvent {
    const quote_id: string | null = event.message.find((el: any) => el.type === 'reply')?.data?.id || null

    if (event.sender.nickname) {
      this.#nicknameCache.set(event.sender.user_id, event.sender.nickname)
    }

    const target = event.target_id
      ? { user_id: event.target_id, nickname: this.#nicknameCache.get(event.target_id) || '' }
      : { user_id: event.sender.user_id, nickname: event.sender.nickname }

    return {
      ...event,
      quote_id,
      getQuoteMessage: () => this.getMsg(quote_id) as Promise<PrivateMessageEvent | null>,
      message: this.#transformOneBotMessage(event.message),
      friend: this.#buildFriend(target.user_id, target.nickname),
      reply: (sendable: Sendable | Sendable[], reply = false) =>
        this.sendPrivateMsg(target.user_id, this.#wrapReply(sendable, event.message_id, reply)),
    }
  }

  /** 构建群消息事件对象 */
  #buildGroupMessageEvent(event: Omit<GroupMessageEvent, 'message'> & { message: any[] }): GroupMessageEvent {
    const quote_id: string | null = event.message.find((el: any) => el.type === 'reply')?.data?.id || null

    if (event.sender.nickname) {
      this.#nicknameCache.set(event.sender.user_id, event.sender.nickname)
    }

    return {
      ...event,
      quote_id,
      getQuoteMessage: () => this.getMsg(quote_id) as Promise<GroupMessageEvent | null>,
      getSenderMemberInfo: this.getGroupMemberInfo.bind(this, event.group_id, event.sender.user_id),
      message: this.#transformOneBotMessage(event.message),
      group: this.#buildGroup(event.group_id, event.group_name || ''),
      recall: this.recallMsg.bind(this, event.message_id),
      addReaction: this.addReaction.bind(this, event.message_id),
      delReaction: this.delReaction.bind(this, event.message_id),
      setEssence: this.setEssenceMsg.bind(this, event.message_id),
      delEssence: this.deleteEssenceMsg.bind(this, event.message_id),
      reply: (sendable: Sendable | Sendable[], reply = false) =>
        this.sendGroupMsg(event.group_id, this.#wrapReply(sendable, event.message_id, reply)),
    }
  }

  /** 绑定内部事件处理器 */
  async #bindInternalEvents(data: any) {
    if (data.echo) {
      this.#echoEvent.emit(`echo#${data.echo}`, data)
      return
    }

    if (data.post_type) {
      switch (data.post_type) {
        case 'meta_event': {
          this.logger.trace(`收到 meta_event：${JSON.stringify(data)}`)

          this.#event.emit('meta_event', data)

          if (data.meta_event_type) {
            this.#event.emit(`meta_event.${data.meta_event_type}`, data)

            this.logger.trace('收到 meta_event_type：', data.meta_event_type)

            if (data.sub_type) {
              if (data.sub_type === 'connect') {
                const { app_name, app_version, protocol_version } = await this.getVersionInfo()
                const { nickname, user_id } = await this.getLoginInfo()

                this.#online = true
                this.#uin = user_id
                this.#nickname = nickname

                this.#event.emit('napcat.connected', {
                  user_id: this.#uin,
                  nickname: this.#nickname,
                  app_name,
                  app_version,
                  protocol_version,
                  timestamp: data.time * 1000,
                })
              }

              this.#event.emit(`meta_event.${data.meta_event_type}.${data.sub_type}`, data)
            }
          }

          break
        }

        case 'message': {
          if (data.message_type === 'private') {
            this.#stat.recv.private++
            data = this.#buildPrivateMessageEvent(data)
          } else {
            this.#stat.recv.group++
            data = this.#buildGroupMessageEvent(data)
          }

          this.#event.emit('message', data)

          const msg = this.stringifyMessage(data.message)

          const group = data.group ? `${data.group_name}(${data.group_id})` : ''
          const sender = `${data.sender.nickname}(${data.sender.user_id})`

          switch (data.message_type) {
            case 'private': {
              this.#event.emit('message.private', data)
              this.#event.emit(`message.private.${data.sub_type}`, data)
              this.logger.trace(`收到私聊消息：${JSON.stringify(data)}`)
              this.logger.info(`[私:${sender}] ${msg}`)
              break
            }

            case 'group': {
              this.#event.emit('message.group', data)
              this.#event.emit(`message.group.${data.sub_type}`, data)
              this.logger.trace(`收到群消息：${JSON.stringify(data)}`)
              this.logger.info(`[群:${group}] ${sender}: ${msg}`)
              break
            }

            default: {
              this.logger.debug(`收到未知消息类型：${JSON.stringify(data)}`)

              break
            }
          }

          break
        }

        case 'message_sent': {
          if (data.message_type === 'private') {
            this.#stat.send.private++
            data = this.#buildPrivateMessageEvent(data)
          } else {
            this.#stat.send.group++
            data = this.#buildGroupMessageEvent(data)
          }

          this.#event.emit('message_sent', data)
          this.logger.trace(`收到 message_sent：${JSON.stringify(data)}`)

          if (data.message_type) {
            this.#event.emit(`message_sent.${data.message_type}`, data)

            if (data.sub_type) {
              this.#event.emit(`message_sent.${data.message_type}.${data.sub_type}`, data)
            }

            const msg = this.stringifyMessage(data.message)

            if (data.message_type === 'group' && data.group_id) {
              this.logger.info(`[>>>:群:${data.group_name}(${data.group_id})] ${msg}`)
            } else {
              this.logger.info(`[>>>:私:${data.friend.nickname}(${data.friend.user_id})] ${msg}`)
            }
          }

          break
        }

        case 'notice': {
          this.logger.trace(`收到通知：${JSON.stringify(data)}`)

          if (!data.notice_type) {
            this.logger.debug(`收到未知通知类型：${JSON.stringify(data)}`)
            break
          }

          const isNotify = data.notice_type === 'notify'
          const isPoke = data.sub_type === 'poke'
          const isGroup = !!data.group_id

          const { notice_type, sub_type } = isNotify
            ? isPoke
              ? { notice_type: isGroup ? 'group' : 'friend', sub_type: 'poke' }
              : NAPCAT_NOTICE_NOTIFY_MAP[data.sub_type] || {}
            : NAPCAT_NOTICE_EVENT_MAP[data.notice_type] || {}

          data.original_notice_type = data.notice_type
          data.notice_type = notice_type || data.notice_type

          if (data.sub_type && data.sub_type !== sub_type) {
            data.action_type = data.sub_type
          }

          data.sub_type = sub_type || data.sub_type

          if (isGroup) {
            data.group = this.#buildGroup(data.group_id, data.group_name || '')
          } else {
            data.friend = this.#buildFriend(data.user_id, data.nickname || '')
          }

          this.#event.emit('notice', data)

          if (notice_type) {
            this.#event.emit(`notice.${notice_type}`, data)
            if (sub_type) {
              this.#event.emit(`notice.${notice_type}.${sub_type}`, data)
            }
          }

          break
        }

        case 'request': {
          this.logger.trace(`收到请求：${JSON.stringify(data)}`)

          if (data.request_type === 'friend') {
            data.reject = (reason?: string) =>
              this.api('set_friend_add_request', { flag: data.flag, approve: false, reason })
            data.approve = () => this.api('set_friend_add_request', { flag: data.flag, approve: true })
          }

          if (data.request_type === 'group') {
            data.reject = (reason?: string) =>
              this.api('set_group_add_request', { flag: data.flag, approve: false, reason })
            data.approve = () => this.api('set_group_add_request', { flag: data.flag, approve: true })
          }

          this.#event.emit('request', data)

          if (data.request_type) {
            this.#event.emit(`request.${data.request_type}`, data)
            if (data.sub_type) {
              this.#event.emit(`request.${data.request_type}.${data.sub_type}`, data)
            }
          }

          break
        }

        default: {
          this.logger.debug(`收到：${JSON.stringify(data)}`)
          this.#event.emit(data.post_type, data)
          return
        }
      }

      return
    }
  }

  stringifyMessage(message: RecvElement[]): string {
    return message
      .map((el) => {
        switch (el.type) {
          case 'text':
            return el.text
          case 'at':
            return `{at:${el.qq}}`
          case 'face':
            return `{face:${el.id}}`
          case 'image':
            return `{image:${el.file},${el.url}}`
          case 'json':
            return `{json:${el.data}}`
          case 'rps':
          case 'dice':
            return `{dice:${el.result}}`
          case 'file':
          case 'video':
          case 'record':
            return `{${el.type}:${el.url}}`
          default:
            return `{${el.type}}`
        }
      })
      .join('')
  }

  /** 获取一个群的信息，可以用于发送群消息等操作 */
  async pickGroup(group_id: number): Promise<GroupWithInfo | null> {
    try {
      const groupInfo = await this.api<ReturnType<Group['getInfo']>>('get_group_info', { group_id })
      return this.#buildGroup(group_id, groupInfo.group_name, groupInfo)
    } catch (err: any) {
      this.logger.warn(`获取群 ${group_id} 信息失败：${err?.message || err}`)
      return null
    }
  }

  /** 获取一个好友的信息，可以用于发送私聊消息等操作 */
  async pickFriend(user_id: number): Promise<FriendWithInfo | null> {
    try {
      const friendInfo = await this.api<ReturnType<Friend['getInfo']>>('get_stranger_info', { user_id })
      return this.#buildFriend(user_id, friendInfo.nickname, friendInfo)
    } catch (err: any) {
      this.logger.warn(`获取好友 ${user_id} 信息失败：${err?.message || err}`)
      // return this.#buildFriend(user_id, '', {}) as FriendWithInfo
      return null
    }
  }

  /**
   * 注册一次性事件监听器
   */
  once<T extends keyof EventMap>(type: T, handler: (event: EventMap[NoInfer<T>]) => void): void {
    const onceHandler = (event: EventMap[NoInfer<T>]) => {
      handler(event)
      this.#event.off(type, onceHandler)
    }

    this.logger.debug(`注册一次性监听器：${String(type)}`)
    this.#event.on(type, onceHandler)
  }

  /**
   * 注册事件监听器，支持主类型或者点分子类型
   *
   * 如： `notice`、`message.private`、`request.group.invite` 等
   *
   * 如果需要移除监听器，请调用 `off` 方法
   */
  on<T extends keyof EventMap>(type: T, handler: (event: EventMap[NoInfer<T>]) => void): void {
    this.logger.debug(`注册监听器：${String(type)}`)
    this.#event.on(type, handler)
  }

  /**
   * 移除事件监听器
   */
  off<T extends keyof EventMap>(type: T, handler: (event: EventMap[NoInfer<T>]) => void): void {
    this.logger.debug(`移除监听器：${String(type)}`)
    this.#event.off(type, handler)
  }

  /**
   * 调用 NapCat API
   */
  api<T extends any>(action: API | (string & {}), params: Record<string, any> = {}): Promise<T> {
    this.#ensureWsConnection(this.#ws)
    this.logger.debug(`调用 API：${action}，参数：${JSON.stringify(params)}`)
    const echo = this.#echoId()
    this.#ws.send(JSON.stringify({ echo, action, params }))
    return this.#waitForAction<T>(echo)
  }

  /**
   * 给好友名片点赞
   */
  async sendLike(user_id: number, times: number = 1): Promise<any> {
    try {
      await this.api<void>('send_like', { user_id, times })
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取好友列表
   */
  async getFriendList(): Promise<(Friend & Record<string, any>)[]> {
    const friends = await this.api<Friend[]>('get_friend_list')
    return friends.map((f) => this.#buildFriend(f.user_id, f.nickname, f))
  }

  /**
   * 获取群列表
   */
  async getGroupList(): Promise<(Group & Record<string, any>)[]> {
    const groups = await this.api<Group[]>('get_group_list')
    return groups.map((g) => this.#buildGroup(g.group_id, g.group_name, g))
  }

  /**
   * 添加消息回应
   */
  addReaction(message_id: number, id: string): Promise<void> {
    return this.api<void>('set_msg_emoji_like', { message_id, emoji_id: id, set: true })
  }

  /**
   * 删除消息回应
   */
  delReaction(message_id: number, id: string): Promise<void> {
    return this.api<void>('set_msg_emoji_like', { message_id, emoji_id: id, set: false })
  }

  /**
   * 获取消息
   */
  async getMsg(message_id?: number | string | null): Promise<GroupMessageEvent | PrivateMessageEvent | null> {
    if (!message_id) {
      return null
    }

    const msg = await this.api<any>('get_msg', { message_id })

    if (msg.message_type === 'private') {
      return this.#buildPrivateMessageEvent(msg)
    } else {
      return this.#buildGroupMessageEvent(msg)
    }
  }

  /**
   * 删除好友
   */
  deleteFriend(user_id: number, block: boolean = false, both: boolean = false): Promise<void> {
    return this.api<void>('delete_friend', {
      user_id,
      temp_block: block,
      temp_both_del: both,
    })
  }

  /**
   * 设置群成员禁言
   */
  setGroupBan(group_id: number, user_id: number, duration: number): Promise<void> {
    return this.api<void>('set_group_ban', { group_id, user_id, duration })
  }

  /**
   * 撤回消息
   */
  recallMsg(message_id: number): Promise<void> {
    return this.api<void>('delete_msg', { message_id })
  }

  /**
   * 获取陌生人信息
   */
  getStrangerInfo(user_id: number): Promise<any> {
    return this.api<any>('get_stranger_info', { user_id })
  }

  /**
   * 发送私聊消息
   */
  sendPrivateMsg(user_id: number, sendable: Sendable | Sendable[]): Promise<{ message_id: number }> {
    return this.api<{ message_id: number }>('send_private_msg', {
      user_id,
      message: this.normalizeSendable(sendable),
    })
  }

  /**
   * 发送群消息
   */
  sendGroupMsg(group_id: number, sendable: Sendable | Sendable[]): Promise<{ message_id: number }> {
    return this.api<{ message_id: number }>('send_group_msg', {
      group_id,
      message: this.normalizeSendable(sendable),
    })
  }

  /**
   * 获取群信息
   */
  getGroupInfo(group_id: number): Promise<any> {
    return this.api<any>('get_group_info', { group_id })
  }

  /**
   * 群签到
   */
  setGroupSign(group_id: number): Promise<any> {
    return this.api<void>('set_group_sign', { group_id })
  }

  /**
   * 设置群精华消息
   */
  setEssenceMsg(message_id: number): Promise<void> {
    return this.api<void>('set_essence_msg', { message_id })
  }

  /**
   * 删除群精华消息
   */
  deleteEssenceMsg(message_id: number): Promise<void> {
    return this.api<void>('delete_essence_msg', { message_id })
  }

  /**
   * 设置群成员名片
   */
  setGroupCard(group_id: number, user_id: number, card: string): Promise<void> {
    return this.api<void>('set_group_card', { group_id, user_id, card })
  }

  /**
   * 设置群成员专属头衔
   */
  setGroupSpecialTitle(group_id: number, user_id: number, title: string): Promise<void> {
    return this.api<void>('set_group_special_title', { group_id, user_id, title })
  }

  /**
   * 获取群成员列表
   */
  getGroupMemberList(group_id: number): Promise<GroupMemberInfo[]> {
    return this.api<GroupMemberInfo[]>('get_group_member_list', { group_id })
  }

  /**
   * 获取群成员信息
   */
  getGroupMemberInfo(group_id: number, user_id: number): Promise<GroupMemberInfo> {
    return this.api<GroupMemberInfo>('get_group_member_info', { group_id, user_id })
  }

  /**
   * 机器人是否在线
   */
  isOnline(): boolean {
    return this.#ws?.readyState === WebSocket.OPEN && this.#online
  }

  /**
   * 计算 GTK 值
   */
  getGTk(pskey: string): number {
    let gkt = 5381
    for (let i = 0, len = pskey.length; i < len; ++i) {
      gkt += (gkt << 5) + pskey.charCodeAt(i)
    }
    return gkt & 0x7fffffff
  }

  /**
   * 获取 NapCat 原始 Cookie 相关信息
   */
  getNapCatCookies(domain: string): Promise<{ cookies: string; bkn: string }> {
    return this.api<{ cookies: string; bkn: string }>('get_cookies', { domain })
  }

  /**
   * 获取版本信息
   */
  getVersionInfo(): Promise<{ app_name: string; protocol_version: string; app_version: string }> {
    return this.api<{ app_name: string; protocol_version: string; app_version: string }>('get_version_info')
  }

  /**
   * 获取登录信息
   */
  getLoginInfo(): Promise<{ user_id: number; nickname: string }> {
    return this.api<{ user_id: number; nickname: string }>('get_login_info')
  }

  /**
   * 获取 Cookie 相关信息
   */
  async getCookie(domain: string): Promise<{
    uin: number
    pskey: string
    skey: string
    gtk: string
    bkn: string
    cookie: string
    legacyCookie: string
  }> {
    const cache = this.#cookieCache.get(domain)

    if (cache) return cache

    const { cookies: cookieString, bkn } = await this.getNapCatCookies(domain)

    const skey = cookieString.match(/skey=([^;]*)/)?.[1] || ''
    const pskey = cookieString.match(/pskey=([^;]*)/)?.[1] || ''
    const gtk = this.getGTk(pskey)

    const returns = {
      pskey,
      skey,
      uin: this.uin,
      gtk: String(gtk),
      bkn,
      cookie: `uin=${this.uin}; skey=${skey}; p_uin=${this.uin}; p_skey=${pskey};`,
      legacyCookie: `uin=o${this.uin}; skey=${skey}; p_uin=o${this.uin}; p_skey=${pskey};`,
    }

    this.#cookieCache.set(domain, returns)

    // 1 小时后清除 Cookie 缓存
    setTimeout(
      () => {
        this.#cookieCache.delete(domain)
      },
      1000 * 60 * 60,
    )

    return returns
  }

  /**
   * 通过域名获取 Pskey
   */
  async getPskey(domain: string): Promise<string> {
    const { pskey } = await this.getCookie(domain)
    return pskey
  }

  /**
   * 获取 Bkn 值
   */
  async getBkn(): Promise<string> {
    const { bkn } = await this.getCookie('vip.qq.com')
    return bkn
  }

  /** 启动 NapCat SDK 实例，建立 WebSocket 连接 */
  async run(): Promise<void> {
    const { logger: _, token: __, ...config } = this.#config

    this.logger.debug(`启动配置：${JSON.stringify(config)}`)

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.#buildWsUrl())

      ws.onmessage = (event) => {
        const data = (() => {
          try {
            return JSON.parse(event.data)
          } catch {
            return null
          }
        })() as any

        if (!data) {
          this.logger.debug(`收到非 JSON 消息：${event.data}`)
          return
        }

        this.#event.emit('ws.message', data)
        this.#bindInternalEvents(data)
      }

      ws.onclose = () => {
        this.#online = false
        this.logger.debug('WebSocket 已断开连接')
        this.#event.emit('ws.close')
      }

      ws.onerror = (error) => {
        this.#online = false
        this.logger.debug(`WebSocket 发生错误：${error}`)
        this.#event.emit('ws.error', error)
        reject(error)
      }

      ws.onopen = () => {
        this.logger.debug('WebSocket 已连接')
        this.#event.emit('ws.open')
        resolve()
      }

      this.#ws = ws

      this.logger.info(`WebSocket 实例已创建`)
    })
  }

  /** 销毁 NapCat SDK 实例，关闭 WebSocket 连接 */
  close(): void {
    if (this.#ws) {
      this.logger.info('正在销毁 NapCat SDK 实例...')
      this.#ws.close()
      this.#ws = null
      this.logger.info('NapCat SDK 实例已销毁。')
    } else {
      this.logger.warn('NapCat SDK 实例未初始化。')
    }
  }
}

// ==================== 通知事件映射 ====================

/**
 * NapCat 通知类型映射表（notify 类型）
 * @description 将 NapCat 特有的通知类型映射到标准的 notice_type 和 sub_type
 */
const NAPCAT_NOTICE_NOTIFY_MAP: Record<string, { notice_type: string; sub_type: string }> = {
  input_status: {
    notice_type: 'friend',
    sub_type: 'input',
  },
  profile_like: {
    notice_type: 'friend',
    sub_type: 'like',
  },
  title: {
    notice_type: 'group',
    sub_type: 'title',
  },
}

/**
 * NapCat 通知事件映射表（notice 类型）
 * @description 将 NapCat 的原始通知事件类型映射到标准的 notice_type 和 sub_type
 */
const NAPCAT_NOTICE_EVENT_MAP: Record<string, { notice_type: string; sub_type: string }> = {
  friend_add: {
    notice_type: 'friend',
    sub_type: 'increase',
  },
  friend_recall: {
    notice_type: 'friend',
    sub_type: 'recall',
  },
  offline_file: {
    notice_type: 'friend',
    sub_type: 'offline_file',
  },
  client_status: {
    notice_type: 'client',
    sub_type: 'status',
  },
  group_admin: {
    notice_type: 'group',
    sub_type: 'admin',
  },
  group_ban: {
    notice_type: 'group',
    sub_type: 'ban',
  },
  group_card: {
    notice_type: 'group',
    sub_type: 'card',
  },
  group_upload: {
    notice_type: 'group',
    sub_type: 'upload',
  },
  group_decrease: {
    notice_type: 'group',
    sub_type: 'decrease',
  },
  group_increase: {
    notice_type: 'group',
    sub_type: 'increase',
  },
  group_msg_emoji_like: {
    notice_type: 'group',
    sub_type: 'reaction',
  },
  essence: {
    notice_type: 'group',
    sub_type: 'essence',
  },
  group_recall: {
    notice_type: 'group',
    sub_type: 'recall',
  },
}
