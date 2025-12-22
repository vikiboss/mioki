import type { Logger } from './logger'
import type { NapCat } from './napcat'

export interface Stat {
  /** 启动时间，Unix 时间戳（毫秒） */
  start_time: number
  /** 已接受消息数 */
  recv: { group: number; private: number }
  /** 已发送消息数 */
  send: { group: number; private: number }
}

export interface NapcatOptions {
  /** NapCat 访问令牌 */
  token?: string
  /** NapCat 服务器协议，默认为 ws */
  protocol?: 'ws' | 'wss'
  /** NapCat 服务器主机，默认为 localhost */
  host?: string
  /** NapCat 服务器端口，默认为 3001 */
  port?: number
  /** 日志记录器，默认为控制台日志记录器 */
  logger?: Logger
}

export type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never
}[keyof T]

export type OptionalProps<T> = Pick<T, OptionalKeys<T>>

export type ExtractByType<T, K> = T extends { type: K } ? T : never

export interface EventMap extends OneBotEventMap {
  /** WebSocket 连接已打开 */
  'ws.open': void
  /** WebSocket 连接已关闭 */
  'ws.close': void
  /** WebSocket 连接发生错误 */
  'ws.error': Event
  /** 收到 WebSocket 消息 */
  'ws.message': any

  /** NapCat 连接已建立 */
  'napcat.connected': {
    user_id: number
    nickname: string
    app_name: string
    app_version: string
    protocol_version: string
    timestamp: number
  }
}

/**
 * 媒体消息的通用属性
 */
export interface MediaProps {
  /** 媒体文件的 URL 地址 */
  url: string
  /** 媒体文件的本地路径 */
  path: string
  /** 媒体文件名或特殊标识 */
  file: (string & {}) | 'marketface'
  /** 媒体文件 ID */
  file_id: string
  /** 媒体文件大小（字节） */
  file_size: string
  /** 媒体文件唯一标识 */
  file_unique: string
}

// ==================== 接收消息段类型 ====================

/** 接收的纯文本消息段 */
export interface RecvTextElement {
  type: 'text'
  /** 文本内容 */
  text: string
}

/** 接收的 @ 消息段 */
export interface RecvAtElement {
  type: 'at'
  /** 被 @ 的 QQ 号，'all' 表示 @全体成员 */
  qq: 'all' | (string & {})
}

/** 接收的回复消息段 */
export interface RecvReplyElement {
  type: 'reply'
  /** 被回复的消息 ID */
  id: string
}

/** 接收的 QQ 表情消息段 */
export interface RecvFaceElement {
  type: 'face'
  /** QQ 表情 ID */
  id: number
}

/** 接收的图片消息段 */
export interface RecvImageElement extends MediaProps {
  type: 'image'
  /** 图片摘要/描述 */
  summary?: string
  /** 图片子类型 */
  sub_type?: string
}

/** 接收的语音消息段 */
export interface RecvRecordElement extends MediaProps {
  type: 'record'
}

/** 接收的视频消息段 */
export interface RecvVideoElement extends MediaProps {
  type: 'video'
}

/** 接收的猜拳消息段 */
export interface RecvRpsElement {
  type: 'rps'
  /** 猜拳结果：1-石头, 2-剪刀, 3-布 */
  result: string
}

/** 接收的掷骰子消息段 */
export interface RecvDiceElement {
  type: 'dice'
  /** 骰子点数：1-6 */
  result: string
}

/** 接收的窗口抖动消息段（戳一戳） */
export interface RecvShakeElement {
  type: 'shake'
}

/** 接收的戳一戳消息段 */
export interface RecvPokeElement {
  type: 'poke'
}

/** 接收的分享链接消息段 */
export interface RecvShareElement {
  type: 'share'
}

/** 接收的位置消息段 */
export interface RecvLocationElement {
  type: 'location'
}

/** 接收的合并转发消息段 */
export interface RecvForwardElement {
  type: 'forward'
  /** 合并转发消息 ID */
  id: string
  /** 合并转发消息内容 */
  content: []
}

/** 接收的 JSON 消息段 */
export interface RecvJsonElement {
  type: 'json'
  /** JSON 数据字符串 */
  data: string
}

/** 接收的文件消息段 */
export interface RecvFileElement extends MediaProps {
  type: 'file'
}

/** 接收的 Markdown 消息段 */
export interface RecvMarkdownElement {
  type: 'markdown'
}

/** 接收的小程序消息段 */
export interface RecvLightAppElement {
  type: 'lightapp'
}

/**
 * 接收的消息段类型联合
 * @description 表示从 QQ 接收到的所有可能的消息段类型
 */
export type RecvElement =
  | RecvTextElement
  | RecvAtElement
  | RecvReplyElement
  | RecvFaceElement
  | RecvImageElement
  | RecvRecordElement
  | RecvVideoElement
  | RecvRpsElement
  | RecvDiceElement
  | RecvShakeElement
  | RecvPokeElement
  | RecvShareElement
  | RecvLocationElement
  | RecvForwardElement
  | RecvJsonElement
  | RecvFileElement
  | RecvMarkdownElement
  | RecvLightAppElement

