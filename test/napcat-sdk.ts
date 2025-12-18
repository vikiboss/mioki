// import process from 'node:process'
import { NapCat } from 'napcat-sdk'

const napcat = new NapCat({
  token: 'cdc93b212524c0c0a0a162f1edec347a',
})

napcat.on('ws.open', async () => {
  console.log('ws opened')
  const group = await napcat.pickGroup(608391254)
  console.log('group info:', group)

  const friend = await napcat.pickFriend(1141284758)
  console.log('friend info:', friend)
})

napcat.on('message.group', async (e) => {
  console.log('[message]', JSON.stringify(e))

  if (e.raw_message === 'ping') {
    return await e.reply('pong', true)
  }

  if (e.raw_message === 'reaction') {
    return e.addReaction('66')
  }

  if (e.raw_message === 'recall') {
    return await e.recall()
  }

  if (e.raw_message === 'hi') {
    await e.reply(napcat.segment.face(14))
  }
})

await napcat.run()
