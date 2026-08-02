import {
  asBotId,
  asMessageId,
  colors,
  defineAdapter,
  messageReaction,
  messageRecall,
  messageSend,
  registerStatusProvider,
} from 'mioki'
import { DEFAULT_INSTANCE, normalizeInstances } from './config'
import { createNapCatBot, type NapCatBot, type NapCatBotData } from './bot'
import { NapCatWebSocketGateway } from './gateway'
import { AdapterEventDeduplicator } from './dedup'
import { createNapCatStatusProvider } from './status'
import {
  buildMessageEvent,
  buildMetaEvent,
  buildNoticeEvent,
  buildRequestEvent,
  decodeWsMessage,
} from './event'

import type {
  Adapter,
  AdapterContext,
  AdapterFactoryOptions,
  AdapterName,
} from 'mioki'
import type { NapCatAdapterConfig, NapCatInstanceConfig } from './config'
import type { AdapterStatus, Capability, Event, Logger, Bot } from 'mioki'
import type { WebSocketConnection } from 'mioki'

const NAPCAT_NOTICE_NOTIFY_MAP: Record<string, { notice_type: string; sub_type: string }> = {
  input_status: { notice_type: 'friend', sub_type: 'input' },
  profile_like: { notice_type: 'friend', sub_type: 'like' },
  title: { notice_type: 'group', sub_type: 'title' },
}

const NAPCAT_NOTICE_EVENT_MAP: Record<string, { notice_type: string; sub_type: string }> = {
  friend_add: { notice_type: 'friend', sub_type: 'increase' },
  friend_recall: { notice_type: 'friend', sub_type: 'recall' },
  offline_file: { notice_type: 'friend', sub_type: 'offline_file' },
  client_status: { notice_type: 'client', sub_type: 'status' },
  group_admin: { notice_type: 'group', sub_type: 'admin' },
  group_ban: { notice_type: 'group', sub_type: 'ban' },
  group_card: { notice_type: 'group', sub_type: 'card' },
  group_upload: { notice_type: 'group', sub_type: 'upload' },
  group_decrease: { notice_type: 'group', sub_type: 'decrease' },
  group_increase: { notice_type: 'group', sub_type: 'increase' },
  group_msg_emoji_like: { notice_type: 'group', sub_type: 'reaction' },
  essence: { notice_type: 'group', sub_type: 'essence' },
  group_recall: { notice_type: 'group', sub_type: 'recall' },
}

const buildUrl = (config: NapCatInstanceConfig): string => {
  const protocol = config.protocol ?? DEFAULT_INSTANCE.protocol
  const host = config.host ?? DEFAULT_INSTANCE.host
  const port = config.port ?? DEFAULT_INSTANCE.port
  const token = config.token ?? ''
  const search = token ? `?access_token=${encodeURIComponent(token)}` : ''
  return `${protocol}://${host}:${port}${search}`
}

const buildMaskedUrl = (config: NapCatInstanceConfig): string => {
  const protocol = config.protocol ?? DEFAULT_INSTANCE.protocol
  const host = config.host ?? DEFAULT_INSTANCE.host
  const port = config.port ?? DEFAULT_INSTANCE.port
  const token = config.token ?? ''
  const search = token ? '?access_token=***' : ''
  return `${protocol}://${host}:${port}${search}`
}

const buildNoticeFromOneBot = (data: Record<string, unknown>): {
  notice_type: string
  sub_type?: string
  action_type?: string
} => {
  if (data.notice_type === 'notify') {
    const mapped = data.sub_type === 'poke'
      ? data.group_id
        ? { notice_type: 'group', sub_type: 'poke' }
        : { notice_type: 'friend', sub_type: 'poke' }
      : NAPCAT_NOTICE_NOTIFY_MAP[(data.sub_type as string) ?? '']
    if (mapped) {
      return {
        notice_type: mapped.notice_type,
        sub_type: mapped.sub_type,
        action_type: data.sub_type !== mapped.sub_type ? (data.sub_type as string) : undefined,
      }
    }
  }
  const mapped = NAPCAT_NOTICE_EVENT_MAP[(data.notice_type as string) ?? '']
  if (mapped) {
    return {
      notice_type: mapped.notice_type,
      sub_type: mapped.sub_type,
      action_type: data.sub_type && data.sub_type !== mapped.sub_type ? (data.sub_type as string) : undefined,
    }
  }
  return {
    notice_type: data.notice_type as string,
    sub_type: data.sub_type as string | undefined,
  }
}