// ==================== 发送消息段类型 ====================

/** 发送的纯文本消息段 */
export interface SendTextElement {
  type: 'text'
  /** 文本内容 */
  text: string
}

/** 发送的 @ 消息段 */
export interface SendAtElement {
  type: 'at'
  /** 被 @ 的 QQ 号，'all' 表示 @全体成员 */
  qq: 'all' | (string & {}) | number
}

/** 发送的回复消息段 */
export interface SendReplyElement {
  type: 'reply'
  /** 被回复的消息 ID */
  id: string
}

/** 发送的商城表情消息段 */
export interface SendMfaceElement {
  type: 'mface'
  /** 表情 ID */
  id: number
  /** 表情 key */
  key: string
  /** emoji ID */
  emoji_id: string
  /** emoji 表情包 ID */
  emoji_package_id: string
  /** 表情描述/摘要 */
  summary?: string
}

/** 发送的 QQ 表情消息段 */
export interface SendFaceElement {
  type: 'face'
  /** QQ 表情 ID */
  id: number
}

/** 发送的大表情消息段 */
export interface SendBfaceElement {
  type: 'bface'
  /** 大表情 ID */
  id: number
}

/** 发送的图片消息段 */
export interface SendImageElement {
  type: 'image'
  /** 图片文件，支持 file:// / http:// / base64:// 协议 */
  file: string
  /** 图片文件名 */
  name?: string
  /** 图片摘要/描述 */
  summary?: string
  /** 图片子类型 */
  sub_type?: string
}

/** 发送的视频消息段 */
export interface SendVideoElement {
  type: 'video'
  /** 视频文件，支持 file:// / http:// / base64:// 协议 */
  file: string
  /** 视频文件名 */
  name?: string
  /** 视频封面图，支持 file:// / http:// / base64:// 协议 */
  thumb?: string
}

/** 发送的语音消息段 */
export interface SendRecordElement {
  type: 'record'
  /** 语音文件，支持 file:// / http:// / base64:// 协议 */
  file: string
  /** 语音文件名 */
  name?: string
}

/** 发送的推荐好友/群消息段 */
export interface SendContactElement {
  type: 'contact'
  /** 推荐类型：qq-好友, group-群 */
  sub_type: 'qq' | 'group'
  /** 被推荐的 QQ 号或群号 */
  id: string
}

/** 发送的戳一戳消息段 */
export interface SendPokeElement {
  type: 'poke'
}

/** 发送的音乐分享消息段 - 平台音乐 */
export interface SendPlatformMusicElement {
  type: 'music'
  /** 音乐平台 */
  platform: 'qq' | '163' | 'kugou' | 'migu' | 'kuwo'
  /** 音乐 ID */
  id: string
}

/** 发送的音乐分享消息段 - 自定义音乐 */
export interface SendCustomMusicElement {
  type: 'music'
  /** 自定义音乐标识 */
  platform: 'custom'
  /** 跳转链接 URL */
  url: string
  /** 音频链接 URL */
  audio: string
  /** 音乐标题 */
  title: string
  /** 封面图片 URL */
  image?: string
  /** 歌手名称 */
  singer?: string
}

/** 发送的音乐分享消息段 */
export type SendMusicElement = SendPlatformMusicElement | SendCustomMusicElement

/** 发送的合并转发消息段 */
export interface SendForwardElement {
  type: 'forward'
  /** 合并转发消息 ID */
  id: string
}

/** 发送的合并转发节点 - 引用已有消息 */
export interface SendNodeRefElement {
  type: 'node'
  /** 发送者 QQ 号（可选） */
  user_id?: string
  /** 发送者昵称（可选） */
  nickname?: string
  /** 引用的消息 ID */
  id: string
}

/** 发送的合并转发节点 - 自定义内容 */
export interface SendNodeContentElement {
  type: 'node'
  /** 发送者 QQ 号（可选） */
  user_id?: string
  /** 发送者昵称（可选） */
  nickname?: string
  /** 自定义消息内容 */
  content: SendElement[]
}

/** 发送的合并转发节点消息段 */
export type SendNodeElement = SendNodeRefElement | SendNodeContentElement

/** 发送的 JSON 消息段 */
export interface SendJsonElement {
  type: 'json'
  /** JSON 数据字符串 */
  data: string
}

/** 发送的文件消息段 */
export interface SendFileElement {
  type: 'file'
  /** 文件，支持 file:// / http:// / base64:// 协议 */
  file: string
  /** 文件名 */
  name?: string
}

/** 发送的 Markdown 消息段 */
export interface SendMarkdownElement {
  type: 'markdown'
}

/** 发送的小程序消息段 */
export interface SendLightAppElement {
  type: 'lightapp'
}

