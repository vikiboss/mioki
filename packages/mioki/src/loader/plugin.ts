import { pathToFileURL } from 'node:url'
import type { Jiti } from 'jiti'

import type { MiokiPlugin } from '../plugin'
import type { PluginCandidate } from './package'
import { resolveEntry, resolveLocalPluginEntry } from './package'

export const isMiokiPlugin = (value: unknown): value is MiokiPlugin => {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<MiokiPlugin>
  return typeof v.name === 'string' && (v.setup === undefined || typeof v.setup === 'function')
}

const loadFromEntry = async (jiti: Jiti, entry: string, name: string): Promise<MiokiPlugin> => {
  const mod = await jiti.import(pathToFileURL(entry).href)
  const exported = (mod as { default?: unknown }).default ?? mod
  if (!isMiokiPlugin(exported)) {
    throw new Error(`Plugin "${name}" does not export a valid MiokiPlugin (need "name" and optional "setup")`)
  }
  if (exported.name !== name) {
    throw new Error(
      `Plugin canonical ID mismatch: manifest="${name}" export="${exported.name}". Ensure plugin.name matches the manifest`,
    )
  }
  return exported
}

export const loadNpmPlugin = async (
  jiti: Jiti,
  candidate: PluginCandidate,
): Promise<MiokiPlugin> => {
  const entry = resolveEntry(candidate.resolvedPath, candidate.packageJson, candidate.entry)
  if (!entry) {
    throw new Error(`Plugin "${candidate.name}" has no resolvable entry point`)
  }
  return await loadFromEntry(jiti, entry, candidate.name)
}

export const loadLocalPlugin = async (
  jiti: Jiti,
  name: string,
  resolvedPath: string,
): Promise<MiokiPlugin> => {
  const entry = resolveLocalPluginEntry(resolvedPath)
  if (!entry) {
    throw new Error(`Local plugin "${name}" has no entry point`)
  }
  return await loadFromEntry(jiti, entry, name)
}