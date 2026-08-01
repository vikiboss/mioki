export type BotId = string & { readonly __brand: 'BotId' }
export type UserId = string & { readonly __brand: 'UserId' }
export type GroupId = string & { readonly __brand: 'GroupId' }
export type ChannelId = string & { readonly __brand: 'ChannelId' }
export type MessageId = string & { readonly __brand: 'MessageId' }
export type RequestId = string & { readonly __brand: 'RequestId' }
export type AdapterName = string & { readonly __brand: 'AdapterName' }
export type PluginName = string & { readonly __brand: 'PluginName' }

export interface AdapterStatus {
  readonly adapter: AdapterName
  readonly version?: string
  readonly data: Readonly<Record<string, unknown>>
}

export const asBotId = (value: string | number | bigint): BotId => String(value) as BotId
export const asUserId = (value: string | number | bigint): UserId => String(value) as UserId
export const asGroupId = (value: string | number | bigint): GroupId => String(value) as GroupId
export const asChannelId = (value: string | number | bigint): ChannelId => String(value) as ChannelId
export const asMessageId = (value: string | number | bigint): MessageId => String(value) as MessageId
export const asRequestId = (value: string | number | bigint): RequestId => String(value) as RequestId
export const asAdapterName = (value: string): AdapterName => value as AdapterName
export const asPluginName = (value: string): PluginName => value as PluginName

export interface BotRef {
  readonly adapter: AdapterName
  readonly bot_id: BotId
}

export const botRefKey = (ref: BotRef): string => `${ref.adapter}:${ref.bot_id}`