/**
 * 发送的消息段类型联合
 * @description 表示可以发送给 QQ 的所有可能的消息段类型
 */
export type SendElement =
  | SendTextElement
  | SendAtElement
  | SendReplyElement
  | SendMfaceElement
  | SendFaceElement
  | SendBfaceElement
  | SendImageElement
  | SendVideoElement
  | SendRecordElement
  | SendContactElement
  | SendPokeElement
  | SendMusicElement
  | SendForwardElement
  | SendNodeElement
  | SendJsonElement
  | SendFileElement
  | SendMarkdownElement
  | SendLightAppElement

/**
 * 将消息段类型包装为 OneBot 标准格式
 * @description 将 { type, ...data } 转换为 { type, data: { ...data } } 格式
 */
export type WrapData<T extends { type: string }> = { type: T['type']; data: Omit<T, 'type'> }

/**
 * 将 OneBot 标准格式展开为扁平格式
 * @description 将 { type, data: { ...data } } 转换为 { type, ...data } 格式
 */
export type FlattenData<T extends { type: string }> = T extends { data: infer U } ? U & { type: T['type'] } : never

/** 标准化后的发送消息段（OneBot 标准格式） */
export type NormalizedElementToSend = WrapData<SendElement>

/** 可发送的消息类型，可以是字符串或消息段 */
export type Sendable = string | SendElement

// ==================== 事件类型定义 ====================

/** 上报事件类型 */
export type PostType = 'meta_event' | 'message' | 'message_sent' | 'notice' | 'request'

/** 元事件类型 */
export type MetaEventType = 'heartbeat' | 'lifecycle'

/** 消息类型 */
export type MessageType = 'private' | 'group'

/** 通知类型 */
export type NoticeType = 'friend' | 'group' | 'client'

/** 通知子类型 */
export type NoticeSubType =
  | 'increase'
  | 'decrease'
  | 'recall'
  | 'poke'
  | 'like'
  | 'input'
  | 'admin'
  | 'ban'
  | 'title'
  | 'card'
  | 'upload'
  | 'reaction'
  | 'essence'

/**
 * 事件基础类型
 * @description 所有事件的基础结构，包含时间戳、机器人 QQ 号和事件类型
 */
export type EventBase<T extends PostType, U extends object> = U & {
  /** 事件发生的 Unix 时间戳 */
  time: number
  /** 收到事件的机器人 QQ 号 */
  self_id: number
  /** 上报类型 */
  post_type: T
}

/**
 * 元事件基础类型
 * @description 元事件表示 OneBot 实现本身的状态变化
 */
export type MetaEventBase<T extends MetaEventType, U extends object> = EventBase<
  'meta_event',
  U & { meta_event_type: T }
>

/**
 * 心跳元事件
 * @description 定期发送的心跳事件，用于确认连接状态
 */
export type HeartbeatMetaEvent = MetaEventBase<
  'heartbeat',
  {
    /** 状态信息 */
    status: {
      /** 是否在线 */
      online: boolean
      /** 状态是否正常 */
      good: boolean
    }
    /** 心跳间隔（毫秒） */
    interval: number
  }
>

/**
 * 生命周期元事件
 * @description OneBot 实现的生命周期事件
 */
export type LifecycleMetaEvent = MetaEventBase<
  'lifecycle',
  {
    /** 生命周期子类型 */
    sub_type: 'connect'
    // sub_type: 'connect' | 'disable' | 'enable'
  }
>

/** 元事件联合类型 */
export type MetaEvent = HeartbeatMetaEvent | LifecycleMetaEvent

// ==================== 辅助函数类型 ====================

/** 回复消息的函数类型 */
type Reply = (sendable: Sendable | Sendable[], reply?: boolean) => Promise<{ message_id: number }>

/** 发送消息的函数类型 */
type SendMsg = (sendable: Sendable | Sendable[]) => Promise<{ message_id: number }>

/** 消息表态操作的函数类型 */
type ReactionAction = (id: string) => Promise<void>

/** 撤回消息的函数类型 */
type Recall = () => Promise<void>

// ==================== 群和好友接口 ====================

/**
 * 群信息接口
 * @description 包含群的基本信息和常用操作方法
 */
export interface Group {
  /** 群号 */
  group_id: number
  /** 群名称 */
  group_name: string
  /** NapCat 实例 */
  napcat: NapCat
  /** 群签到 */
  sign: () => Promise<string>
  /** 获取群信息 */
  getInfo: () => Promise<{
    group_all_shut: number
    group_remark: string
    group_id: number
    group_name: string
    member_count: number
    max_member_count: number
  }>
  /** 获取群成员列表 */
  getMemberList: () => Promise<GroupMemberInfo[]>
  /** 获取群成员信息 */
  getMemberInfo: (user_id: number) => Promise<GroupMemberInfo>
  /** 设置群头衔 */
  setTitle: (user_id: number, title: string) => Promise<any>
  /** 设置群名片 */
  setCard: (user_id: number, card: string) => Promise<any>
  /** 设置群精华消息 */
  setEssence: (message_id: number) => Promise<any>
  /** 移除群精华消息 */
  delEssence: (message_id: number) => Promise<any>
  /** 撤回群消息 */
  recall: (message_id: number) => Promise<any>
  /** 禁言群成员 */
  ban: (user_id: number, duration: number) => Promise<any>
  /** 发送群消息 */
  sendMsg: SendMsg
}

