import { defineConfig, type UserConfig } from 'tsdown'

const config: UserConfig = defineConfig({
  target: 'node24',
  entry: ['src/index.ts', 'src/cli.ts'],
  tsconfig: './tsconfig.json',
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  treeshake: true,
  failOnWarn: false,
  cjsDefault: true,
  external: [],
})

export default config