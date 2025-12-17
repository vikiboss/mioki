import { NapCat } from 'napcat-sdk'
import { MIOKI_LOGGER } from './logger.ts'

const mioki = new NapCat({
  logger: MIOKI_LOGGER,
  token: 'cdc93b212524c0c0a0a162f1edec347a',
})

await mioki.bootstrap()
