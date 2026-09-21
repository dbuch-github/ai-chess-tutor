#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platformInfo } from '../src/shared/platform.mjs'
import { STOCKFISH, LC0_VERSION, LC0_WINDOWS, MAIA_LEVELS, MAIA_BASE_URL } from './engine-sources.mjs'
import { run } from './process.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
export const sha256 = data => createHash('sha256').update(data).digest('hex')

/** Atomic downloads: interrupted files are never mistaken for valid cache entries. */
export async function download(url, destination, expectedHash) {
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) })
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
  const data = Buffer.from(await response.arrayBuffer())
  if (expectedHash && sha256(data) !== expectedHash) throw new Error(`SHA-256 mismatch: ${url}`)
  mkdirSync(dirname(destination), { recursive: true })
  const temporary = destination + '.part'
  try {
    writeFileSync(temporary, data)
    renameSync(temporary, destination)
  } finally { rmSync(temporary, { force: true }) }
}

function filesBelow(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

function extract(archive, destination) {
  mkdirSync(destination, { recursive: true })
  if (archive.endsWith('.zip') && process.platform === 'win32') {
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Expand-Archive -LiteralPath $env:CHESS_ARCHIVE -DestinationPath $env:CHESS_EXTRACT -Force'],
    { env: { ...process.env, CHESS_ARCHIVE: archive, CHESS_EXTRACT: destination } })
  } else run('tar', ['-xf', archive, '-C', destination])
}

function copyLicense(files, destination) {
  const license = files.find(file => /^(copying|license)(\..*)?$/i.test(basename(file)))
  if (!license) throw new Error(`No upstream license found for ${destination}`)
  copyFileSync(license, destination)
}

function makeExecutable(target, binary) {
  if (target.platform !== 'win32') chmodSync(binary, 0o755)
}

/** Guards against a cached (or manually swapped) lc0 binary that now depends on
 *  non-system libraries – must run on every invocation, not only after a fresh
 *  download, since a stale cache stamp would otherwise never be re-checked. */