const buildAdapter = (
  instance: NapCatInstanceConfig,
  adapterName: AdapterName,
  logger: Logger,
  gatewayName: string,
  botLabel: string,
): Adapter => {
  const url = buildUrl(instance)
  const maskedUrl = buildMaskedUrl(instance)
  const dedup = new AdapterEventDeduplicator({ ttl: 60_000, maxSize: 1024 })
  const botData: NapCatBotData = {
    bot_id: asBotId(0),
    adapter: adapterName,
    nickname: '',
    online: false,
  }
  let bot: NapCatBot | null = null
  let gateway: NapCatWebSocketGateway | null = null
  let adapterContext: AdapterContext | null = null
  let unregisterBot: (() => void) | null = null
  let unregisterCapabilities: Array<() => void> = []
  let unregisterStatus: (() => void) | null = null

  const handleEvent = async (data: Record<string, unknown>): Promise<void> => {
    if (!bot || !adapterContext) return
    const identity = {
      adapter: adapterName,
      bot_id: bot.bot_id,
      event_type: typeof data.post_type === 'string' ? data.post_type : 'unknown',
      message_id: typeof data.message_id === 'number' || typeof data.message_id === 'string'
        ? asMessageId(data.message_id)
        : undefined,
      timestamp: typeof data.time === 'number' ? data.time * 1000 : undefined,
    }
    if (dedup.isDuplicate(identity)) return

    if (data.post_type === 'message') {
      await adapterContext.dispatch(buildMessageEvent({
        adapter: adapterName,
        bot,
        data: data as Parameters<typeof buildMessageEvent>[0]['data'],
      }))
      return
    }
    if (data.post_type === 'message_sent') {
      await adapterContext.dispatch(buildMessageEvent({
        adapter: adapterName,
        bot,
        data: data as Parameters<typeof buildMessageEvent>[0]['data'],
      }))
      return
    }
    if (data.post_type === 'notice') {
      const mapped = buildNoticeFromOneBot(data)
      const enriched: Record<string, unknown> = {
        ...data,
        notice_type: mapped.notice_type,
        sub_type: mapped.sub_type ?? data.sub_type,
        action_type: mapped.action_type ?? data.action_type,
      }
      await adapterContext.dispatch(buildNoticeEvent({
        adapter: adapterName,
        bot,
        data: enriched as Parameters<typeof buildNoticeEvent>[0]['data'],
      }))
      return
    }
    if (data.post_type === 'request') {
      await adapterContext.dispatch(buildRequestEvent({
        adapter: adapterName,
        bot,
        api: gateway!.call,
        data: data as Parameters<typeof buildRequestEvent>[0]['data'],
      }))
      return
    }
    if (data.post_type === 'meta_event') {
      await adapterContext.dispatch(buildMetaEvent({
        adapter: adapterName,
        bot,
        data: data as Parameters<typeof buildMetaEvent>[0]['data'],
      }))
      return
    }
  }

  const registerBotCapabilities = (ctx: AdapterContext, currentBot: NapCatBot): void => {
    unregisterBot = ctx.registerBot(currentBot).unregister
    unregisterCapabilities = [
      ctx.registerCapability(messageSend, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) =>
        currentBot.sendMessage(req.target, req.message),
      ),
      ctx.registerCapability(messageRecall, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.recallMessage(req.message_id)
      }),
      ctx.registerCapability(messageReaction, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        if (req.set) await currentBot.addReaction(req.message_id, req.reaction_id)
        else await currentBot.removeReaction(req.message_id, req.reaction_id)
      }),
    ]
  }

  const ensureBot = async (): Promise<void> => {
    if (!adapterContext || !gateway) throw new Error('NapCat adapter is not initialized')
    const loginInfo = await gateway.call<{ user_id: number | string; nickname: string }>('get_login_info')
    let appName = ''
    let appVersion = ''
    try {
      const versionInfo = await gateway.call<{ app_name: string; app_version: string }>('get_version_info')
      appName = versionInfo.app_name
      appVersion = versionInfo.app_version
    } catch {
      // ignore
    }
    botData.bot_id = asBotId(loginInfo.user_id)
    botData.nickname = loginInfo.nickname
    botData.connected_at = Date.now()
    if (!bot) {
      bot = createNapCatBot({ data: botData, api: gateway.call, logger })
      registerBotCapabilities(adapterContext, bot)
    }
    if (!botData.online) {
      botData.online = true
      logger.info(
        `已连接到 ${colors.cyan(botLabel)}: ${colors.green(`${appName}-v${appVersion} ${loginInfo.nickname}(${botData.bot_id})`)}`,
      )
      await adapterContext.emitLifecycle({ type: 'bot:connected', bot })
    }
  }

  const handleLifecycleFromMeta = async (data: Record<string, unknown>): Promise<void> => {
    if (data.post_type !== 'meta_event' || data.meta_event_type !== 'lifecycle' || data.sub_type !== 'connect') return
    try {
      await ensureBot()
    } catch (err) {
      logger.warn(`Lifecycle connect handler failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleConnect = async (_connection: WebSocketConnection): Promise<void> => {
    await ensureBot()
  }

  const handleClose = async (): Promise<void> => {
    if (bot && botData.online) {
      botData.online = false
      await adapterContext?.emitLifecycle({ type: 'bot:disconnected', bot, reason: 'connection closed' })
    }
  }

  return {
    name: adapterName,
    version: '1.0.0',
    async start(context: AdapterContext): Promise<void> {
      adapterContext = context
      const driver = context.getDriver()
      logger.info(`>>> 正在连接 ${colors.cyan(botLabel)}: ${colors.green(maskedUrl)}`)
      const handlers = {
        async onMessage(payload: unknown): Promise<void> {
          if (!payload || typeof payload !== 'object') return
          const obj = payload as Record<string, unknown>
          if (obj.post_type === 'meta_event') {
            await handleLifecycleFromMeta(obj)
          }
          await handleEvent(obj)
        },
        onOpen(connection: WebSocketConnection): Promise<void> {
          return handleConnect(connection)
        },
        onClose(code: number, reason: string): Promise<void> {
          logger.warn(`NapCat WS closed (code=${code}, reason=${reason})`)
          return handleClose()
        },
        onError(err: Error): Promise<void> {
          logger.error(`NapCat WS error: ${err.message}`)
          return Promise.resolve()
        },
      }
      gateway = new NapCatWebSocketGateway(
        {
          name: gatewayName,
          url,
          ws: driver.websocket,
          logger,
          reconnect: instance.reconnect ?? DEFAULT_INSTANCE.reconnect,
          reconnectInterval: instance.reconnectInterval ?? DEFAULT_INSTANCE.reconnectInterval,
          maxReconnectAttempts: instance.maxReconnectAttempts ?? DEFAULT_INSTANCE.maxReconnectAttempts,
          maxReconnectInterval: instance.maxReconnectInterval ?? DEFAULT_INSTANCE.maxReconnectInterval,
          headers: instance.headers,
        },
        handlers,
      )
      const statusProvider = createNapCatStatusProvider()
      unregisterStatus = registerStatusProvider(adapterName, ({ bot: currentBot }: { bot: Bot }) =>
        statusProvider({ bot: currentBot as NapCatBot }),
      )
      context.registerGateway(gateway)
    },
    async stop(reason?: string): Promise<void> {
      if (bot && botData.online) {
        botData.online = false
        try {
          await adapterContext?.emitLifecycle({ type: 'bot:disconnected', bot, reason: reason ?? 'stop' })
        } catch (err) {
          logger.warn(`Failed to emit bot:disconnected: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      if (gateway) {
        await gateway.stop(reason)
        gateway = null
      }
      unregisterStatus?.()
      unregisterStatus = null
      for (const dispose of unregisterCapabilities) dispose()
      unregisterCapabilities = []
      unregisterBot?.()
      unregisterBot = null
      bot = null
      dedup.clear()
    },
  }
}

