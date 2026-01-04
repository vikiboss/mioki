import { ChromeUA, definePlugin } from 'mioki'

// ============================================================================
// 类型定义
// ============================================================================

/** QQ 登录平台配置 */
export interface QRLoginConfig {
  /** 应用 ID */
  aid: string
  /** 域 ID */
  daid: string
  /** 登录成功重定向地址 */
  redirectUri: string
  /** 来源页面 */
  referrer?: string
  /** 第三方应用 ID */
  ptThirdAid?: string
  /** 响应类型 */
  responseType?: string
  /** OpenAPI 配置 */
  openapi?: string
}

/** 登录状态检查结果 */
export interface QRLoginCheckResult {
  /** 状态码 */
  ret: string
  extret: string
  /** 登录成功后的跳转地址 */
  jumpUrl: string
  redirect: string
  /** 状态消息 */
  msg: string
  /** 登录用户昵称 */
  nickname?: string
}

/** 登录状态枚举 */
export enum QRLoginStatus {
  /** 等待扫码 */
  Pending = '66',
  /** 已扫码，等待确认 */
  Scanned = '67',
  /** 二维码已过期 */
  Expired = '65',
  /** 用户拒绝登录 */
  Refused = '68',
  /** 登录成功 */
  Success = '0',
}

/** 小程序登录状态 */
export type MiniProgramLoginStatus = 'OK' | 'Wait' | 'Expired' | 'Used' | 'Error'

/** 小程序登录结果 */
export interface MiniProgramLoginResult {
  ticket: string
  code: string
}

// ============================================================================
// Cookie 工具类
// ============================================================================

/** Cookie 处理工具类 */
export class CookieUtils {
  /** 解析 Cookie 字符串为对象 */
  static parse(cookie: string): Record<string, string> {
    return cookie
      .split(';')
      .map((item) => item.split('='))
      .reduce(
        (acc, [key, value]) => {
          if (key && value !== undefined) {
            acc[key.trim()] = value.trim()
          }
          return acc
        },
        {} as Record<string, string>,
      )
  }

  /** 解析 Set-Cookie 响应头 */
  static parseSetCookie(setCookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {}

    const cookieEntries = setCookieHeader
      .split(',')
      .map((item, index, array) => {
        if (item.includes('Expires=') && index > 0) return `${array[index - 1]},${item}`
        return item
      })
      .filter((item, index, array) => {
        return !item.includes('Expires=') || index === array.findIndex((i) => i === item)
      })

    for (const entry of cookieEntries) {
      const parts = entry.split(';')
      const [keyValue] = parts
      if (keyValue) {
        const [name, value] = keyValue.split('=')
        if (name && value !== undefined) {
          cookies[name.trim()] = value.trim()
        }
      }
    }

    return cookies
  }

  /** 将 Cookie 对象序列化为字符串 */
  static stringify(cookie: Record<string, string>): string {
    return Object.entries(cookie)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }

  /** 转换 Cookie（支持字符串或对象输入） */
  static transform(cookie: string | Record<string, string>): string {
    const cookies = typeof cookie === 'string' ? this.parseSetCookie(cookie) : cookie
    return this.stringify(cookies)
  }
}

// ============================================================================
// 哈希工具类
// ============================================================================

/** 哈希计算工具类 */
export class HashUtils {
  /** 计算 QQ 登录专用哈希值 */
  static hash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash += (hash << 5) + str.charCodeAt(i)
    }
    return 2147483647 & hash
  }

  /** 计算 GTk 值（用于 QQ 接口鉴权） */
  static getGTk(pskey: string): number {
    let gtk = 5381
    for (let i = 0; i < pskey.length; i++) {
      gtk += (gtk << 5) + pskey.charCodeAt(i)
    }
    return gtk & 0x7fffffff
  }
}

// ============================================================================
// QQ 扫码登录会话
// ============================================================================

type EventHandler<T extends unknown[] = []> = (...args: T) => void | Promise<void>

