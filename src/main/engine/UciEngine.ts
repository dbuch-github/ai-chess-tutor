import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import readline from 'node:readline'
import type { AnalysisLine } from '../../shared/types'

/**
 * Thin wrapper around a UCI engine process. One instance == one engine process.
 * Emits: 'info' (AnalysisLine), 'bestmove' (string), 'error' (Error).
 */
export class UciEngine extends EventEmitter {
  name = ''
  private proc: ChildProcessWithoutNullStreams | null = null
  private pendingMove: { resolve: (mv: string) => void; reject: (err: Error) => void } | null = null
  private stopWaiters = new Set<{ resolve: () => void; reject: (err: Error) => void }>()
  private stopTimer: NodeJS.Timeout | null = null
  private searching = false

  get running(): boolean {
    return this.proc !== null
  }

  async start(enginePath: string, args: string[] = []): Promise<void> {
    await this.quit()
    const proc = spawn(enginePath, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this.proc = proc
    proc.on('error', (err) => {
      if (this.proc !== proc) return
      // Bei einem fehlgeschlagenen spawn folgt kein exit-Ereignis.
      if (proc.pid === undefined) this.proc = null
      this.finishSearch(undefined, err)
      this.emit('error', err)
    })
    // EPIPE beim Schreiben in einen bereits beendeten Prozess darf nicht crashen
    proc.stdin.on('error', () => {})
    proc.on('exit', () => {
      if (this.proc === proc) {
        this.proc = null
        this.finishSearch(undefined, new Error('Engine process exited'))
      }
    })
    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
      if (this.proc === proc) this.onLine(line)
    })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`UCI handshake timeout: ${enginePath}`))
      }, 8000)
      const onOk = (): void => {
        cleanup()
        resolve()
      }
      const onErr = (e: Error): void => {
        cleanup()
        reject(e)
      }
      const cleanup = (): void => {
        clearTimeout(timer)
        this.off('uciok', onOk)
        this.off('error', onErr)
      }
      this.once('uciok', onOk)
      this.once('error', onErr)
      this.send('uci')
    })
  }

  send(cmd: string): void {
    this.proc?.stdin.write(cmd + '\n')
  }

  async isReady(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('readyok timeout')), 8000)
      this.once('readyok', () => {
        clearTimeout(timer)
        resolve()
      })
      this.send('isready')
    })
  }

  async setOptions(options: Record<string, string | number | boolean>): Promise<void> {
    for (const [name, value] of Object.entries(options)) {
      this.send(`setoption name ${name} value ${value}`)
    }
    await this.isReady()
  }

  newGame(): void {
    this.send('ucinewgame')
  }

  position(movesUci: string[], initialFen?: string): void {
    const base = initialFen ? `fen ${initialFen}` : 'startpos'
    this.send(`position ${base}${movesUci.length ? ` moves ${movesUci.join(' ')}` : ''}`)
  }

  goMovetime(ms: number): Promise<string> {
    return this.go(`go movetime ${ms}`)
  }

  /** Für Maia/lc0: Suche auf einen Knoten begrenzen, damit die reine Policy statt einer echten Suche zieht. */
  goNodes(nodes: number): Promise<string> {
    return this.go(`go nodes ${nodes}`)
  }

  private go(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.proc || this.searching) {
        reject(new Error('Engine is unavailable or still searching'))
        return
      }
      this.searching = true
      this.pendingMove = { resolve, reject }
      this.send(command)
    })
  }

  goInfinite(): void {
    if (!this.proc || this.searching) throw new Error('Engine is unavailable or still searching')
    this.searching = true
    this.send('go infinite')
  }

  /** Stop a running search and wait until the engine acknowledged with bestmove. */
  async stopSearch(): Promise<void> {
    if (!this.searching || !this.proc) return
    await new Promise<void>((resolve, reject) => {
      this.stopWaiters.add({ resolve, reject })
      if (this.stopTimer) return
      this.stopTimer = setTimeout(() => {
        // Ohne Bestätigung ist der UCI-Strom nicht mehr zuordenbar. Keine neue
        // Suche auf diesem Prozess starten und verspätete Antworten ignorieren.
        const proc = this.proc
        this.proc = null
        this.finishSearch(undefined, new Error('Engine stop timeout'))
        proc?.kill('SIGKILL')
      }, 1000)
      this.send('stop')
    })
  }

  private finishSearch(move?: string, error?: Error): void {
    this.searching = false
    if (this.stopTimer) clearTimeout(this.stopTimer)
    this.stopTimer = null
    const pending = this.pendingMove
    this.pendingMove = null
    const waiters = [...this.stopWaiters]
    this.stopWaiters.clear()
    if (error) pending?.reject(error)
    else pending?.resolve(move ?? '(none)')
    for (const waiter of waiters) {
      if (error) waiter.reject(error)
      else waiter.resolve()
    }
  }

  async quit(): Promise<void> {
    const proc = this.proc
    if (!proc) return
    this.proc = null
    this.finishSearch(undefined, new Error('Engine stopped'))
    if (proc.pid === undefined || proc.exitCode !== null || proc.signalCode !== null) return
    try {
      proc.stdin.write('quit\n')
    } catch {
      /* already gone */
    }
    const killTimer = setTimeout(() => proc.kill('SIGKILL'), 1500)
    await new Promise<void>((resolve) => {
      proc.once('exit', () => {
        clearTimeout(killTimer)
        resolve()
      })
    })
  }

  private onLine(line: string): void {
    if (line.startsWith('id name ')) {
      this.name = line.slice('id name '.length)
    } else if (line === 'uciok') {
      this.emit('uciok')
    } else if (line === 'readyok') {
      this.emit('readyok')
    } else if (line.startsWith('bestmove')) {
      const mv = line.split(/\s+/)[1] ?? '(none)'
      this.finishSearch(mv)
    } else if (line.startsWith('info ') && line.includes(' pv ')) {
      const info = parseInfoLine(line)
      if (info) this.emit('info', info)
    }
  }
}

export function parseInfoLine(line: string): AnalysisLine | null {
  const depth = matchNum(line, /\bdepth (\d+)/)
  const pvIndex = line.indexOf(' pv ')
  if (depth === undefined || pvIndex < 0) return null
  // 'pv' inside 'multipv' must not be mistaken for the principal variation
  const cp = matchNum(line, /\bscore cp (-?\d+)/)
  const mate = matchNum(line, /\bscore mate (-?\d+)/)
  if (cp === undefined && mate === undefined) return null
  return {
    multipv: matchNum(line, /\bmultipv (\d+)/) ?? 1,
    depth,
    cp,
    mate,
    pvUci: line.slice(pvIndex + 4).trim().split(/\s+/)
  }
}

function matchNum(line: string, re: RegExp): number | undefined {
  const m = line.match(re)
  return m ? Number(m[1]) : undefined
}
