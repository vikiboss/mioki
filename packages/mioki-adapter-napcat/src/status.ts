import { asAdapterName } from 'mioki'

import type { AdapterStatus } from 'mioki'
import type { NapCatBot } from './bot'

export const createNapCatStatusProvider = (): ((ctx: { bot: NapCatBot }) => Promise<AdapterStatus>) => {
  return async ({ bot }) => {
    try {
      const [versionInfo, friendList, groupList] = await Promise.all([
        bot.getVersionInfo(),
        bot.getFriendList(),
        bot.getGroupList(),
      ])
      return {
        adapter: asAdapterName('napcat'),
        version: versionInfo.app_version,
        data: {
          app_name: versionInfo.app_name,
          protocol_version: versionInfo.protocol_version,
          friends: friendList.length,
          groups: groupList.length,
        },
      }
    } catch {
      return { adapter: asAdapterName('napcat'), data: {} }
    }
  }
}
