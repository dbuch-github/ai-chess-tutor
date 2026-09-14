import { UciEngine } from './UciEngine'
import type {
  AnalysisConfig,
  AnalysisLine,
  AnalysisSnapshot,
  ConfigureResult,
  OpponentConfig
} from '../../shared/types'

const SNAPSHOT_THROTTLE_MS = 200

/** Serialisiert Prozess-Kommandos, ohne auf das Ergebnis einer neuen Suche zu warten. */
class CommandQueue {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task)
    this.tail = next.catch(() => {})
    return next
  }
}

/**
 * Owns the two engine processes: the configurable opponent and the
 * always-Stockfish analysis instance running MultiPV on the current position.
 */
export class EngineManager {
  private opponentConfig: OpponentConfig | null = null
  private opponentQueue = new CommandQueue()
  private analysisQueue = new CommandQueue()
  private desiredAnalysis: { fen: string; moves: string[]; initialFen?: string } | null = null
  private positionVersion = 0
  // Gehört ausschließlich zur laufenden Suche, auch während stopSearch().
  private analysisFen = ''
  private analysisLines = new Map<number, AnalysisLine>()
  private snapshotTimer: NodeJS.Timeout | null = null
  private onSnapshot: (snap: AnalysisSnapshot) => void

  constructor(
    onSnapshot: (snap: AnalysisSnapshot) => void,
    private opponent = new UciEngine(),
    private analysis = new UciEngine()
  ) {
    this.onSnapshot = onSnapshot
    this.analysis.on('info', (info: AnalysisLine) => {
      if (!this.analysisFen) return
      this.analysisLines.set(info.multipv, info)
      this.scheduleSnapshot()
    })
    this.analysis.on('error', (err: Error) => console.error('[analysis]', err.message))
    this.opponent.on('error', (err: Error) => console.error('[opponent]', err.message))
  }

  async configureOpponent(config: OpponentConfig): Promise<ConfigureResult> {
    return this.opponentQueue.run(async () => {
      try {
        await this.opponent.start(config.enginePath)
        if (config.kind === 'maia') {
          if (!config.weightsPath) throw new Error('Keine Maia-Gewichtsdatei (.pb.gz) angegeben')
          // Maias Stärke steckt im Netz selbst, nicht in einer Suchtiefe/Elo-Option
          await this.opponent.setOptions({ WeightsFile: config.weightsPath })
        } else {
          const options: Record<string, string | number | boolean> = {
            UCI_LimitStrength: config.limitStrength
          }
          if (config.limitStrength) options.UCI_Elo = config.elo
          await this.opponent.setOptions(options)
        }
        this.opponent.newGame()
        this.opponentConfig = config
        return { ok: true, engineName: this.opponent.name }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })
  }

  async configureAnalysis(config: AnalysisConfig): Promise<ConfigureResult> {
    return this.analysisQueue.run(async () => {
      try {
        this.flushPendingSnapshot(this.analysisFen)
        this.analysisFen = ''
        this.analysisLines.clear()
        await this.analysis.start(config.enginePath)
        await this.analysis.setOptions({
          MultiPV: config.multiPv,
          Threads: config.threads,
          Hash: config.hashMb
        })
        this.analysis.newGame()
        // Resume analysis of the position we were on, if any
        this.startDesiredAnalysis()
        return { ok: true, engineName: this.analysis.name }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })
  }

  async requestOpponentMove(movesUci: string[], initialFen?: string): Promise<string> {
    const { move } = await this.opponentQueue.run(async () => {
      if (!this.opponent.running || !this.opponentConfig) {
        throw new Error('Opponent engine is not configured')
      }
      await this.opponent.stopSearch()
      this.opponent.position(movesUci, initialFen)
      // Maia soll die reine Netz-Vorhersage spielen, keine Suche – daher "go nodes 1"
      // statt Bedenkzeit (siehe https://github.com/CSSLab/maia-chess: "you want to
      // _disable_ searching, a nodes limit of 1 is what we use").
      const move = this.opponentConfig.kind === 'maia'
        ? this.opponent.goNodes(1)
        : this.opponent.goMovetime(this.opponentConfig.moveTimeMs)
      return { move }
    })
    return move
  }

  async setAnalysisPosition(fen: string, movesUci: string[], initialFen?: string): Promise<void> {
    const version = ++this.positionVersion
    this.desiredAnalysis = { fen, moves: [...movesUci], initialFen }
    return this.analysisQueue.run(async () => {
      if (version !== this.positionVersion || !this.analysis.running) return
      await this.analysis.stopSearch()
      // Auch Zeilen, die während stop eintrafen, gehören noch zur alten Suche.
      this.flushPendingSnapshot(this.analysisFen)
      if (version !== this.positionVersion) return
      this.startDesiredAnalysis()
    })
  }

  private startDesiredAnalysis(): void {
    const desired = this.desiredAnalysis
    if (!desired) return
    this.analysisFen = desired.fen
    this.analysisLines.clear()
    this.analysis.position(desired.moves, desired.initialFen)
    this.analysis.goInfinite()
  }

  /** Stop both searches without quitting the engines (e.g. window closed on macOS). */
  async pause(): Promise<void> {
    await Promise.allSettled([
      this.opponentQueue.run(() => this.opponent.stopSearch()),
      this.analysisQueue.run(() => this.analysis.stopSearch())
    ])
  }

  async shutdown(): Promise<void> {
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
    await Promise.all([this.opponent.quit(), this.analysis.quit()])
  }

  private scheduleSnapshot(): void {
    if (this.snapshotTimer) return
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null
      const lines = [...this.analysisLines.values()].sort((a, b) => a.multipv - b.multipv)
      if (lines.length > 0) {
        this.onSnapshot({ fen: this.analysisFen, lines })
      }
    }, SNAPSHOT_THROTTLE_MS)
  }

  /** Liefert eine noch nicht gemeldete Momentaufnahme sofort aus, statt sie beim Stellungswechsel zu verlieren. */
  private flushPendingSnapshot(fen: string): void {
    if (!this.snapshotTimer) return
    clearTimeout(this.snapshotTimer)
    this.snapshotTimer = null
    const lines = [...this.analysisLines.values()].sort((a, b) => a.multipv - b.multipv)
    if (lines.length > 0 && fen) {
      this.onSnapshot({ fen, lines })
    }
  }
}