export type GroupWithInfo = Group & Awaited<ReturnType<Group['getInfo']>>

/**
 * 好友信息接口
 * @description 包含好友的基本信息和常用操作方法
 */
export interface Friend {
  /** 好友 QQ 号 */
  user_id: number
  /** 好友昵称 */
  nickname: string
  /** NapCat 实例 */
  napcat: NapCat
  /** 发送私聊消息 */
  sendMsg: SendMsg
  /** 删除好友 */
  delete: (block?: boolean, both?: boolean) => Promise<any>
  /** 获取好友信息 */
  getInfo: () => Promise<{
    uid: string
    uin: string
    nick: string
    remark: string
    constellation: number
    shengXiao: number
    kBloodType: number
    homeTown: string
    makeFriendCareer: number
    pos: string
    college: string
    country: string
    province: string
    city: string
    postCode: string
    address: string
    regTime: number
    interest: string
    labels: string[]
    qqLevel: number
    qid: string
    longNick: string
    birthday_year: number
    birthday_month: number
    birthday_day: number
    age: number
    sex: string
    eMail: string
    phoneNum: string
    categoryId: number
    richTime: number
    richBuffer: {}
    topTime: string
    isBlock: boolean
    isMsgDisturb: boolean
    isSpecialCareOpen: boolean
    isSpecialCareZone: boolean
    ringId: string
    isBlocked: boolean
    recommendImgFlag: number
    disableEmojiShortCuts: number
    qidianMasterFlag: number
    qidianCrewFlag: number
    qidianCrewFlag2: number
    isHideQQLevel: number
    isHidePrivilegeIcon: number
    status: number
    extStatus: number
    batteryStatus: number
    termType: number
    netType: number
    iconType: number
    customStatus: null | string
    setTime: string
    specialFlag: number
    abiFlag: number
    eNetworkType: number
    showName: string
    termDesc: string
    musicInfo: {
      buf: {}
    }
    extOnlineBusinessInfo: {
      buf: {}
      customStatus: null
      videoBizInfo: {
        cid: string
        tvUrl: string
        synchType: string
      }
      videoInfo: {
        name: string
      }
    }
    user_id: number
    nickname: string
    long_nick: string
    reg_time: number
    is_vip: boolean
    is_years_vip: boolean
    vip_level: number
    login_days: number
  }>
}

export type FriendWithInfo = Friend & Awaited<ReturnType<Friend['getInfo']>>

// ==================== 消息事件类型 ====================

/**
 * 消息事件基础类型
 * @description 所有消息事件的基础结构
 */
export type MessageEventBase<T extends MessageType, U extends object> = EventBase<
  'message',
  U & {
    /** 消息 ID */
    message_id: number
    /** 引用的消息 ID */
    quote_id: string | null
    /** 消息类型 */
    message_type: T
    /** 消息序号 */
    message_seq: number
    /** 消息真实 ID */
    real_id: number
    /** 消息真实序号 */
    real_seq: number
    /** 原始消息内容（CQ 码格式） */
    raw_message: string
    /** 消息段数组 */
    message: RecvElement[]
    /** 回复消息 */
    reply: Reply
  }
>

/**
 * 私聊消息事件
 * @description 包含好友私聊、群临时会话等私聊消息
 */
export type PrivateMessageEvent = MessageEventBase<
  'private',
  {
    /** 发送者 QQ 号 */
    user_id: number
    /** 私聊子类型：friend-好友, group-群临时会话, group_self-群中自己发送, other-其他 */
    sub_type: 'friend' | 'group' | 'group_self' | 'other'
    /** 接收者 QQ 号 */
    target_id: number
    /** 好友信息对象 */
    friend: Friend
    /** 获取引用的消息 */
    getQuoteMsg: () => Promise<PrivateMessageEvent | null>
    /** 发送者信息 */
    sender: {
      /** 发送者 QQ 号 */
      user_id: number
      /** 发送者昵称 */
      nickname: string
    }
  }
>

/**
 * 群消息事件
 * @description 群聊中的消息事件
 */
