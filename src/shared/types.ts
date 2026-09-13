export type EngineKind = 'stockfish' | 'maia' | 'custom'

export interface OpponentConfig {
  kind: EngineKind
  /** Stockfish- bzw. lc0-Binary; bei Maia ist das der lc0-Pfad, nicht die Gewichtsdatei. */
  enginePath: string
  /** Nur bei kind === 'maia': Pfad zur .pb.gz-Gewichtsdatei. */
  weightsPath?: string
  /** Nur relevant für kind !== 'maia' (Maias Stärke ist durch das Netz selbst festgelegt). */
  limitStrength: boolean
  elo: number
  /** Bei Maia ignoriert – dort wird mit "go nodes 1" statt Bedenkzeit gezogen. */
  moveTimeMs: number
}

export interface AnalysisConfig {
  enginePath: string
  multiPv: number
  threads: number
  hashMb: number
}

export interface AnalysisLine {
  multipv: number
  depth: number
  cp?: number
  mate?: number
  pvUci: string[]
}

export interface AnalysisSnapshot {
  fen: string
  lines: AnalysisLine[]
}

/* ---- PGN ---- */

export interface PgnExportResult {
  ok: boolean
  path?: string
  error?: string
}

export interface PgnImportResult {
  ok: boolean
  pgn?: string
  error?: string
}

/* ---- Chessnut Air (Web-Bluetooth-Geräteauswahl) ---- */

export interface BluetoothDeviceInfo {
  id: string
  name: string
}

/* ---- Partie-Bibliothek ---- */

export interface LibraryGameSummary {
  path: string
  date: string
  white: string
  black: string
  result: string
  plyCount: number
}

export interface LibrarySaveResult {
  ok: boolean
  path?: string
  error?: string
}

export interface LibraryLoadResult {
  ok: boolean
  pgn?: string
  error?: string
}

export interface ConfigureResult {
  ok: boolean
  engineName?: string
  error?: string
}

/* ---- LLM-Tutor ---- */

export type LlmProviderId = 'anthropic' | 'openai' | 'google'

export interface TutorConfig {
  provider: LlmProviderId
  model: string
  /** Neuer API-Key für diesen Provider; undefined = vorhandenen behalten, '' = löschen */
  apiKey?: string
}

export interface TutorStatus {
  provider: LlmProviderId
  /** Hat der aktive Provider einen Key? (Kurzform für bestehende Verbraucher.) */
  hasApiKey: boolean
  model: string
  /** Key-Status je Provider – damit die Einstellungen den Status auch für einen
   *  gerade nicht aktiven, aber im Dialog ausgewählten Provider anzeigen können. */
  hasApiKeyByProvider: Record<LlmProviderId, boolean>
}

export interface TutorMoveRequest {
  kind: 'move'
  moveNumber: number
  san: string
  color: 'w' | 'b'
  playerColor: 'w' | 'b'
  classification: string
  lossPct: number
  fenBefore: string
  fenAfter: string
  /** Bewertungen aus Weiß-Sicht, formatiert (z. B. "+0.85" oder "M3") */
  evalBefore: string
  evalAfter: string
  bestMoveSan: string
  bestLineSan: string
  historySan: string
  phase: string
}

export interface TutorQuestionRequest {
  kind: 'question'
  question: string
  fen: string
  turn: 'w' | 'b'
  playerColor: 'w' | 'b'
  evalNow: string
  linesSan: string[]
  historySan: string
}

export interface TutorSuggestRequest {
  kind: 'suggest'
  fen: string
  turn: 'w' | 'b'
  playerColor: 'w' | 'b'
  evalNow: string
  bestMoveSan: string
  bestLineSan: string
  historySan: string
}

export interface TutorReportMistake {
  moveNumber: number
  san: string
  classification: string
  lossPct: number
}

export interface TutorReportStats {
  blunders: number
  mistakes: number
  inaccuracies: number
  bestMoves: number
  totalMoves: number
}

export interface TutorReportRequest {
  kind: 'report'
  playerColor: 'w' | 'b'
  result: string
  historySan: string
  mistakes: TutorReportMistake[]
  stats: TutorReportStats
}

export type TutorRequest = TutorMoveRequest | TutorQuestionRequest | TutorSuggestRequest | TutorReportRequest

export interface TutorResult {
  ok: boolean
  text?: string
  error?: string
}
