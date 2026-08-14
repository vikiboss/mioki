import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { Client } from 'mioki-adapter-icqq/vendor/icqq'

import type { Logger } from 'mioki'

const HOST = '127.0.0.1'
const PORT = 0

const createHtmlPage = (label: string, mode: 'slider' | 'device'): string => `
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${label} 验证提交</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 48px auto; padding: 0 16px; color: #222; }
  h1 { font-size: 18px; }
  input { display: block; width: 100%; box-sizing: border-box; padding: 8px; margin: 8px 0 16px; font-size: 14px; }
  button { padding: 10px 24px; font-size: 14px; cursor: pointer; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  #status { margin-top: 16px; color: #1a7f37; }
  #status.error { color: #d1242f; }
</style>
</head>
<body>
  <h1>${mode === 'slider' ? '滑块验证' : '设备锁验证'}（${label}）</h1>
  <p>${
    mode === 'slider'
      ? '在浏览器完成滑块后，将地址栏跳转 URL 中 <b>ticket</b> 参数的值填入下方（若跳转 URL 同时含 <b>randstr</b>，则用英文逗号拼接为 <b>ticket,randstr</b>）。'
      : '填写设备锁短信验证码（已发送短信）。'
  }</p>
  <input id="input" placeholder="${mode === 'slider' ? 'ticket[,randstr]' : '验证码'}" autocomplete="off">
  <button id="btn" onclick="submit()">提交</button>
  <div id="status"></div>
  <script>
    let submitting = false
    async function submit() {
      const input = document.getElementById('input')
      const status = document.getElementById('status')
      const btn = document.getElementById('btn')
      const value = input.value.trim()
      if (!value) { status.textContent = '请输入内容'; status.className = 'error'; return }
      if (submitting) return
      submitting = true
      btn.disabled = true
      status.textContent = '提交中…'; status.className = ''
      try {
        const res = await fetch('/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value }) })
        const data = await res.json()
        status.textContent = data.ok ? '已提交，请返回机器人终端查看结果' : data.error
        status.className = data.ok ? '' : 'error'
      } catch (err) {
        status.textContent = '网络错误，请重试'; status.className = 'error'
      } finally {
        submitting = false
        btn.disabled = false
      }
    }
  </script>
</body>
</html>
`

const startServer = (
  label: string,
  mode: 'slider' | 'device',
): Promise<{
  port: number
  onSubmit: (handler: (value: string) => void) => void
  close: () => void
}> =>
  new Promise((resolve) => {
    let submitHandler: ((value: string) => void) | undefined
    const server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/submit') {
        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf-8')
        })
        req.on('end', () => {
          let value = ''
          try {
            value = (JSON.parse(body || '{}') as { value?: string }).value ?? ''
          } catch {
            // 非 JSON 请求体，忽略
          }
          if (value && submitHandler) submitHandler(value)
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: Boolean(value) }))
        })
        return
      }
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(createHtmlPage(label, mode))
    })
    server.unref()
    server.listen(PORT, HOST, () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        onSubmit: (handler) => {
          submitHandler = handler
        },
        close: () => server.close(),
      })
    })
  })

export const createCaptchaHandler = (params: {
  client: Client
  logger: Logger
  label: string
}): {
  handleSlider: (event: { url: string }) => Promise<void>
  handleDeviceLock: (event: { url: string; phone: string }) => Promise<void>
} => {
  const { client, logger, label } = params
  return {
    async handleSlider(event) {
      logger.warn(`${label} 需要滑动验证码，请打开以下链接完成滑块：`)
      logger.warn(event.url)
      const server = await startServer(label, 'slider')
      const url = `http://${HOST}:${server.port}`
      logger.warn(`完成滑块后，请打开 ${url} 提交 ticket[,randstr]`)
      server.onSubmit(async (value) => {
        try {
          await client.submitSlider(value.trim())
          logger.info(`滑块验证已提交`)
          server.close()
        } catch (err) {
          logger.warn(`滑块验证提交失败: ${err instanceof Error ? err.message : String(err)}`)
        }
      })
    },
    async handleDeviceLock(event) {
      logger.warn(`${label} 需要设备锁验证，请打开链接验证：`)
      logger.warn(event.url)
      const server = await startServer(label, 'device')
      const url = `http://${HOST}:${server.port}`
      try {
        await client.sendSmsCode()
        logger.warn(`已向 ${event.phone} 发送短信验证码，打开 ${url} 提交`)
      } catch (err) {
        logger.warn(`短信验证码发送失败: ${err instanceof Error ? err.message : String(err)}`)
      }
      server.onSubmit(async (value) => {
        try {
          await client.submitSmsCode(value.trim())
          logger.info(`设备锁验证码已提交`)
          server.close()
        } catch (err) {
          logger.warn(`设备锁验证码提交失败: ${err instanceof Error ? err.message : String(err)}`)
        }
      })
    },
  }
}
