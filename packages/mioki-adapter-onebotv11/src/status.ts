import { asAdapterName } from 'mioki'

import type { AdapterStatus } from 'mioki'
import type { OneBotBot } from './bot'

export const createOneBotStatusProvider = (
  getStats: () => { send: number; receive: number } = () => ({ send: 0, receive: 0 }),
): ((ctx: { bot: OneBotBot }) => Promise<AdapterStatus>) => {
  return async ({ bot }) => {
    try {
      const [versionInfo, friendList, groupList] = await Promise.all([
        bot.getVersionInfo(),
        bot.getFriendList(),
        bot.getGroupList(),
      ])
      const stats = getStats()
      return {
        adapter: asAdapterName('onebotv11'),
        version: versionInfo.app_version,
        data: {
          app_name: versionInfo.app_name,
          protocol_version: versionInfo.protocol_version,
          friends: friendList.length,
          groups: groupList.length,
          send: stats.send,
          receive: stats.receive,
        },
      }
    } catch {
      return { adapter: asAdapterName('onebotv11'), data: {} }
    }
  }
}
