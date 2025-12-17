function createDataSegment<T extends string, D>(type: T, data: D) {
  return {
    type,
    data,
  }
}

/**
 * 消息片段构造器
 */
export const segment = {
  /** 创建一个文本消息片段 */
  text: (text: string) => createDataSegment('text', { text }),
  /** 创建一个图片消息片段 */
  image: (url: string) => createDataSegment('image', { url }),
  /** 创建一个 QQ 表情消息片段 */
  face: (id: number) => createDataSegment('face', { id }),
  /** 创建一个语音消息片段 */
  record: (url: string) => createDataSegment('audio', { url }),
  /** 创建一个视频消息片段 */
  video: (url: string) => createDataSegment('video', { url }),
}
