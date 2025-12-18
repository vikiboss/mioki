import type { ExtractByType, SendElement } from './types'

function createSegment<T extends SendElement['type'], D>(type: T, data: D): SendElement {
  return { type, ...data } as SendElement
}

/**
 * 消息片段构造器
 */
export const segment = {
  /** 创建一个文本消息片段 */
  text: (text: string): SendElement => createSegment('text', { text }),
  /** 创建一个艾特消息片段 */
  at: (qq: 'all' | (string & {})): SendElement => createSegment('at', { qq }),
  /** 创建一个 QQ 表情消息片段 */
  face: (id: number): SendElement => createSegment('face', { id }),
  /** 创建一个回复消息片段 */
  reply: (id: string): SendElement => createSegment('reply', { id }),
  /** 创建一个图片消息片段 */
  image: (file: string, options?: Omit<ExtractByType<SendElement, 'image'>, 'type' | 'file'>): SendElement =>
    createSegment('image', { file, ...options }),
  /** 创建一个语音消息片段 */
  record: (file: string, options?: Omit<ExtractByType<SendElement, 'record'>, 'type' | 'file'>): SendElement =>
    createSegment('record', { file, ...options }),
  /** 创建一个视频消息片段 */
  video: (file: string, options?: Omit<ExtractByType<SendElement, 'video'>, 'type' | 'file'>): SendElement =>
    createSegment('video', { file, ...options }),
  /** 创建一个动态表情消息片段 */
  mface: (options: Omit<ExtractByType<SendElement, 'mface'>, 'type'>): SendElement =>
    createSegment('mface', { ...options }),
  /** 创建一个大表情消息片段 */
  bface: (id: number): SendElement => createSegment('bface', { id }),
  /** 创建一个 联系人/群 分享消息片段 */
  contact: (type: 'qq' | 'group', id: string): SendElement => createSegment('contact', { id, sub_type: type }),
  /** 创建一个戳一戳消息片段 */
  poke: (): SendElement => createSegment('poke', {}),
  /** 创建一个音乐消息片段 */
  music: (platform: 'qq' | '163' | 'kugou' | 'migu' | 'kuwo', id: string): SendElement =>
    createSegment('music', { platform, id }),
  /** 创建一个自定义音乐消息片段 */
  musicCustom: (
    title: string,
    audio: string,
    url: string,
    options?: Omit<ExtractByType<SendElement, 'music'>, 'type' | 'platform' | 'url' | 'audio' | 'title'>,
  ): SendElement => createSegment('music', { platform: 'custom', url, audio, title, ...options }),
  /** 创建一个合并转发消息片段 */
  forward: (id: string): SendElement => createSegment('forward', { id }),
  /** 创建一个 JSON 消息片段 */
  json: (data: string): SendElement => createSegment('json', { data }),
  /** 创建一个文件消息片段 */
  file: (file: string, options?: Omit<ExtractByType<SendElement, 'file'>, 'type' | 'file'>): SendElement =>
    createSegment('file', { file, ...options }),
  /** 创建一个 Markdown 消息片段 */
  markdown: (): SendElement => createSegment('markdown', {}),
  /** 创建一个轻应用消息片段 */
  lightapp: (): SendElement => createSegment('lightapp', {}),
}
