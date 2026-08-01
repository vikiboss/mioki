import core from './core'

import type { MiokiPlugin } from '../plugin'

export const BUILTIN_PLUGINS: readonly MiokiPlugin[] = [core]

export * from './core'