export type GroupMessageEvent = MessageEventBase<
  'group',
  {
    /** 群号 */
    group_id: number
    /** 群名称 */
    group_name: string
    /** 发送者 QQ 号 */
    user_id: number
    /** 群消息子类型：normal-普通消息, notice-通知消息 */
    sub_type: 'normal' | 'notice'
    /** 撤回该消息 */
    recall: Recall
    /** 添加消息表态 */
    addReaction: ReactionAction
    /** 删除消息表态 */
    delReaction: ReactionAction
    /** 获取引用的消息 */
    getQuoteMsg: () => Promise<GroupMessageEvent | null>
    /** 设置精华消息 */
    setEssence: () => Promise<void>
    /** 删除精华消息 */
    delEssence: () => Promise<void>
    /** 获取发送者作为群成员的相关信息，如群身份、群名片等 */
    getSenderMemberInfo: () => Promise<any>
    /** 群信息对象 */
    group: Group
    /** 发送者信息 */
    sender: {
      /** 发送者 QQ 号 */
      user_id: number
      /** 发送者昵称 */
      nickname: string
      /** 发送者群名片 */
      card: string
      /** 发送者群角色：owner-群主, admin-管理员, member-普通成员 */
      role: 'owner' | 'admin' | 'member'
    }
  }
>

/** 消息事件联合类型 */
export type MessageEvent = PrivateMessageEvent | GroupMessageEvent

/**
 * 将消息事件转换为发送消息事件类型
 * @description 用于表示机器人自己发送的消息事件
 */
type ToMessageSent<T extends MessageEvent> = Omit<T, 'post_type' | 'group' | 'friend' | 'reply'> & {
  post_type: 'message_sent'
}

// ==================== 通知事件类型 ====================

/**
 * 通知事件基础类型
 * @description 所有通知事件的基础结构
 */
export type NoticeEventBase<T extends NoticeType, U extends object> = EventBase<
  'notice',
  U & {
    /** 通知类型 */
    notice_type: T
    /** 原始通知类型 */
    original_notice_type: string
  }
>

/**
 * 群通知事件基础类型
 * @description 所有群相关通知事件的基础结构
 */
export type GroupNoticeEventBase<T extends NoticeSubType, U extends object> = NoticeEventBase<
  'group',
  U & {
    /** 通知子类型 */
    sub_type: T
    /** 群号 */
    group_id: number
    /** 相关用户 QQ 号 */
    user_id: number
    /** 群信息对象 */
    group: Group
  }
>

/**
 * 好友通知事件基础类型
 * @description 所有好友相关通知事件的基础结构
 */
export type FriendNoticeEventBase<T extends NoticeSubType, U extends object> = NoticeEventBase<
  'friend',
  U & {
    /** 通知子类型 */
    sub_type: T
    /** 相关用户 QQ 号 */
    user_id: number
    /** 好友信息对象 */
    friend: Friend
  }
>

/** 好友增加通知事件 */
export type FriendIncreaseNoticeEvent = FriendNoticeEventBase<'increase', {}>

/** 好友减少通知事件 */
export type FriendDecreaseNoticeEvent = FriendNoticeEventBase<'decrease', {}>

/** 好友消息撤回通知事件 */
export type FriendRecallNoticeEvent = FriendNoticeEventBase<
  'recall',
  {
    /** 被撤回的消息 ID */
    message_id: number
  }
>

/** 好友戳一戳通知事件 */
export type FriendPokeNoticeEvent = FriendNoticeEventBase<
  'poke',
  {
    /** 被戳者 QQ 号 */
    target_id: number
    /** 发送者 QQ 号 */
    sender_qq: number
    /** 原始信息 */
    raw_info: any[]
  }
>

/** 好友点赞通知事件 */
export type FriendLikeNoticeEvent = FriendNoticeEventBase<
  'like',
  {
    /** 操作者 QQ 号 */
    operator_id: number
    /** 操作者昵称 */
    operator_nick: string
    /** 点赞次数 */
    times: number
  }
>

/** 好友输入状态通知事件 */
export type FriendInputNoticeEvent = FriendNoticeEventBase<
  'input',
  {
    /** 状态文本 */
    status_text: string
    /** 事件类型 */
    event_type: number
  }
>

/** 好友通知事件联合类型 */
export type FriendNoticeEvent =
  | FriendIncreaseNoticeEvent
  | FriendDecreaseNoticeEvent
  | FriendRecallNoticeEvent
  | FriendPokeNoticeEvent
  | FriendLikeNoticeEvent
  | FriendInputNoticeEvent

// ==================== 群通知事件 ====================

/** 群成员增加通知事件 */
export type GroupIncreaseNoticeEvent = GroupNoticeEventBase<
  'increase',
  {
    /** 操作者 QQ 号（如邀请者） */
    operator_id: number
    /** 加入类型：invite-邀请, add-主动加群, approve-管理员审批 */
    actions_type: 'invite' | 'add' | 'approve'
  }
>

/** 群成员减少通知事件 */
export type GroupDecreaseNoticeEvent = GroupNoticeEventBase<
  'decrease',
  {
    /** 操作者 QQ 号 */
    operator_id: number
    /** 离开类型：kick-被踢, leave-主动退出 */
    actions_type: 'kick' | 'leave'
  }
>

/** 群管理员变动通知事件 */
export type GroupAdminNoticeEvent = GroupNoticeEventBase<
  'admin',
  {
    /** 操作类型：set-设置管理员, unset-取消管理员 */
    action_type: 'set' | 'unset'
  }
