// import process from 'node:process'
import { NapCat } from 'napcat-sdk'

const napcat = new NapCat({
  // token for local ws test, it's safe to expose in public
  token: 'cdc93b212524c0c0a0a162f1edec347a',
})

napcat.on('ws.open', () => {
  console.log('ws opened')
})

let remove: ((...rest: any[]) => any) | undefined

napcat.on('message.group', async (e) => {
  console.log('[message]', JSON.stringify(e))

  if (e.raw_message === 'ping') {
    return await e.reply('pong', true)
  }

  if (e.raw_message === 'reaction') {
    remove = e.delReaction
    return e.addReaction('66')
  }

  if (e.raw_message === 'remove reaction') {
    return await remove?.('66')
  }

  if (e.raw_message === 'recall') {
    return await e.recall()
  }

  if (e.raw_message === 'hi') {
    await e.reply(napcat.segment.face(14))
  }
})

await napcat.bootstrap()
