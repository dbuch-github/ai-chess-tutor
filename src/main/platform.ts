import { existsSync, statSync } from 'node:fs'
import { join, win32, posix } from 'node:path'
import { platformInfo } from '../shared/platform.mjs'

export function engineResourceDir(packaged: boolean, resourcesPath: string, projectRoot: string): string {
  return packaged ? join(resourcesPath, 'engines') : join(projectRoot, 'resources', 'engines', platformInfo().id)
}

export function engineCandidates(name: string, resourceDir: string, platform = process.platform, searchPath = process.env.PATH ?? ''): string[] {
  if (!['stockfish', 'lc0'].includes(name)) return []
  const paths = platform === 'win32' ? win32 : posix
  const filename = name + (platform === 'win32' ? '.exe' : '')
  const systemDirs = platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']
    : platform === 'linux' ? ['/usr/local/bin', '/usr/bin', '/usr/games'] : []
  const dirs = [resourceDir, ...systemDirs, ...searchPath.split(platform === 'win32' ? ';' : ':')]
  return [...new Set(dirs.map(dir => dir.replace(/^"|"$/g, '')).filter(Boolean).map(dir => paths.join(dir, filename)))]
}

export function findEngine(name: string, resourceDir: string): string | null {
  return engineCandidates(name, resourceDir).find(file => {
    try { return existsSync(file) && statSync(file).isFile() } catch { return false }
  }) ?? null
}
