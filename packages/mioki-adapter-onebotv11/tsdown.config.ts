import { defineConfig, type UserConfig } from 'tsdown'

const config: UserConfig = defineConfig({
  target: 'node24',
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  tsconfig: './tsconfig.json',
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  treeshake: true,
  failOnWarn: false,
  cjsDefault: true,
  external: ['mioki', 'napcat-sdk'],
})

export default config
