import type { EngineKind, LlmProviderId } from '../../shared/types'

export type TutorMode = 'off' | 'mistakes' | 'chatty'

/** 'unlimited' = freies Spiel ohne Uhr; die anderen sind Turnierkategorien nach Grundzeit. */
export type ClockMode = 'unlimited' | 'classical' | 'rapid' | 'blitz' | 'bullet'

export interface AppSettings {
  engineKind: EngineKind
  opponentPath: string
  /** Nur bei engineKind === 'maia': Pfad zur .pb.gz-Gewichtsdatei. */
  weightsPath: string
  limitStrength: boolean
  elo: number
  moveTimeMs: number
  analysisPath: string
  showAnalysis: boolean
  useOpeningBook: boolean
  tutorProvider: LlmProviderId
  tutorModelAnthropic: string
  tutorModelOpenAI: string
  tutorModelGoogle: string
  tutorMode: TutorMode
  clockMode: ClockMode
  /** Grundzeit pro Spieler in Minuten (nur relevant bei clockMode !== 'unlimited'). */
  clockBaseMinutes: number
  /** Inkrement pro gespieltem Zug in Sekunden. */
  clockIncrementSeconds: number
  /** Klick-Geräusch bei jedem gespielten Zug. */
  moveSoundEnabled: boolean
  /** Chessnut Air: besten Zug der laufenden Analyse als Blinken (Von-/Ziel-Feld im Wechsel) zeigen. */
  chessnutBestMoveBlink: boolean
  /** Chessnut Air: Signalton bei Schach, ungültigem Zugversuch oder Zeitüberschreitung. */
  chessnutBeepEnabled: boolean
}

/** Voreingestellte Grundzeit/Inkrement je Turnierkategorie – frei danach anpassbar. */
export const CLOCK_PRESETS: Record<Exclude<ClockMode, 'unlimited'>, { minutes: number; increment: number; label: string }> = {
  classical: { minutes: 60, increment: 30, label: 'Klassisch (Turnierschach)' },
  rapid: { minutes: 15, increment: 10, label: 'Schnellschach (Rapid)' },
  blitz: { minutes: 5, increment: 3, label: 'Blitzschach' },
  bullet: { minutes: 1, increment: 1, label: 'Bullet-Schach' }
}

const STORAGE_KEY = 'ai-chess-tutor.settings'

export const DEFAULT_SETTINGS: AppSettings = {
  engineKind: 'stockfish',
  opponentPath: '',
  weightsPath: '',
  limitStrength: true,
  elo: 1600,
  moveTimeMs: 1000,
  analysisPath: '',
  showAnalysis: true,
  useOpeningBook: true,
  tutorProvider: 'anthropic',
  tutorModelAnthropic: 'claude-opus-5',
  tutorModelOpenAI: 'gpt-5.1',
  tutorModelGoogle: 'gemini-3.1-pro',
  tutorMode: 'mistakes',
  clockMode: 'unlimited',
  clockBaseMinutes: 15,
  clockIncrementSeconds: 10,
  moveSoundEnabled: true,
  chessnutBestMoveBlink: true,
  chessnutBeepEnabled: true
}

/** Feld in AppSettings, in dem das Modell für den jeweiligen Provider steht. */
export const TUTOR_MODEL_KEY: Record<LlmProviderId, keyof AppSettings> = {
  anthropic: 'tutorModelAnthropic',
  openai: 'tutorModelOpenAI',
  google: 'tutorModelGoogle'
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* not fatal */
  }
}