>

/** 群禁言通知事件 */
export type GroupBanNoticeEvent = GroupNoticeEventBase<
  'ban',
  {
    /** 禁言时长（秒），0 表示解除禁言 */
    duration: number
    /** 操作类型：ban-禁言, lift_ban-解除禁言 */
    action_type: 'ban' | 'lift_ban'
    /** 操作者 QQ 号 */
    operator_id: number
  }
>

/** 群名片变动通知事件 */
export type GroupCardNoticeEvent = GroupNoticeEventBase<
  'card',
  {
    /** 新名片 */
    card_new: string
    /** 旧名片 */
    card_old: string
  }
>

/** 群戳一戳通知事件 */
export type GroupPokeNoticeEvent = GroupNoticeEventBase<
  'poke',
  {
    /** 被戳者 QQ 号 */
    target_id: number
    /** 原始信息 */
    raw_info: any[]
  }
>

/** 群头衔变动通知事件 */
export type GroupTitleNoticeEvent = GroupNoticeEventBase<
  'title',
  {
    /** 新头衔 */
    title: string
  }
>

/** 群文件上传通知事件 */
export type GroupUploadNoticeEvent = GroupNoticeEventBase<
  'upload',
  {
    /** 上传的文件信息 */
    file: {
      /** 文件 ID */
      id: string
      /** 文件名 */
      name: string
      /** 文件大小（字节） */
      size: number
      /** 文件业务 ID */
      busid: number
    }
  }
>

/** 群消息表态变动通知事件 */
export type GroupReactionNoticeEvent = GroupNoticeEventBase<
  'reaction',
  {
    /** 相关消息 ID */
    message_id: number
    /** 表态列表 */
    likes: {
      /** 表情 ID */
      emoji_id: string
      /** 表态数量 */
      count: number
    }[]
    /** 是否为添加表态 */
    is_add: boolean
  }
>
/** 群精华消息变动通知事件 */
export type GroupEssenceNoticeEvent = GroupNoticeEventBase<
  'essence',
  {
    /** 原消息发送者 QQ 号 */
    sender_id: number
    /** 相关消息 ID */
    message_id: number
    /** 操作者 QQ 号 */
    operator_id: number
    /** 操作类型：add-添加精华, remove-移除精华 */
    action_type: 'add' | 'remove'
  }
>

/** 群消息撤回通知事件 */
export type GroupRecallNoticeEvent = GroupNoticeEventBase<
  'recall',
  {
    /** 被撤回的消息 ID */
    message_id: number
    /** 操作者 QQ 号 */
    operator_id: number
  }
>

/** 群通知事件联合类型 */
export type GroupNoticeEvent =
  | GroupIncreaseNoticeEvent
  | GroupDecreaseNoticeEvent
  | GroupBanNoticeEvent
  | GroupCardNoticeEvent
  | GroupPokeNoticeEvent
  | GroupTitleNoticeEvent
  | GroupUploadNoticeEvent
  | GroupReactionNoticeEvent
  | GroupEssenceNoticeEvent
  | GroupRecallNoticeEvent

/** 通知事件联合类型 */
export type NoticeEvent = GroupNoticeEvent | FriendNoticeEvent

// ==================== 请求事件类型 ====================

/**
 * 请求事件基础类型
 * @description 所有请求事件的基础结构
 */
export type RequestEventBase<T extends string, U extends object> = EventBase<
  'request',
  U & {
    /** 请求类型 */
    request_type: T
    /** 请求者 QQ 号 */
    user_id: number
    /** 请求标识，用于处理请求 */
    flag: string
    /** 验证信息/备注 */
    comment: string
    /** 同意请求 */
    approve: () => Promise<void>
    /** 拒绝请求 */
    reject: (reason?: string) => Promise<void>
  }
>

/** 好友添加请求事件 */
export type FriendRequestEvent = RequestEventBase<'friend', {}>

/** 加群请求事件（他人申请加入群） */
export type GroupAddRequestEvent = RequestEventBase<
  'group',
  {
    /** 群号 */
    group_id: number
    /** 请求子类型：add-主动加群 */
    sub_type: 'add'
  }
>

/** 邀请入群请求事件（他人邀请机器人入群） */
export type GroupInviteRequestEvent = RequestEventBase<
  'group',
  {
    /** 群号 */
    group_id: number
    /** 请求子类型：invite-被邀请 */
    sub_type: 'invite'
  }
>

/** 群请求事件联合类型 */
export type GroupRequestEvent = GroupAddRequestEvent | GroupInviteRequestEvent

/** 请求事件联合类型 */
export type RequestEvent = FriendRequestEvent | GroupRequestEvent

// ==================== 事件映射 ====================

/**
 * OneBot 事件映射表
 * @description 定义了所有事件名称与对应事件类型的映射关系
 */
export interface OneBotEventMap {
  /** 元事件，通常与 OneBot 服务端状态相关 */
  meta_event: MetaEvent