/** QQ 扫码登录会话 */
export class QRLoginSession {
  /** 常用平台预设配置 */
  static readonly Presets: Record<'vip' | 'qzone' | 'music' | 'wegame' | 'val', QRLoginConfig> = {
    vip: {
      aid: '8000201',
      daid: '18',
      redirectUri: 'https://vip.qq.com/loginsuccess.html',
      referrer:
        'https://xui.ptlogin2.qq.com/cgi-bin/xlogin?appid=8000201&style=20&s_url=https%3A%2F%2Fvip.qq.com%2Floginsuccess.html&maskOpacity=60&daid=18&target=self',
    },
    qzone: {
      aid: '549000912',
      daid: '5',
      redirectUri: 'https://qzs.qzone.qq.com/qzone/v5/loginsucc.html?para=izone',
      referrer: 'https://qzone.qq.com/',
    },
    music: {
      aid: '716027609',
      daid: '383',
      redirectUri: 'https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https%3A%2F%2Fy.qq.com%2F',
      ptThirdAid: '100497308',
      responseType: 'code',
      openapi: '1010_1030',
    },
    wegame: {
      aid: '1600001063',
      daid: '733',
      redirectUri: 'https://www.wegame.com.cn/middle/login/third_callback.html',
      referrer: 'https://www.wegame.com.cn/',
    },
    val: {
      aid: '716027609',
      daid: '383',
      redirectUri:
        'https://val.qq.com/comm-htdocs/login/qc_redirect.html?parent_domain=https%3A%2F%2Fval.qq.com&isMiloSDK=1&isPc=1',
      ptThirdAid: '102059301',
      responseType: 'code',
      openapi: '1010_1030',
    },
  }

  /** iOS QQ User-Agent */
  static readonly UA_IOS_QQ = 'QQ/9.1.25.607 CFNetwork/1568.300.101 Darwin/24.2.0'

  private readonly config: QRLoginConfig
  private timeout = 120_000
  private checkInterval = 1_000
  private cancelled = false
  private intervalTimer?: ReturnType<typeof setInterval>
  private timeoutTimer?: ReturnType<typeof setTimeout>

  // 事件处理器
  private handlers = {
    qrcode: null as EventHandler<[Buffer]> | null,
    pending: null as EventHandler<[QRLoginCheckResult]> | null,
    scanned: null as EventHandler<[QRLoginCheckResult]> | null,
    refused: null as EventHandler<[QRLoginCheckResult]> | null,
    expired: null as EventHandler<[QRLoginCheckResult]> | null,
    success: null as EventHandler<[QRLoginCheckResult]> | null,
    timeout: null as EventHandler | null,
    oauth2: null as ((cookie: Record<string, string>, res: QRLoginCheckResult) => string | Promise<string>) | null,
  }

  constructor(config: QRLoginConfig | keyof typeof QRLoginSession.Presets) {
    this.config = typeof config === 'string' ? QRLoginSession.Presets[config] : config
  }

  // ==================== 配置方法 ====================

  /** 设置超时时间（毫秒，最大 120 秒） */
  setTimeout(ms: number): this {
    this.timeout = Math.min(ms, 120_000)
    return this
  }

  /** 设置状态检查间隔（毫秒） */
  setCheckInterval(ms: number): this {
    this.checkInterval = ms
    return this
  }

  // ==================== 事件注册方法 ====================

  /** 二维码生成时触发 */
  onQRCode(handler: EventHandler<[Buffer]>): this {
    this.handlers.qrcode = handler
    return this
  }

  /** 等待扫码时触发 */
  onPending(handler: EventHandler<[QRLoginCheckResult]>): this {
    this.handlers.pending = handler
    return this
  }

  /** 已扫码等待确认时触发 */
  onScanned(handler: EventHandler<[QRLoginCheckResult]>): this {
    this.handlers.scanned = handler
    return this
  }

  /** 用户拒绝登录时触发 */
  onRefused(handler: EventHandler<[QRLoginCheckResult]>): this {
    this.handlers.refused = handler
    return this
  }

  /** 二维码过期时触发 */
  onExpired(handler: EventHandler<[QRLoginCheckResult]>): this {
    this.handlers.expired = handler
    return this
  }

  /** 登录成功时触发 */
  onSuccess(handler: EventHandler<[QRLoginCheckResult]>): this {
    this.handlers.success = handler
    return this
  }

  /** 超时时触发 */
  onTimeout(handler: EventHandler): this {
    this.handlers.timeout = handler
    return this
  }

  /** OAuth2 登录后处理 */
  afterOAuth2(handler: (cookie: Record<string, string>, res: QRLoginCheckResult) => string | Promise<string>): this {
    this.handlers.oauth2 = handler
    return this
  }

