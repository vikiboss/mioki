import createPino from 'pino'

import type { Logger } from 'napcat-sdk'

const pino = createPino({
  level: 'trace',
  name: 'mioki',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
})

export const MIOKI_LOGGER: Logger = pino
