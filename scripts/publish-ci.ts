import pkg from '../package.json' with { type: 'json' }
import { execSync } from 'node:child_process'

let command = 'pnpm -r publish --provenance --no-git-checks --access public'

if (pkg.version.includes('beta')) command += ' --tag beta'
if (pkg.version.includes('alpha')) command += ' --tag alpha'

execSync(command, { stdio: 'inherit' })