function verifyMacSystemLinkage(binary) {
  const linked = execFileSync('otool', ['-L', binary], { encoding: 'utf8' })
  if (linked.split('\n').slice(1).some(line => line.trim() && !/^\s*\/(System\/Library|usr\/lib)\//.test(line))) {
    throw new Error('lc0 links non-system macOS libraries; bundle those before distributing.')
  }
}

async function stockfish(target, out, work) {
  const source = STOCKFISH[target.id]
  const stamp = join(out, 'stockfish-source.json')
  const binary = join(out, 'stockfish' + target.suffix)
  if (cached(stamp, source.sha256, [binary, join(out, 'stockfish-LICENSE.txt')])) return
  console.log('[stockfish] downloading sf_19 for', target.id)
  const archive = join(work, source.archive)
  await download(source.url, archive, source.sha256)
  const extracted = join(work, 'stockfish')
  extract(archive, extracted)
  const files = filesBelow(extracted)
  const expectedName = source.archive.replace(/\.tar\.gz$|\.zip$/, '') + target.suffix
  const sourceBinary = files.find(file => basename(file) === expectedName)
  if (!sourceBinary) throw new Error(`Missing binary in archive: ${expectedName}`)
  // Keep upstream universal dispatch; it chooses instructions supported by the CPU.
  copyFileSync(sourceBinary, binary)
  makeExecutable(target, binary)
  copyLicense(files, join(out, 'stockfish-LICENSE.txt'))
  writeFileSync(stamp, JSON.stringify({ source: source.sha256 }))
}

function cached(stamp, source, required) {
  try { return JSON.parse(readFileSync(stamp, 'utf8')).source === source && required.every(existsSync) }
  catch { return false }
}

async function lc0(target, out, work) {
  const binary = join(out, 'lc0' + target.suffix)
  const license = join(out, 'lc0-LICENSE.txt')
  const stamp = join(out, 'lc0-source.json')
  const source = target.platform === 'win32' ? LC0_WINDOWS.sha256 : `v${LC0_VERSION}-${target.id}-cpu-v1`
  const required = [binary, license]
  if (target.platform === 'win32') {
    required.push(...['libopenblas.dll', 'mimalloc-override.dll', 'mimalloc-redirect.dll'].map(name => join(out, name)))
  }
  if (target.platform === 'linux') required.push(join(out, 'lc0-source.tar.gz'))
  if (!cached(stamp, source, required)) {
    if (target.platform === 'win32') {
      const archive = join(work, 'lc0.zip')
      await download(LC0_WINDOWS.url, archive, LC0_WINDOWS.sha256)
      const extracted = join(work, 'lc0')
      extract(archive, extracted)
      const files = filesBelow(extracted)
      const sourceBinary = files.find(file => basename(file).toLowerCase() === 'lc0.exe')
      if (!sourceBinary) throw new Error('lc0.exe missing from upstream archive')
      // Include DLLs and supporting files next to the executable, not only lc0.exe.
      cpSync(dirname(sourceBinary), out, { recursive: true })
      copyLicense(files, license)
    } else if (target.platform === 'darwin') {
      // The existing Homebrew Metal build only links to macOS system frameworks.
      const prefix = execFileSync('brew', ['--prefix', 'lc0'], { encoding: 'utf8' }).trim()
      const sourceBinary = join(prefix, 'libexec', 'lc0')
      // Version also appears on stderr on some lc0 builds; inspect brew's installed version.
      const installed = execFileSync('brew', ['list', '--versions', 'lc0'], { encoding: 'utf8' }).trim()
      if (!installed.split(/\s+/).some(v => v === LC0_VERSION || v.startsWith(LC0_VERSION + '_'))) {
        throw new Error(`Expected Homebrew lc0 ${LC0_VERSION}; found ${installed}. Update the shared engine version deliberately.`)
      }
      copyFileSync(sourceBinary, binary)
      copyLicense(filesBelow(prefix).filter(file => !file.includes('/share/')), license)
    } else {
      console.log('[lc0] building pinned CPU backend; this can take several minutes')
      const sourceDir = join(work, 'lc0-source')
      run('git', ['clone', '--branch', `v${LC0_VERSION}`, '--depth', '1', '--recurse-submodules',
        'https://github.com/LeelaChessZero/lc0.git', sourceDir])
      run('meson', ['setup', 'build/release', '--buildtype=release',
        '-Dnative_arch=false', '-Dpopcnt=false', '-Df16c=false', '-Dpext=false',
        '-Dblas=true', '-Dopenblas=false', '-Daccelerate=false', '-Dmkl=false', '-Ddnnl=false', '-Dispc=false',
        '-Dplain_cuda=false', '-Dcudnn=false', '-Dopencl=false', '-Donnx=false',
        '-Dmetal=disabled', '-Dgtest=false', '-Ddefault_backend=eigen'], { cwd: sourceDir })
      run('meson', ['compile', '-C', 'build/release', '-j', '2'], { cwd: sourceDir })
      copyFileSync(join(sourceDir, 'build/release/lc0'), binary)
      copyLicense(filesBelow(sourceDir).filter(file => dirname(file) === sourceDir), license)
      // Keep source beside the binary for reproducibility and downstream distribution.
      run('tar', ['-czf', join(out, 'lc0-source.tar.gz'), '--exclude=.git', '--exclude=build', '-C', sourceDir, '.'])
    }
    makeExecutable(target, binary)
    writeFileSync(stamp, JSON.stringify({ source }))
  }
  // Re-checked on every run (cached or not): a swapped-in or corrupted cache
  // entry with a matching stamp would otherwise never be re-validated.
  if (target.platform === 'darwin') verifyMacSystemLinkage(binary)
}

async function maia(out) {
  const dir = join(out, 'maia')
  mkdirSync(dir, { recursive: true })
  for (const level of MAIA_LEVELS) {
    const dest = join(dir, `maia-${level}.pb.gz`)
    if (existsSync(dest)) {
      // Existing downloads from older setups must at least be valid gzip files.
      const { gunzipSync } = await import('node:zlib')
      try { gunzipSync(readFileSync(dest)); continue } catch { /* replace incomplete download */ }
    }
    console.log(`[maia] downloading ${level}`)
    await download(`${MAIA_BASE_URL}/maia-${level}.pb.gz`, dest)
  }
  writeFileSync(join(out, 'ENGINE-SOURCES.txt'), [
    'Stockfish sf_19: https://github.com/official-stockfish/Stockfish/tree/sf_19',
    `lc0 v${LC0_VERSION}: https://github.com/LeelaChessZero/lc0/tree/v${LC0_VERSION}`,
    'Maia v1.0: https://github.com/CSSLab/maia-chess/releases/tag/v1.0',
    'Maia uses the lc0 network format; see upstream repositories for licenses and sources.'
  ].join('\n') + '\n')
}

export async function fetchEngines() {
  const target = platformInfo()
  const out = join(ROOT, 'resources', 'engines', target.id)
  mkdirSync(out, { recursive: true })
  const work = mkdtempSync(join(tmpdir(), 'chess-engines-'))
  try {
    await stockfish(target, out, work)
    await lc0(target, out, work)
    await maia(out)
    console.log(`Engines ready: ${out}`)
  } finally { rmSync(work, { recursive: true, force: true }) }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  fetchEngines().catch(error => { console.error(error.message); process.exitCode = 1 })
}