  // ==================== 核心方法 ====================

  /** 取消登录 */
  cancel(): void {
    this.cancelled = true
    this.cleanup()
  }

  /** 开始登录流程 */
  async login(): Promise<string> {
    this.cancelled = false

    const { qrsig, qrcode } = await this.requestQRCode()
    await this.handlers.qrcode?.(qrcode)

    await this.delay(1000)

    return this.pollLoginStatus(qrsig)
  }

  // ==================== 私有方法 ====================

  private cleanup(): void {
    if (this.intervalTimer) clearInterval(this.intervalTimer)
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer)
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /** 请求二维码 */
  private async requestQRCode(): Promise<{ qrsig: string; qrcode: Buffer }> {
    const params = new URLSearchParams({
      appid: this.config.aid,
      e: '2',
      l: 'M',
      s: '3',
      d: '72',
      v: '4',
      t: String(Math.random()),
      daid: this.config.daid,
    })

    if (this.config.ptThirdAid) {
      params.set('pt_3rd_aid', this.config.ptThirdAid)
      params.set('u1', 'https://graph.qq.com/oauth2.0/login_jump')
    } else {
      params.set('u1', this.config.redirectUri)
    }

    const url = `https://ssl.ptlogin2.qq.com/ptqrshow?${params.toString()}`

    const response = await fetch(url, {
      headers: {
        referer: `https://xui.ptlogin2.qq.com/cgi-bin/xlogin?appid=${this.config.aid}&style=20&s_url=${params.get('u1')}&maskOpacity=60&daid=${this.config.daid}&target=self`,
        'user-agent': ChromeUA,
      },
    })

    const qrsig = /qrsig=(.*?);/.exec(response.headers.get('set-cookie') || '')?.[1]?.trim() || ''
    const qrcode = Buffer.from(await response.arrayBuffer())

    return { qrsig, qrcode }
  }

  /** 检查登录状态 */
  private async checkStatus(qrsig: string): Promise<QRLoginCheckResult> {
    const params = new URLSearchParams({
      ptqrtoken: String(HashUtils.hash(qrsig)),
      from_ui: '1',
      aid: this.config.aid,
      daid: this.config.daid,
    })

    if (this.config.ptThirdAid) {
      params.set('pt_3rd_aid', this.config.ptThirdAid)
      params.set('u1', 'https://graph.qq.com/oauth2.0/login_jump')
    } else {
      params.set('u1', this.config.redirectUri)
    }

    const api = `https://ssl.ptlogin2.qq.com/ptqrlogin?${params.toString()}`

    const response = await fetch(api, {
      headers: {
        cookie: `qrsig=${qrsig}`,
        referer: `https://xui.ptlogin2.qq.com/cgi-bin/xlogin?appid=${this.config.aid}&style=20&s_url=${encodeURIComponent(this.config.redirectUri)}&maskOpacity=60&daid=18&target=self`,
        'user-agent': ChromeUA,
      },
    })

    const text = await response.text()
    const [ret, extret, jumpUrl, redirect, msg, nickname] = text
      .replace('ptuiCB(', '')
      .replace(')', '')
      .split(',')
      .map((v) => v.trim().replace(/^'(.*)?'$/, '$1'))

    if (!ret) {
      throw new Error('登录状态检查失败')
    }

    return { ret, extret, jumpUrl, redirect, msg, nickname }
  }

