// import process from 'node:process'
import { NapCat } from 'napcat-sdk'

const napcat = new NapCat({
  // token for local ws test, it's safe to expose in public
  token: 'cdc93b212524c0c0a0a162f1edec347a',
})

napcat.on('message', async (e) => {
  console.log('[message]', JSON.stringify(e))

  if (e.raw_message === 'hi') {
    await e.reply(napcat.segment.face(14))
  }
})

await napcat.bootstrap()
