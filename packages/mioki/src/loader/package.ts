import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import type { AdapterDefinition } from '../adapter'

export interface PackageJson {
  readonly name?: string
  readonly main?: string
  readonly module?: string
  readonly exports?: unknown
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly mioki?: {
    readonly type?: 'plugin' | 'adapter'
    readonly name?: string
    readonly apiVersion?: number
    readonly entry?: string
    readonly priority?: number
    readonly description?: string
    readonly plugins?: readonly string[]
  }
  readonly keywords?: readonly string[]
}

export interface PackageCandidate {
  readonly name: string
  readonly resolvedPath: string
  readonly packageJson: PackageJson
}

export interface AdapterCandidate {
  readonly name: string
  readonly packageName: string
  readonly resolvedPath: string
  readonly packageJson: PackageJson
  readonly apiVersion: number
  readonly entry?: string
  readonly description?: string
}

export interface PluginCandidate {
  readonly name: string
  readonly packageName: string
  readonly resolvedPath: string
  readonly packageJson: PackageJson
  readonly apiVersion: number
  readonly priority?: number
  readonly entry?: string
  readonly description?: string
}

const KNOWN_ENTRY_FALLBACKS = ['dist/index.mjs', 'dist/index.js', 'dist/index.cjs', 'index.mjs', 'index.js']

export const readPackageJsonSafe = (dir: string): PackageJson | null => {
  const file = path.join(dir, 'package.json')
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as PackageJson
  } catch {
    return null
  }
}

const resolveFromCwd = (cwd: string, name: string): string | null => {
  const require = createRequire(pathToFileURL(path.join(cwd, 'package.json')).href)
  try {
    const entry = require.resolve(`${name}/package.json`)
    return path.dirname(entry)
  } catch {
    return null
  }
}

const collectDirectDependencyNames = (pkg: PackageJson): readonly string[] => {
  const set = new Set<string>()
  for (const map of [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies]) {
    if (!map) continue
    for (const key of Object.keys(map)) set.add(key)
  }
  return Array.from(set)
}

export const resolveEntry = (dir: string, pkg: PackageJson, override?: string): string | null => {
  if (override) {
    const abs = path.resolve(dir, override)
    if (fs.existsSync(abs)) return abs
  }
  const candidates: string[] = []
  if (typeof pkg.main === 'string') candidates.push(pkg.main)
  if (typeof pkg.module === 'string' && !candidates.includes(pkg.module)) candidates.push(pkg.module)
  if (typeof pkg.exports === 'string') candidates.push(pkg.exports)
  if (typeof pkg.exports === 'object' && pkg.exports) {
    const exportMap = pkg.exports as Record<string, unknown>
    const mainExport = exportMap['.']
    if (typeof mainExport === 'string') candidates.push(mainExport)
    if (typeof mainExport === 'object' && mainExport) {
      const nodeExport = (mainExport as Record<string, unknown>)['import'] ?? (mainExport as Record<string, unknown>)['default']
      if (typeof nodeExport === 'string') candidates.push(nodeExport)
    }
  }
  for (const candidate of candidates) {
    const abs = path.resolve(dir, candidate)
    if (fs.existsSync(abs)) return abs
  }
  for (const fallback of KNOWN_ENTRY_FALLBACKS) {
    const abs = path.join(dir, fallback)
    if (fs.existsSync(abs)) return abs
  }
  return null
}

export const discoverAdapterCandidates = (cwd: string, appPackageJson: PackageJson): readonly AdapterCandidate[] => {
  const deps = collectDirectDependencyNames(appPackageJson)
  const seen = new Set<string>()
  const candidates: AdapterCandidate[] = []
  for (const dep of deps) {
    const dir = resolveFromCwd(cwd, dep)
    if (!dir) continue
    const pkg = readPackageJsonSafe(dir)
    if (!pkg?.mioki || pkg.mioki.type !== 'adapter') continue
    if (!pkg.mioki.name) continue
    const adapterName = pkg.mioki.name as string
    if (seen.has(adapterName)) {
      throw new Error(`Adapter name conflict: "${adapterName}" appears in multiple direct dependencies`)
    }
    seen.add(adapterName)
    candidates.push({
      name: adapterName,
      packageName: dep,
      resolvedPath: dir,
      packageJson: pkg,
      apiVersion: pkg.mioki.apiVersion ?? 1,
      entry: pkg.mioki.entry,
      description: pkg.mioki.description,
    })
  }
  return candidates
}

export const discoverPluginCandidates = (cwd: string, appPackageJson: PackageJson): readonly PluginCandidate[] => {
  const deps = collectDirectDependencyNames(appPackageJson)
  const seen = new Set<string>()
  const candidates: PluginCandidate[] = []
  for (const dep of deps) {
    const dir = resolveFromCwd(cwd, dep)
    if (!dir) continue
    const pkg = readPackageJsonSafe(dir)
    if (!pkg?.mioki || pkg.mioki.type !== 'plugin') continue
    const pluginName = (pkg.mioki.name ?? pkg.name ?? dep) as string
    if (seen.has(pluginName)) {
      throw new Error(`Plugin canonical ID conflict: "${pluginName}" appears in multiple direct dependencies`)
    }
    seen.add(pluginName)
    candidates.push({
      name: pluginName,
      packageName: dep,
      resolvedPath: dir,
      packageJson: pkg,
      apiVersion: pkg.mioki.apiVersion ?? 1,
      priority: pkg.mioki.priority,
      entry: pkg.mioki.entry,
      description: pkg.mioki.description,
    })
  }
  return candidates
}

export const resolveLocalPluginPath = (cwd: string, pluginsDir: string, name: string): string | null => {
  const root = path.resolve(cwd, pluginsDir)
  if (!fs.existsSync(root)) return null
  const candidate = path.join(root, name)
  if (!fs.existsSync(candidate)) return null
  return candidate
}

export const resolveLocalPluginEntry = (dir: string): string | null => {
  const pkg = readPackageJsonSafe(dir)
  if (pkg?.mioki?.entry) {
    const override = path.resolve(dir, pkg.mioki.entry)
    if (fs.existsSync(override)) return override
  }
  const indexTs = path.join(dir, 'index.ts')
  if (fs.existsSync(indexTs)) return indexTs
  const candidates: string[] = []
  if (pkg?.main) candidates.push(pkg.main)
  if (pkg?.module && !candidates.includes(pkg.module)) candidates.push(pkg.module)
  candidates.push('index.js', 'index.cjs', 'index.mjs')
  for (const candidate of candidates) {
    const abs = path.resolve(dir, candidate)
    if (fs.existsSync(abs)) return abs
  }
  return null
}

export const findLocalPlugins = (cwd: string, pluginsDir: string): readonly { name: string; absPath: string }[] => {
  const root = path.resolve(cwd, pluginsDir)
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !!entry.name && !entry.name.startsWith('_'))
    .map((entry) => ({
      name: entry.name,
      absPath: path.join(root, entry.name),
    }))
}

export interface LoadedAdapterDefinition {
  readonly candidate: AdapterCandidate
  readonly definition: AdapterDefinition<unknown>
}

export interface LoadedPluginDefinition {
  readonly candidate: PluginCandidate | { name: string; resolvedPath: string; entry: string; packageJson: PackageJson }
  readonly module: unknown
}
