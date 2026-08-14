import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { createJiti, type Jiti } from 'jiti'

import type { AdapterDefinition } from '../adapter'
import type { AdapterCandidate, LoadedAdapterDefinition, PackageJson } from './package'
import { resolveEntry } from './package'

const isAdapterDefinition = (value: unknown): value is AdapterDefinition<unknown> => {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<AdapterDefinition<unknown>>
  return typeof v.name === 'string' && typeof v.version === 'string' && typeof v.apiVersion === 'number' && typeof v.create === 'function'
}

const readDependencyNames = (cwd: string): string[] => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')) as PackageJson
    return [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ]
  } catch {
    return []
  }
}

const resolveAliases = (cwd: string): Record<string, string> => {
  const require = createRequire(path.join(cwd, 'package.json'))
  const aliases: Record<string, string> = {}
  for (const name of readDependencyNames(cwd)) {
    try {
      aliases[name] = require.resolve(name)
    } catch {
      // 忽略无法解析的依赖
    }
  }
  return aliases
}

export const createImportContext = (cwd: string): Jiti => {
  return createJiti(cwd, {
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx'],
    cache: false,
    fsCache: false,
    moduleCache: false,
    requireCache: false,
    sourceMaps: false,
    interopDefault: true,
    jsx: { importSource: 'react', runtime: 'automatic' },
    alias: resolveAliases(cwd),
  })
}

export const loadAdapterDefinition = async (
  jiti: Jiti,
  candidate: AdapterCandidate,
): Promise<LoadedAdapterDefinition> => {
  const entry = resolveEntry(candidate.resolvedPath, candidate.packageJson as PackageJson, candidate.entry)
  if (!entry) {
    throw new Error(`Adapter "${candidate.name}" has no resolvable entry point`)
  }
  const mod = await jiti.import(pathToFileURL(entry).href)
  const exported = (mod as { default?: unknown }).default ?? mod
  if (!isAdapterDefinition(exported)) {
    throw new Error(`Adapter "${candidate.name}" does not export a valid AdapterDefinition`)
  }
  if (exported.name !== candidate.name) {
    throw new Error(`Adapter name mismatch: manifest="${candidate.name}" export="${exported.name}"`)
  }
  if (exported.apiVersion !== candidate.apiVersion) {
    throw new Error(
      `Adapter "${candidate.name}" apiVersion mismatch: manifest=${candidate.apiVersion} export=${exported.apiVersion}`,
    )
  }
  return { candidate, definition: exported }
}