  /** 元事件 - 心跳事件，确认服务端在线状态 */
  'meta_event.heartbeat': HeartbeatMetaEvent

  /** 元事件 - 生命周期，服务端状态变化 */
  'meta_event.lifecycle': LifecycleMetaEvent
  /** 元事件 - 生命周期 - 连接成功 */
  'meta_event.lifecycle.connect': LifecycleMetaEvent
  // 'meta_event.lifecycle.disable': LifecycleMetaEvent
  // 'meta_event.lifecycle.enable': LifecycleMetaEvent

  /** 消息事件，包含私聊和群消息 */
  message: MessageEvent

  /** 消息事件 - 私聊消息 */
  'message.private': PrivateMessageEvent
  /** 消息事件 - 私聊消息 - 好友私聊 */
  'message.private.friend': PrivateMessageEvent
  /** 消息事件 - 私聊消息 - 群临时会话 */
  'message.private.group': PrivateMessageEvent
  // 'message.private.group_self': PrivateMessageEvent
  // 'message.private.other': PrivateMessageEvent

  /** 消息事件 - 群消息 */
  'message.group': GroupMessageEvent
  /** 消息事件 - 群消息 - 普通消息 */
  'message.group.normal': GroupMessageEvent
  // 'message.group.notice': GroupMessageEvent

  message_sent: ToMessageSent<MessageEvent>

  /* 发送消息事件 - 私聊消息 */
  'message_sent.private': ToMessageSent<PrivateMessageEvent>
  /* 发送消息事件 - 私聊消息 - 好友私聊 */
  'message_sent.private.friend': ToMessageSent<PrivateMessageEvent>
  /* 发送消息事件 - 私聊消息 - 群临时会话 */
  'message_sent.private.group': ToMessageSent<PrivateMessageEvent>
  // 'message_sent.private.group_self': MessageToMessageSent<PrivateMessageEvent>
  // 'message_sent.private.other': MessageToMessageSent<PrivateMessageEvent>

  /* 发送消息事件 - 群消息 */
  'message_sent.group': ToMessageSent<GroupMessageEvent>
  /* 发送消息事件 - 群消息 - 普通消息 */
  'message_sent.group.normal': ToMessageSent<GroupMessageEvent>
  // 'message.group.notice': MessageToMessageSent<GroupMessageEvent>

  /** 请求事件 */
  request: RequestEvent

  /** 请求事件 - 好友请求 */
  'request.friend': FriendRequestEvent

  /** 请求事件 - 群请求 */
  'request.group': GroupRequestEvent
  /** 请求事件 - 他人加群请求，当机器人是群主或管理员时收到 */
  'request.group.add': GroupAddRequestEvent
  /** 请求事件 - 邀请加群请求，他人邀请机器人加入群时收到 */
  'request.group.invite': GroupInviteRequestEvent

  /** 通知事件 */
  notice: NoticeEvent

  /** 通知事件 - 好友相关通知 */
  'notice.friend': FriendNoticeEvent
  /** 通知事件 - 好友增加 */
  'notice.friend.increase': FriendIncreaseNoticeEvent
  /** 通知事件 - 好友减少 */
  'notice.friend.decrease': FriendDecreaseNoticeEvent
  /** 通知事件 - 好友备注变更 */
  'notice.friend.recall': FriendRecallNoticeEvent
  /** 通知事件 - 好友戳一戳 */
  'notice.friend.poke': FriendPokeNoticeEvent
  /** 通知事件 - 好友点赞 */
  'notice.friend.like': FriendLikeNoticeEvent
  /** 通知事件 - 好友输入状态 */
  'notice.friend.input': FriendInputNoticeEvent

  // 'notice.friend.offline_file': EventBase<'notice', any>
  // 'notice.client.status': EventBase<'notice', any>

  /** 通知事件 - 群相关通知 */
  'notice.group': GroupNoticeEvent
  /** 通知事件 - 群成员增加 */
  'notice.group.increase': GroupIncreaseNoticeEvent
  /** 通知事件 - 群成员减少 */
  'notice.group.decrease': GroupDecreaseNoticeEvent
  /** 通知事件 - 群管理员变更 */
  'notice.group.admin': GroupAdminNoticeEvent
  /** 通知事件 - 群成员被禁言 */
  'notice.group.ban': GroupBanNoticeEvent
  /** 通知事件 - 群戳一戳 */
  'notice.group.poke': GroupPokeNoticeEvent
  /** 通知事件 - 群头衔变更 */
  'notice.group.title': GroupTitleNoticeEvent
  /** 通知事件 - 群名片变更 */
  'notice.group.card': GroupCardNoticeEvent
  /** 通知事件 - 群公告变更 */
  'notice.group.recall': GroupRecallNoticeEvent
  /** 通知事件 - 群上传文件 */
  'notice.group.upload': GroupUploadNoticeEvent
  /** 通知事件 - 给群消息添加反应 Reaction */
  'notice.group.reaction': GroupReactionNoticeEvent
  /** 通知事件 - 群精华消息变更 */
  'notice.group.essence': GroupEssenceNoticeEvent
}

