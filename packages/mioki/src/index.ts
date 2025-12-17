import { NapCat } from 'napcat-sdk'
import { MIOKI_LOGGER } from './logger'

const napcat = new NapCat({
  logger: MIOKI_LOGGER,
  // token for local ws test, it's safe to expose in public
  token: 'cdc93b212524c0c0a0a162f1edec347a',
})

napcat.on('message.private', async (e) => {
  if (e.raw_message === 'hello') {
    await e.reply(['Hello, Mioki!', napcat.segment.face(175)])
  }
})

await napcat.bootstrap()
