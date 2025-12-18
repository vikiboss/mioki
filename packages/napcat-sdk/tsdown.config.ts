import { defineConfig, type UserConfig } from 'tsdown'

const config: UserConfig = defineConfig({
  entry: ['./src/index.ts'],
  dts: true,
  sourcemap: true,
  target: 'node24',
  treeshake: true,
  tsconfig: './tsconfig.json',
  format: ['cjs', 'esm'],
  failOnWarn: false,
  cjsDefault: true,
})

export default config
