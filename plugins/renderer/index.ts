import { definePlugin } from 'mioki'
import { BrowserPool } from './browser-pool'
import { renderReact, renderUrl } from './render'

import type { RenderUrlOptions, RenderReactOptions } from './render'

declare module 'mioki' {
  export interface MiokiServices {
    /** 浏览器池 */
    browserPool?: BrowserPool
    /** 渲染 React 组件 (原生支持异步组件和 use API) */
    renderReact?: <T extends Props>(
      comp: React.FC<T>,
      props?: NoInfer<T>,
      options?: RenderReactOptions,
    ) => Promise<Buffer | null>
    /** 渲染 URL */
    renderUrl?: (url: string, options?: RenderUrlOptions) => Promise<Buffer | null>
  }
}

interface Props extends Record<string, any> {}

const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export default definePlugin({
  name: '渲染器',
  version: '1.2.0',
  priority: 10,
  dependencies: ['puppeteer-core', 'sharp', 'react', 'react-dom', '@types/react', '@types/react-dom'],
  async setup(ctx) {
    const bp = new BrowserPool({
      maxWsEndpoints: 3,
      onReady() {
        ctx.logger.info(`>>> BrowserPool is ready: ${executablePath}`)
      },
      launchOptions: {
        executablePath,
        headless: true,
      },
    })

    ctx.addService('browserPool', bp)

    ctx.addService(
      'renderReact',
      <T extends Props>(comp: React.FC<T>, props: NoInfer<T>, options: RenderReactOptions = {}) => {
        return renderReact(bp, comp, props, options)
      },
    )

    ctx.addService('renderUrl', (url: string, options: RenderUrlOptions = {}) => renderUrl(bp, url, options))

    ctx.handle('message', async (e) => {
      if (!ctx.hasRight(e)) return

      ctx.match(e, {
        '#渲染器状态': () => JSON.stringify(bp.getStatus(), null, 2),
      })
    })

    return async () => {
      await bp.destroy()
    }
  },
})
