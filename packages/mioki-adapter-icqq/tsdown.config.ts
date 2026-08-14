import { defineConfig, type UserConfig } from 'tsdown'

const config: UserConfig = defineConfig({
  target: 'node24',
  entry: { index: 'src/index.ts' },
  tsconfig: './tsconfig.json',
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  treeshake: true,
  failOnWarn: false,
  cjsDefault: true,
  external: [/^mioki-adapter-icqq(\/|$)/],
})

export default config
