import type { EngineKind, LlmProviderId, SupportedLocale } from '../../shared/types'

const SUPPORTED_LOCALES: SupportedLocale[] = [
  'en',
  'de',
  'fr',
  'es',
  'it',
  'pt',
  'ru',
  'ar',
  'pl',
  'tr',
  'zh',
  'hi',
  'el',
  'sr',
  'hr'
]

/** Systemsprache erkennen (nur beim allerersten Start relevant, siehe loadSettings) – Fallback Englisch. */
function detectLocale(): SupportedLocale {
  const lang = (navigator.language || 'en').split('-')[0]
  return (SUPPORTED_LOCALES as string[]).includes(lang) ? (lang as SupportedLocale) : 'en'
}

export type TutorMode = 'off' | 'mistakes' | 'chatty'

/** 'unlimited' = freies Spiel ohne Uhr; die anderen sind Turnierkategorien nach Grundzeit. */
export type ClockMode = 'unlimited' | 'classical' | 'rapid' | 'blitz' | 'bullet'

/** Bei CSSLab/maia-chess offiziell verfügbare Netz-Stärken (siehe scripts/fetch-engines.mjs). */
export const MAIA_LEVELS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]

/** Spielstärke aus einem "…/maia-1500.pb.gz"-Pfad, falls erkennbar. */
export function levelFromWeightsPath(path: string): number | null {
  const m = /maia-(\d+)\.pb\.gz$/.exec(path)
  return m ? Number(m[1]) : null
}

export interface AppSettings {
  /** UI-Sprache; steuert auch die Antwortsprache des LLM-Tutors. */
  locale: SupportedLocale
  engineKind: EngineKind
  opponentPath: string
  /** Nur bei engineKind === 'maia': Pfad zur .pb.gz-Gewichtsdatei. */
  weightsPath: string
  limitStrength: boolean
  elo: number
  moveTimeMs: number
  analysisPath: string
  showAnalysis: boolean
  /** Trainings-Zusatz: taktische Muster (Gabel, Fesselung, Spieß, ...), die die Seite am Zug jetzt spielen könnte. */
  showTactics: boolean
  useOpeningBook: boolean
  /** Ob der Eröffnungs-Bereich (Name/ECO + Vorschau-Umschalter) im Spiel überhaupt angezeigt wird. */
  showOpening: boolean
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
  /** Aus abgeschlossenen Partien gegen Stockfish/Maia geschätzte eigene Elo (Standard-Rating-Update). */
  estimatedElo: number
  /** Anzahl der bisher gewerteten Partien (steuert den K-Faktor, siehe game/rating.ts). */
  ratedGamesCount: number
  /** Engine-Stärke automatisch aus estimatedElo ableiten statt aus elo/weightsPath. */
  adaptiveStrength: boolean
}

/**
 * Voreingestellte Grundzeit/Inkrement je Turnierkategorie – frei danach anpassbar. Labels
 * liegen als Übersetzungs-Keys unter "clock.presets.<mode>" (siehe locales/*.json), nicht hier.
 */
export const CLOCK_PRESETS: Record<Exclude<ClockMode, 'unlimited'>, { minutes: number; increment: number }> = {
  classical: { minutes: 60, increment: 30 },
  rapid: { minutes: 15, increment: 10 },
  blitz: { minutes: 5, increment: 3 },
  bullet: { minutes: 1, increment: 1 }
}

const STORAGE_KEY = 'ai-chess-tutor.settings'

export const DEFAULT_SETTINGS: AppSettings = {
  locale: 'en',
  engineKind: 'stockfish',
  opponentPath: '',
  weightsPath: '',
  limitStrength: true,
  elo: 1600,
  moveTimeMs: 1000,
  analysisPath: '',
  showAnalysis: true,
  showTactics: false,
  useOpeningBook: true,
  showOpening: true,
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
  chessnutBeepEnabled: true,
  estimatedElo: 1500,
  ratedGamesCount: 0,
  adaptiveStrength: false
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
    if (!raw) return { ...DEFAULT_SETTINGS, locale: detectLocale() }
    const stored = JSON.parse(raw) as Partial<AppSettings>
    // Nur beim allerersten Start (bzw. bei einem alten Settings-Blob ohne "locale") aus der
    // Systemsprache vorauswählen – eine bereits getroffene Auswahl (auch eine frühere
    // Auto-Erkennung) bleibt danach bestehen, statt bei jedem Start neu erkannt zu werden.
    const locale = stored.locale ?? detectLocale()
    return { ...DEFAULT_SETTINGS, ...stored, locale }
  } catch {
    return { ...DEFAULT_SETTINGS, locale: detectLocale() }
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* not fatal */
  }
}
