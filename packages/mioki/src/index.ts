import { NapCat, segment } from 'napcat-sdk'
import { MIOKI_LOGGER } from './logger.ts'

const napcat = new NapCat({
  logger: MIOKI_LOGGER,
  token: 'cdc93b212524c0c0a0a162f1edec347a',
})

napcat.on('message.private', async (e) => {
  if (e.raw_message === 'hello') {
    await e.reply(['Hello, Mioki!', segment.face(175)])
  }
})

await napcat.bootstrap()
