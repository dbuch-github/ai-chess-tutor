import { app } from 'electron'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { LibraryGameSummary, LibraryLoadResult, LibrarySaveResult } from '../shared/types'

function gamesDir(): string {
  const dir = join(app.getPath('userData'), 'games')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Verhindert, dass ein Lade-/Löschaufruf versehentlich außerhalb des Bibliotheksordners greift. */
function isWithinGamesDir(filePath: string): boolean {
  const dir = resolve(gamesDir()) + sep
  return resolve(filePath).startsWith(dir)
}

function extractPgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {}
  const re = /^\[(\w+)\s+"([^"]*)"\]/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(pgn))) headers[m[1]] = m[2]
  return headers
}

/** Grobe Halbzug-Zählung: Bewegungstext nach der letzten Kopfzeile, Zugnummern/Ergebnis herausgefiltert. */
function countPlies(pgn: string): number {
  const bodyStart = pgn.search(/\]\s*\n\s*\n/)
  const movetext = bodyStart >= 0 ? pgn.slice(bodyStart) : pgn
  return movetext
    .split(/\s+/)
    .filter(Boolean)
    .filter((tok) => !/^\d+\.+$/.test(tok) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)).length
}

export function librarySave(pgn: string): LibrarySaveResult {
  try {
    const filePath = join(gamesDir(), `${Date.now()}.pgn`)
    writeFileSync(filePath, pgn, 'utf8')
    return { ok: true, path: filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function libraryList(): LibraryGameSummary[] {
  try {
    const dir = gamesDir()
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.pgn'))
      // Dateiname ist die Epoch-ms-Uhrzeit – neueste zuerst
      .sort((a, b) => b.localeCompare(a))
    return files.map((f) => {
      const filePath = join(dir, f)
      const pgn = readFileSync(filePath, 'utf8')
      const headers = extractPgnHeaders(pgn)
      return {
        path: filePath,
        date: headers.Date ?? '',
        white: headers.White ?? '?',
        black: headers.Black ?? '?',
        result: headers.Result ?? '*',
        plyCount: countPlies(pgn)
      }
    })
  } catch {
    return []
  }
}

export function libraryLoad(filePath: string): LibraryLoadResult {
  if (!isWithinGamesDir(filePath)) return { ok: false, error: 'Ungültiger Pfad' }
  try {
    return { ok: true, pgn: readFileSync(filePath, 'utf8') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function libraryDelete(filePath: string): { ok: boolean } {
  if (!isWithinGamesDir(filePath)) return { ok: false }
  try {
    rmSync(filePath, { force: true })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