  /** 轮询登录状态 */
  private pollLoginStatus(qrsig: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let prevStatus = ''

      this.timeoutTimer = setTimeout(() => {
        this.cleanup()
        this.handlers.timeout?.()
        reject(new Error('登录超时'))
      }, this.timeout)

      this.intervalTimer = setInterval(async () => {
        if (this.cancelled) {
          this.cleanup()
          reject(new Error('登录已取消'))
          return
        }

        try {
          const result = await this.checkStatus(qrsig)

          switch (result.ret) {
            case QRLoginStatus.Pending:
              if (prevStatus !== result.ret) {
                this.handlers.pending?.(result)
              }
              break

            case QRLoginStatus.Scanned:
              if (prevStatus !== result.ret) {
                this.handlers.scanned?.(result)
              }
              break

            case QRLoginStatus.Expired:
              this.cleanup()
              this.handlers.expired?.(result)
              reject(new Error('二维码已过期'))
              return

            case QRLoginStatus.Refused:
              this.cleanup()
              this.handlers.refused?.(result)
              reject(new Error('用户拒绝登录'))
              return

            case QRLoginStatus.Success:
              this.cleanup()
              this.handlers.success?.(result)
              resolve(await this.handleSuccess(result))
              return

            default:
              this.cleanup()
              reject(new Error('未知登录状态'))
              return
          }

          prevStatus = result.ret
        } catch (error) {
          this.cleanup()
          reject(error)
        }
      }, this.checkInterval)
    })
  }

  /** 处理登录成功 */
  private async handleSuccess(result: QRLoginCheckResult): Promise<string> {
    const response = await fetch(result.jumpUrl, { redirect: 'manual' })
    const location = response.headers.get('location') || ''
    const cookie = CookieUtils.parseSetCookie(response.headers.get('set-cookie') || '')

    const isThirdParty = location.includes('graph.qq.com/oauth2.0')

    if (isThirdParty && this.handlers.oauth2) {
      return this.handlers.oauth2(cookie, result)
    }

    cookie.p_uin = cookie.uin || ''
    return CookieUtils.stringify(cookie)
  }
}

// ============================================================================
// 小程序扫码登录会话
// ============================================================================

/** 小程序扫码登录会话 */
export class MiniProgramLoginSession {
  private static readonly QUA = 'V1_HT5_QDT_0.70.2209190_x64_0_DEV_D'

  private readonly appid: string | number
  private timeout = 120_000
  private checkInterval = 1_000
  private cancelled = false
  private intervalTimer?: ReturnType<typeof setInterval>
  private timeoutTimer?: ReturnType<typeof setTimeout>

  // 事件处理器
  private handlers = {
    link: null as EventHandler<[string]> | null,
    pending: null as EventHandler | null,
    scanned: null as EventHandler | null,
    refused: null as EventHandler | null,
    expired: null as EventHandler | null,
    success: null as EventHandler | null,
    timeout: null as EventHandler | null,
  }

  constructor(appid: string | number) {
    this.appid = appid
  }

  // ==================== 配置方法 ====================

  /** 设置超时时间（毫秒，最大 120 秒） */
  setTimeout(ms: number): this {
    this.timeout = Math.min(ms, 120_000)
    return this
  }

  /** 设置状态检查间隔（毫秒） */
  setCheckInterval(ms: number): this {
    this.checkInterval = ms
    return this
  }

  // ==================== 事件注册方法 ====================

  /** 登录链接生成时触发 */
  onLink(handler: EventHandler<[string]>): this {
    this.handlers.link = handler
    return this
  }

  /** 等待扫码时触发 */
  onPending(handler: EventHandler): this {
    this.handlers.pending = handler
    return this
  }

  /** 已扫码时触发 */
  onScanned(handler: EventHandler): this {
    this.handlers.scanned = handler
    return this
  }

  /** 拒绝登录时触发 */
  onRefused(handler: EventHandler): this {
    this.handlers.refused = handler
    return this
  }

  /** 二维码过期时触发 */
  onExpired(handler: EventHandler): this {
    this.handlers.expired = handler
    return this
  }

  /** 登录成功时触发 */
  onSuccess(handler: EventHandler): this {
    this.handlers.success = handler
    return this
  }

  /** 超时时触发 */
  onTimeout(handler: EventHandler): this {
    this.handlers.timeout = handler
    return this
  }

  // ==================== 核心方法 ====================

  /** 取消登录 */
  cancel(): void {
    this.cancelled = true
    this.cleanup()
  }

  /** 开始登录流程 */
  async login(): Promise<MiniProgramLoginResult> {
    this.cancelled = false

    const { url, code } = await this.requestLoginCode()
    this.handlers.link?.(url)

    return this.pollLoginStatus(code)
  }

  // ==================== 私有方法 ====================

