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
  private bestMoveResolvers: Array<(mv: string) => void> = []
  private searching = false

  get running(): boolean {
    return this.proc !== null
  }

  async start(enginePath: string): Promise<void> {
    await this.quit()
    const proc = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc = proc
    proc.on('error', (err) => this.emit('error', err))
    // EPIPE beim Schreiben in einen bereits beendeten Prozess darf nicht crashen
    proc.stdin.on('error', () => {})
    proc.on('exit', () => {
      if (this.proc === proc) this.proc = null
    })
    readline.createInterface({ input: proc.stdout }).on('line', (line) => this.onLine(line))

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

  position(movesUci: string[]): void {
    this.send(movesUci.length ? `position startpos moves ${movesUci.join(' ')}` : 'position startpos')
  }

  goMovetime(ms: number): Promise<string> {
    return new Promise((resolve) => {
      this.searching = true
      this.bestMoveResolvers.push(resolve)
      this.send(`go movetime ${ms}`)
    })
  }

  /** Für Maia/lc0: Suche auf einen Knoten begrenzen, damit die reine Policy statt einer echten Suche zieht. */
  goNodes(nodes: number): Promise<string> {
    return new Promise((resolve) => {
      this.searching = true
      this.bestMoveResolvers.push(resolve)
      this.send(`go nodes ${nodes}`)
    })
  }

  goInfinite(): void {
    this.searching = true
    this.send('go infinite')
  }

  /** Stop a running search and wait until the engine acknowledged with bestmove. */
  async stopSearch(): Promise<void> {
    if (!this.searching || !this.proc) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000)
      this.bestMoveResolvers.push(() => {
        clearTimeout(timer)
        resolve()
      })
      this.send('stop')
    })
  }

  async quit(): Promise<void> {
    const proc = this.proc
    if (!proc) return
    this.proc = null
    this.searching = false
    this.bestMoveResolvers = []
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
      this.searching = false
      const mv = line.split(/\s+/)[1] ?? '(none)'
      const resolve = this.bestMoveResolvers.shift()
      resolve?.(mv)
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
