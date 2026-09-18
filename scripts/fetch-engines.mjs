#!/usr/bin/env node
/**
 * Lädt Stockfish, lc0 und die Maia-Gewichtsdateien (Spielstärken 1100-1900) nach
 * resources/engines/mac-arm64/, damit electron-builder sie als extraResources in den
 * Installer packen kann. Wird nicht eingecheckt (siehe .gitignore) - vor `npm run dist`
 * einmal ausführen.
 *
 * lc0 gibt es offiziell nur für Windows/Android als Fertig-Binary; auf macOS kommt es
 * daher aus der Homebrew-Bottle (`brew install lc0`). Die Homebrew-Metal-Variante bindet
 * nur System-Frameworks (Accelerate/Metal/Foundation), keine Homebrew-eigenen dylibs -
 * das Binary läuft daher auch ohne Homebrew auf dem Zielrechner.
 */
import { execFileSync } from 'node:child_process'
import { createWriteStream, chmodSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const ROOT = join(import.meta.dirname, '..')
const OUT_DIR = join(ROOT, 'resources', 'engines', 'mac-arm64')
const MAIA_DIR = join(OUT_DIR, 'maia')

const STOCKFISH_URL =
  'https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-macos-universal.tar.gz'
const MAIA_LEVELS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]
const MAIA_BASE_URL = 'https://github.com/CSSLab/maia-chess/releases/download/v1.0'

async function download(url, destPath) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status}): ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath))
}

function fetchStockfish() {
  const dest = join(OUT_DIR, 'stockfish')
  if (existsSync(dest)) {
    console.log('[stockfish] bereits vorhanden, übersprungen')
    return Promise.resolve()
  }
  return (async () => {
    console.log('[stockfish] lade sf_19 (macOS universal)...')
    const tmpTar = join(tmpdir(), 'stockfish-macos-universal.tar.gz')
    await download(STOCKFISH_URL, tmpTar)
    const extractDir = join(tmpdir(), `stockfish-extract-${Date.now()}`)
    mkdirSync(extractDir, { recursive: true })
    execFileSync('tar', ['-xzf', tmpTar, '-C', extractDir])
    const fatBinary = join(extractDir, 'stockfish', 'stockfish-macos-universal')
    // Nur die arm64-Slice behalten - lc0 (s.u.) gibt es ohnehin nur für Apple Silicon,
    // ein universelles Stockfish brächte hier keinen Zusatznutzen.
    execFileSync('lipo', ['-thin', 'arm64', fatBinary, '-output', dest])
    chmodSync(dest, 0o755)
    execFileSync('cp', [join(extractDir, 'stockfish', 'Copying.txt'), join(OUT_DIR, 'stockfish-LICENSE.txt')])
    rmSync(tmpTar, { force: true })
    rmSync(extractDir, { recursive: true, force: true })
    console.log('[stockfish] fertig')
  })()
}

function fetchLc0() {
  const dest = join(OUT_DIR, 'lc0')
  if (existsSync(dest)) {
    console.log('[lc0] bereits vorhanden, übersprungen')
    return
  }
  console.log('[lc0] prüfe Homebrew-Installation...')
  try {
    execFileSync('brew', ['list', 'lc0'], { stdio: 'ignore' })
  } catch {
    console.log('[lc0] nicht installiert - installiere via Homebrew...')
    execFileSync('brew', ['install', 'lc0'], { stdio: 'inherit' })
  }
  const prefix = execFileSync('brew', ['--prefix', 'lc0']).toString().trim()
  const libexecBinary = join(prefix, 'libexec', 'lc0')
  const binBinary = join(prefix, 'bin', 'lc0')
  const source = existsSync(libexecBinary) ? libexecBinary : binBinary
  execFileSync('cp', [source, dest])
  chmodSync(dest, 0o755)
  const licenseSrc = readdirSync(prefix).find((f) => /^(COPYING|LICENSE)/i.test(f))
  if (licenseSrc) execFileSync('cp', [join(prefix, licenseSrc), join(OUT_DIR, 'lc0-LICENSE.txt')])
  console.log('[lc0] fertig (kopiert aus Homebrew-Cellar, läuft eigenständig)')
}

async function fetchMaiaWeights() {
  mkdirSync(MAIA_DIR, { recursive: true })
  for (const level of MAIA_LEVELS) {
    const dest = join(MAIA_DIR, `maia-${level}.pb.gz`)
    if (existsSync(dest)) {
      console.log(`[maia-${level}] bereits vorhanden, übersprungen`)
      continue
    }
    console.log(`[maia-${level}] lade Gewichtsdatei...`)
    await download(`${MAIA_BASE_URL}/maia-${level}.pb.gz`, dest)
  }
  console.log('[maia] fertig (CSSLab/maia-chess v1.0, Lizenz: siehe Repo-README)')
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  await fetchStockfish()
  fetchLc0()
  await fetchMaiaWeights()
  console.log(`\nAlle Engines liegen in ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