  private cleanup(): void {
    if (this.intervalTimer) clearInterval(this.intervalTimer)
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer)
  }

  private getHeaders(): Record<string, string> {
    return {
      qua: MiniProgramLoginSession.QUA,
      host: 'q.qq.com',
      accept: 'application/json',
      'content-type': 'application/json',
    }
  }

  /** 请求登录码 */
  private async requestLoginCode(): Promise<{ url: string; code: string }> {
    const response = await fetch('https://q.qq.com/ide/devtoolAuth/GetLoginCode', {
      method: 'GET',
      headers: this.getHeaders(),
    })

    const { code, data } = await response.json()

    if (+code !== 0) {
      throw new Error('获取登录码失败')
    }

    return {
      code: data.code ?? '',
      url: `https://h5.qzone.qq.com/qqq/code/${data.code}?_proxy=1&from=ide`,
    }
  }

  /** 查询登录状态 */
  private async queryStatus(code: string): Promise<{ status: MiniProgramLoginStatus; ticket?: string }> {
    const response = await fetch(`https://q.qq.com/ide/devtoolAuth/syncScanSateGetTicket?code=${code}`, {
      method: 'GET',
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      return { status: 'Error' }
    }

    const { code: resCode, data } = await response.json()

    if (+resCode === 0) {
      if (+data.ok !== 1) return { status: 'Wait' }
      return { status: 'OK', ticket: data.ticket }
    }

    if (+resCode === -10003) return { status: 'Used' }

    return { status: 'Error' }
  }

  /** 获取授权码 */
  private async getAuthCode(ticket: string): Promise<string> {
    const response = await fetch('https://q.qq.com/ide/login', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ appid: this.appid, ticket }),
    })

    if (!response.ok) return ''

    const { code } = await response.json()
    return code || ''
  }

  /** 轮询登录状态 */
  private pollLoginStatus(code: string): Promise<MiniProgramLoginResult> {
    return new Promise((resolve, reject) => {
      let prevStatus = ''

      this.timeoutTimer = setTimeout(() => {
        this.cleanup()
        this.handlers.timeout?.()
        reject(new Error('登录超时'))
      }, this.timeout)

      this.intervalTimer = setInterval(async () => {
        if (this.cancelled) {
          this.cleanup()
          reject(new Error('登录已取消'))
          return
        }

        try {
          const result = await this.queryStatus(code)

          switch (result.status) {
            case 'Wait':
              if (prevStatus !== 'Wait') {
                this.handlers.pending?.()
              }
              break

            case 'OK':
              this.cleanup()
              this.handlers.success?.()
              const authCode = await this.getAuthCode(result.ticket!)
              resolve({ ticket: result.ticket!, code: authCode })
              return

            case 'Expired':
              this.cleanup()
              this.handlers.expired?.()
              reject(new Error('二维码已过期'))
              return

            case 'Used':
              this.cleanup()
              this.handlers.refused?.()
              reject(new Error('登录已被使用'))
              return

            case 'Error':
              this.cleanup()
              reject(new Error('登录状态查询失败'))
              return
          }

          prevStatus = result.status
        } catch (error) {
          this.cleanup()
          reject(error)
        }
      }, this.checkInterval)
    })
  }
}

// ============================================================================
// 统一登录服务
// ============================================================================

/** 统一登录服务 */
export class LoginService {
  /** QQ 扫码登录会话类 */
  static readonly QRLoginSession = QRLoginSession
  /** 小程序登录会话类 */
  static readonly MiniProgramLoginSession = MiniProgramLoginSession
  /** Cookie 工具类 */
  static readonly CookieUtils = CookieUtils
  /** 哈希工具类 */
  static readonly HashUtils = HashUtils
  /** 预设平台配置 */
  static readonly Presets = QRLoginSession.Presets
  /** iOS QQ User-Agent */
  static readonly UA_IOS_QQ = QRLoginSession.UA_IOS_QQ

  /** 创建 QQ 扫码登录会话 */
  static createQRLogin(config: QRLoginConfig | keyof typeof QRLoginSession.Presets): QRLoginSession {
    return new QRLoginSession(config)
  }

  /** 创建小程序登录会话 */
  static createMiniProgramLogin(appid: string | number): MiniProgramLoginSession {
    return new MiniProgramLoginSession(appid)
  }
}

// ============================================================================
// 插件定义
// ============================================================================

declare module 'mioki' {
  export interface MiokiServices {
    /** 统一扫码登录服务 */
    login: typeof LoginService
  }
}

export default definePlugin({
  name: 'qr-login',
  description: '统一扫码登录服务',
  version: '2.0.0',
  priority: 10,
  setup(ctx) {
    ctx.addService('login', LoginService)
  },
})
