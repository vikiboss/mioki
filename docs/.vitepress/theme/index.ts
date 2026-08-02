// oxlint-disable-next-line triple-slash-reference
/// <reference path="../global.d.ts" />

// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import StoreRegistry from '../components/StoreRegistry.vue'

import './style.css'

import type { Theme } from 'vitepress'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
    })
  },
  enhanceApp({ app }) {
    app.component('StoreRegistry', StoreRegistry)
  },
} satisfies Theme
