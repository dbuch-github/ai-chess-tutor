import { UciEngine } from './UciEngine'
import type {
  AnalysisConfig,
  AnalysisLine,
  AnalysisSnapshot,
  ConfigureResult,
  OpponentConfig
} from '../../shared/types'

const SNAPSHOT_THROTTLE_MS = 200

/**
 * Owns the two engine processes: the configurable opponent and the
 * always-Stockfish analysis instance running MultiPV on the current position.
 */
export class EngineManager {
  private opponent = new UciEngine()
  private opponentConfig: OpponentConfig | null = null
  private analysis = new UciEngine()
  private analysisFen = ''
  private analysisLines = new Map<number, AnalysisLine>()
  private snapshotTimer: NodeJS.Timeout | null = null
  private onSnapshot: (snap: AnalysisSnapshot) => void

  constructor(onSnapshot: (snap: AnalysisSnapshot) => void) {
    this.onSnapshot = onSnapshot
    this.analysis.on('info', (info: AnalysisLine) => {
      this.analysisLines.set(info.multipv, info)
      this.scheduleSnapshot()
    })
    this.analysis.on('error', (err: Error) => console.error('[analysis]', err.message))
    this.opponent.on('error', (err: Error) => console.error('[opponent]', err.message))
  }

  async configureOpponent(config: OpponentConfig): Promise<ConfigureResult> {
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
  }

  async configureAnalysis(config: AnalysisConfig): Promise<ConfigureResult> {
    try {
      await this.analysis.start(config.enginePath)
      await this.analysis.setOptions({
        MultiPV: config.multiPv,
        Threads: config.threads,
        Hash: config.hashMb
      })
      this.analysis.newGame()
      // Resume analysis of the position we were on, if any
      if (this.analysisFen) {
        this.analysis.position(this.analysisMoves)
        this.analysis.goInfinite()
      }
      return { ok: true, engineName: this.analysis.name }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  private analysisMoves: string[] = []

  async requestOpponentMove(movesUci: string[]): Promise<string> {
    if (!this.opponent.running || !this.opponentConfig) {
      throw new Error('Opponent engine is not configured')
    }
    await this.opponent.stopSearch()
    this.opponent.position(movesUci)
    // Maia soll die reine Netz-Vorhersage spielen, keine Suche – daher "go nodes 1"
    // statt Bedenkzeit (siehe https://github.com/CSSLab/maia-chess: "you want to
    // _disable_ searching, a nodes limit of 1 is what we use").
    return this.opponentConfig.kind === 'maia'
      ? this.opponent.goNodes(1)
      : this.opponent.goMovetime(this.opponentConfig.moveTimeMs)
  }

  async setAnalysisPosition(fen: string, movesUci: string[]): Promise<void> {
    // Eine noch ausstehende, debounced Momentaufnahme gehört zur alten
    // Stellung. Jetzt sofort mit dem bisher Erreichten ausliefern – sonst
    // ginge bei schnell aufeinanderfolgenden Zügen die letzte (tiefste)
    // Analyse der alten Stellung verloren, oder schlimmer: sie würde beim
    // späteren Timer-Feuern fälschlich der inzwischen schon neuen
    // this.analysisFen zugeordnet.
    this.flushPendingSnapshot(this.analysisFen)

    this.analysisFen = fen
    this.analysisMoves = movesUci
    if (!this.analysis.running) return
    await this.analysis.stopSearch()
    // Position may have changed again while we waited for the engine to stop
    if (this.analysisFen !== fen) return
    this.analysisLines.clear()
    this.analysis.position(movesUci)
    this.analysis.goInfinite()
  }

  /** Stop both searches without quitting the engines (e.g. window closed on macOS). */
  async pause(): Promise<void> {
    await Promise.all([this.opponent.stopSearch(), this.analysis.stopSearch()])
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