const ADAPTER_NAME = 'napcat' as AdapterName

export const napcatAdapterDefinition = defineAdapter<NapCatAdapterConfig>({
  name: ADAPTER_NAME,
  version: '1.0.0',
  apiVersion: 1,
  validateConfig: (config): NapCatAdapterConfig => {
    const instances = normalizeInstances(config)
    if (instances.length === 0) {
      throw new Error('napcat.instances must contain at least one instance')
    }
    return { instances: instances.map((instance) => ({ ...DEFAULT_INSTANCE, ...instance })) }
  },
  create: (options: AdapterFactoryOptions<NapCatAdapterConfig>): Adapter => {
    const instances = [...options.config.instances]
    const adapters = instances.map((instance, index) =>
      buildAdapter(instance, ADAPTER_NAME, options.logger, `${ADAPTER_NAME}.gateway.${index + 1}`, `Bot${index + 1}`),
    )
    return {
      name: ADAPTER_NAME,
      version: '1.0.0',
      async start(context: AdapterContext): Promise<void> {
        for (const adapter of adapters) {
          await adapter.start(context)
        }
      },
      async stop(reason?: string): Promise<void> {
        for (let i = adapters.length - 1; i >= 0; i--) {
          await adapters[i].stop(reason)
        }
      },
    }
  },
})

export { buildNoticeFromOneBot }
export type { Event, Capability }