// ==================== API 类型 ====================

/**
 * OneBot 11 标准 API
 * @description OneBot 11 规范定义的标准 API 接口
 */
export type OneBotAPI =
  | 'delete_friend'
  | 'delete_msg'
  | 'get_forward_msg'
  | 'get_friend_list'
  | 'get_group_info'
  | 'get_group_list'
  | 'get_group_member_info'
  | 'get_group_member_list'
  | 'get_group_msg_history'
  | 'get_login_info'
  | 'get_msg'
  | 'get_status'
  | 'get_stranger_info'
  | 'send_group_msg'
  | 'send_private_msg'
  | 'set_friend_add_request'
  | 'set_group_add_request'
  | 'set_group_admin'
  | 'set_group_ban'
  | 'set_group_card'
  | 'set_group_kick'
  | 'set_group_leave'
  | 'set_group_name'
  | 'set_group_portrait'
  | 'set_group_special_title'
  | 'set_qq_profile'

/**
 * NapCat 扩展 API
 * @description NapCat 实现的额外扩展 API 接口
 */
export type NapCatExtendAPI =
  | '_del_group_notice'
  | '_get_group_notice'
  | '_get_model_show'
  | '_mark_all_as_read'
  | '_send_group_notice'
  | '_set_model_show'
  | '.handle_quick_operation'
  | '.ocr_image'
  | 'ArkShareGroup'
  | 'ArkSharePeer'
  | 'bot_exit'
  | 'can_send_image'
  | 'can_send_record'
  | 'clean_cache'
  | 'click_inline_keyboard_button'
  | 'create_collection'
  | 'create_group_file_folder'
  | 'delete_essence_msg'
  | 'delete_group_file'
  | 'delete_group_folder'
  | 'download_file'
  | 'fetch_custom_face'
  | 'fetch_emoji_like'
  | 'forward_friend_single_msg'
  | 'forward_group_single_msg'
  | 'friend_poke'
  | 'get_ai_characters'
  | 'get_ai_record'
  | 'get_clientkey'
  | 'get_collection_list'
  | 'get_cookies'
  | 'get_credentials'
  | 'get_csrf_token'
  | 'get_doubt_friends_add_request'
  | 'get_essence_msg_list'
  | 'get_file'
  | 'get_friend_msg_history'
  | 'get_friends_with_category'
  | 'get_group_at_all_remain'
  | 'get_group_detail_info'
  | 'get_group_file_system_info'
  | 'get_group_file_url'
  | 'get_group_files_by_folder'
  | 'get_group_honor_info'
  | 'get_group_ignored_notifies'
  | 'get_group_info_ex'
  | 'get_group_root_files'
  | 'get_group_shut_list'
  | 'get_group_system_msg'
  | 'get_image'
  | 'get_mini_app_ark'
  | 'get_online_clients'
  | 'get_private_file_url'
  | 'get_profile_like'
  | 'get_recent_contact'
  | 'get_record'
  | 'get_rkey_server'
  | 'get_rkey'
  | 'get_robot_uin_range'
  | 'get_unidirectional_friend_list'
  | 'get_version_info'
  | 'group_poke'
  | 'mark_group_msg_as_read'
  | 'mark_msg_as_read'
  | 'mark_private_msg_as_read'
  | 'move_group_file'
  | 'nc_get_packet_status'
  | 'nc_get_rkey'
  | 'nc_get_user_status'
  | 'ocr_image'
  | 'rename_group_file'
  | 'send_forward_msg'
  | 'send_group_ai_record'
  | 'send_group_sign'
  | 'send_like'
  | 'send_packet'
  | 'send_poke'
  | 'set_diy_online_status'
  | 'set_essence_msg'
  | 'set_friend_remark'
  | 'set_group_add_option'
  | 'set_group_kick_members'
  | 'set_group_remark'
  | 'set_group_robot_add_option'
  | 'set_group_search'
  | 'set_group_sign'
  | 'set_group_whole_ban'
  | 'set_input_status'
  | 'set_msg_emoji_like'
  | 'set_online_status'
  | 'set_qq_avatar'
  | 'set_self_longnick'
  | 'trans_group_file'
  | 'translate_en2zh'
  | 'upload_group_file'
  | 'upload_private_file'

/** 所有可用的 API 接口联合类型 */
export type API = OneBotAPI | NapCatExtendAPI

export interface GroupMemberInfo {
  group_id: number
  user_id: number
  nickname: string
  card: string
  sex: string
  age: number
  area: string
  level: string
  qq_level: number
  join_time: number
  last_sent_time: number
  title_expire_time: number
  unfriendly: boolean
  card_changeable: boolean
  is_robot: boolean
  shut_up_timestamp: number
  role: 'owner' | 'admin' | 'member' | (string & {})
  title: string
}
