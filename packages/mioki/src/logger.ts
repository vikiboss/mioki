import fs from 'node:fs'
import path from 'node:path'
import { dayjs } from './utils'
import { BOT_CWD } from './config'
import { stripAnsi, colors } from 'consola/utils'
import { createConsola, LogLevels, ConsolaInstance } from 'consola/core'

import type { LogLevel } from 'napcat-sdk'

const LEVEL_MAP: Record<number, string> = {
  0: 'FATAL',
  1: 'ERROR',
  2: 'WARN',
  3: 'INFO',
  4: 'DEBUG',
  5: 'TRACE',
}

/**
 * 获取日志文件名
 */
export function getLogFilePath(type: string = ''): string {
  const startTime = dayjs().format('YYYY-MM-DD_HH-mm-ss')
  return path.join(BOT_CWD.value, `logs/${startTime}${type ? '.' + type : ''}.log`)
}

export const getMiokiLogger = (level: LogLevel): ConsolaInstance => {
  const logDir = path.join(BOT_CWD.value, 'logs')

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  const logFile = getLogFilePath()

  return createConsola({
    level: LogLevels[level],
    defaults: {
      tag: 'mioki',
    },
    reporters: [
      {
        log: (logObj) => {
          const message = stripAnsi(logObj.message || logObj.args?.join(' ') || '')
          const prefix = `[${logObj.date.toISOString()}] [${LEVEL_MAP[logObj.level]}] ${logObj.tag ? `[${logObj.tag}] ` : ''}`
          const line = `${prefix}${message}`
          fs.appendFileSync(logFile, line + '\n')
        },
      },
      {
        log: (logObj) => {
          const message = logObj.message || logObj.args?.join(' ') || ''
          const prefix =
            colors.gray(`[${logObj.date.toLocaleString('zh-CN')}]`) +
            ' ' +
            colors.blue(LEVEL_MAP[logObj.level]) +
            ' ' +
            (logObj.tag ? colors.green(`[${logObj.tag}] `) : '')
          const line = `${prefix}${message}`
          console.log(line)
        },
      },
    ],
    formatOptions: {
      colors: true,
      compact: true,
      date: true,
    },
  })
}
