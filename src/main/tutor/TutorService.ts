import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AnthropicProvider } from './providers/AnthropicProvider'
import { OpenAIProvider } from './providers/OpenAIProvider'
import { GoogleProvider } from './providers/GoogleProvider'
import type { ChatTurn, LlmProvider } from './providers/types'
import { CLASSIFY_LABELS } from '../../shared/classifyLabels'
import type {
  LlmProviderId,
  SupportedLocale,
  TutorMoveRequest,
  TutorQuestionRequest,
  TutorReportRequest,
  TutorRequest,
  TutorResult,
  TutorStatus,
  TutorSuggestRequest
} from '../../shared/types'

/** Name der Zielsprache für den letzten Satz des System-Prompts (siehe buildSystemPrompt). */
const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  en: 'Englisch',
  de: 'Deutsch',
  fr: 'Französisch',
  es: 'Spanisch',
  it: 'Italienisch',
  pt: 'Portugiesisch',
  ru: 'Russisch',
  ar: 'Arabisch',
  pl: 'Polnisch',
  tr: 'Türkisch',
  zh: 'Mandarin-Chinesisch',
  hi: 'Hindi',
  el: 'Griechisch',
  sr: 'Serbisch',
  hr: 'Kroatisch'
}

/** Kurze Statusmeldungen, die direkt im Tutor-Chat landen (siehe send() unten). */
const NO_API_KEY_MESSAGE: Record<SupportedLocale, string> = {
  en: 'No API key set – please add one in Settings (⚙︎).',
  de: 'Kein API-Key hinterlegt – bitte in den Einstellungen (⚙︎) setzen.',
  fr: "Aucune clé API définie – merci d'en ajouter une dans les paramètres (⚙︎).",
  es: 'No hay una clave de API configurada – añade una en Ajustes (⚙︎).',
  it: 'Nessuna chiave API impostata – aggiungine una nelle Impostazioni (⚙︎).',
  pt: 'Nenhuma chave de API definida – adicione uma nas Configurações (⚙︎).',
  ru: 'API-ключ не задан – добавьте его в настройках (⚙︎).',
  ar: 'لم يتم تعيين مفتاح API – يرجى إضافة واحد في الإعدادات (⚙︎).',
  pl: 'Nie ustawiono klucza API – dodaj go w Ustawieniach (⚙︎).',
  tr: "API anahtarı ayarlanmadı – lütfen Ayarlar'da (⚙︎) bir tane ekleyin.",
  zh: '尚未设置 API 密钥——请在设置 (⚙︎) 中添加一个。',
  hi: 'कोई API कुंजी सेट नहीं है – कृपया सेटिंग्स (⚙︎) में एक जोड़ें।',
  el: 'Δεν έχει οριστεί κλειδί API – προσθέστε ένα στις Ρυθμίσεις (⚙︎).',
  sr: 'API ključ nije podešen – dodaj ga u Podešavanjima (⚙︎).',
  hr: 'API ključ nije postavljen – dodaj ga u Postavkama (⚙︎).'
}
const TUTOR_BUSY_MESSAGE: Record<SupportedLocale, string> = {
  en: 'The tutor is already answering – please wait a moment.',
  de: 'Der Tutor antwortet gerade – bitte kurz warten.',
  fr: "Le tuteur est en train de répondre – merci de patienter un instant.",
  es: 'El tutor ya está respondiendo – espera un momento.',
  it: 'Il tutor sta già rispondendo – attendi un momento.',
  pt: 'O tutor já está respondendo – aguarde um momento.',
  ru: 'Тренер уже отвечает – подождите немного.',
  ar: 'المعلم يجيب حاليًا – يرجى الانتظار لحظة.',
  pl: 'Trener właśnie odpowiada – proszę chwilę poczekać.',
  tr: 'Öğretmen şu anda yanıt veriyor – lütfen biraz bekleyin.',
  zh: '导师正在回答——请稍候片刻。',
  hi: 'शिक्षक अभी उत्तर दे रहे हैं – कृपया थोड़ा इंतज़ार करें।',
  el: 'Ο δάσκαλος απαντά ήδη – περιμένετε λίγο.',
  sr: 'Trener upravo odgovara – sačekaj trenutak.',
  hr: 'Trener upravo odgovara – pričekaj trenutak.'
}

/**
 * Das Prompt-Gerüst bleibt bewusst auf Deutsch – ein LLM befolgt eine auf Deutsch formulierte
 * Anweisung "Antworte auf Englisch" problemlos, ein Neuschreiben des kompletten Prompt-Baus in
 * 5 Sprachen wäre unnötiges Risiko für keinen Mehrwert. Nur der Satz zur Antwortsprache ist dynamisch.
 */
function buildSystemPrompt(locale: SupportedLocale): string {
  return `Du bist ein erfahrener, freundlicher Schachtrainer. Du begleitest eine laufende Schachpartie – meist einen Schüler gegen eine Engine, manchmal auch eine über das Brett gespielte Partie zwischen zwei Personen. Die jeweilige Anfrage sagt dir, welcher Fall gerade vorliegt.

Regeln für deine Antworten:
- Du bekommst zu jeder Anfrage die Fakten vorgerechnet: Stellung (FEN), Partieverlauf, Stockfish-Bewertungen und die besten Engine-Varianten. Stütze dich ausschließlich darauf.
- Erfinde niemals eigene Varianten oder Zugfolgen, die nicht in den gelieferten Engine-Daten stehen. Wenn du einen konkreten Zug nennst, muss er aus den gelieferten Daten stammen.
- Erkläre didaktisch: Welches Motiv oder welcher Plan wurde übersehen? Was ist die Idee hinter dem besseren Zug? Nutze schachliche Konzepte (Entwicklung, Zentrum, Königssicherheit, schwache Felder, Aktivität).
- Sprich den Schüler mit "du" an (bzw. dem jeweiligen Äquivalent in der Zielsprache). Antworte auf ${LANGUAGE_NAMES[locale]}.
- Halte Zugkommentare kurz: 2 bis 4 Sätze, kein Vorgeplänkel, keine Überschriften.
- Bei Rückfragen darfst du etwas ausführlicher werden, bleibe aber unter 150 Wörtern.
- Die Notation in den Daten ist SAN mit englischen Figurenbuchstaben (N=Springer, B=Läufer, R=Turm, Q=Dame, K=König). Verwende in deiner Antwort dieselbe Notation.`
}

const DEFAULT_MODELS: Record<LlmProviderId, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5.1',
  google: 'gemini-3.1-pro'
}

const PROVIDER_IDS: LlmProviderId[] = ['anthropic', 'openai', 'google']

interface StoredConfig {
  provider: LlmProviderId
  models: Partial<Record<LlmProviderId, string>>
  encryptedKeys: Partial<Record<LlmProviderId, string>>
}

/** Altes Format vor der Multi-Provider-Umstellung: nur Anthropic, flach. */
interface LegacyStoredConfig {
  model?: string
  encryptedKey?: string
}

export class TutorService {
  private anthropicProvider = new AnthropicProvider()
  private providers: Record<LlmProviderId, LlmProvider>
  private activeProvider: LlmProviderId = 'anthropic'
  private models: Record<LlmProviderId, string> = { ...DEFAULT_MODELS }
  private history: ChatTurn[] = []
  private busy = false
  private configPath = join(app.getPath('userData'), 'tutor-config.json')

  constructor() {
    this.providers = {
      anthropic: this.anthropicProvider,
      openai: new OpenAIProvider(),
      google: new GoogleProvider()
    }
    this.loadConfig()
  }

  status(): TutorStatus {
    return {
      provider: this.activeProvider,
      hasApiKey: this.providers[this.activeProvider].isConfigured(),
      model: this.models[this.activeProvider],
      hasApiKeyByProvider: {
        anthropic: this.providers.anthropic.isConfigured(),
        openai: this.providers.openai.isConfigured(),
        google: this.providers.google.isConfigured()
      }
    }
  }

  configure(provider: LlmProviderId, model: string, apiKey?: string): TutorStatus {
    this.activeProvider = provider
    this.models[provider] = model.trim() || DEFAULT_MODELS[provider]
    if (apiKey !== undefined) {
      if (apiKey === '') {
        this.providers[provider].clearClient()
      } else {
        this.providers[provider].configure(apiKey)
      }
      this.saveConfig({ provider, apiKey })
    } else {
      this.saveConfig()
    }
    return this.status()
  }

  /** Neue Partie: Gesprächskontext verwerfen. */
  reset(): void {
    this.history = []
  }

  async send(request: TutorRequest, onDelta: (text: string) => void): Promise<TutorResult> {
    const provider = this.providers[this.activeProvider]
    if (!provider.isConfigured()) {
      return { ok: false, error: NO_API_KEY_MESSAGE[request.locale] }
    }
    if (this.busy) {
      return { ok: false, error: TUTOR_BUSY_MESSAGE[request.locale] }
    }
    this.busy = true
    try {
      const userText = buildPrompt(request)
      this.history.push({ role: 'user', text: userText })
      this.trimHistory()

      // Zugkommentare/Vorschläge laufen günstig mit niedrigem Effort; der
      // Partie-Report bündelt eine ganze Partie und darf sich das leisten,
      // weil er nur am Partieende bzw. auf Anfrage einmal anfällt. Effort
      // wirkt nur bei Anthropic und (als Reasoning-Effort) bei OpenAI.
      const effort = request.kind === 'report' ? 'high' : 'low'
      const text = await provider.send({
        model: this.models[this.activeProvider],
        systemPrompt: buildSystemPrompt(request.locale),
        history: this.history,
        maxTokens: effort === 'high' ? 4000 : 2000,
        effort,
        onDelta
      })
      this.history.push({ role: 'assistant', text })
      return { ok: true, text }
    } catch (err) {
      // fehlgeschlagene Anfrage nicht in der Historie lassen
      if (this.history.at(-1)?.role === 'user') this.history.pop()
      return { ok: false, error: provider.describeError(err) }
    } finally {
      this.busy = false
    }
  }

  private trimHistory(): void {
    // Kontext klein halten: die letzten 24 Nachrichten reichen für Rückfragen
    if (this.history.length > 24) {
      this.history = this.history.slice(-24)
      // Historie muss mit einer user-Nachricht beginnen
      while (this.history.length > 0 && this.history[0].role !== 'user') {
        this.history.shift()
      }
    }
  }

  private loadConfig(): void {
    try {
      const raw = JSON.parse(readFileSync(this.configPath, 'utf8')) as Partial<StoredConfig> & LegacyStoredConfig
      if (!raw.provider && (raw.model || raw.encryptedKey)) {
        // Migration: Konfiguration von vor der Multi-Provider-Umstellung (nur Anthropic)
        this.activeProvider = 'anthropic'
        if (raw.model) this.models.anthropic = raw.model
        if (raw.encryptedKey) this.decryptAndConfigure('anthropic', raw.encryptedKey)
      } else {
        this.activeProvider = raw.provider ?? 'anthropic'
        for (const id of PROVIDER_IDS) {
          const model = raw.models?.[id]
          if (model) this.models[id] = model
          const encryptedKey = raw.encryptedKeys?.[id]
          if (encryptedKey) this.decryptAndConfigure(id, encryptedKey)
        }
      }
    } catch {
      /* keine Konfiguration vorhanden */
    }
    // Dev-Komfort: Umgebungsvariablen nutzen, wenn für Anthropic kein Key gespeichert ist
    // (bare Anthropic() löst zusätzlich ANTHROPIC_AUTH_TOKEN/OAuth-Profile auf, nicht nur die Env-Variable)
    if (!this.anthropicProvider.isConfigured() && (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) {
      this.anthropicProvider.configureFromEnv()
    }
  }

  private decryptAndConfigure(provider: LlmProviderId, encryptedKey: string): void {
    if (!safeStorage.isEncryptionAvailable()) return
    try {
      const key = safeStorage.decryptString(Buffer.from(encryptedKey, 'base64'))
      this.providers[provider].configure(key)
    } catch (err) {
      console.error(`[tutor] Gespeicherter Key für ${provider} konnte nicht entschlüsselt werden:`, err)
    }
  }

  private saveConfig(change?: { provider: LlmProviderId; apiKey: string }): void {
    try {
      let stored: StoredConfig
      try {
        stored = JSON.parse(readFileSync(this.configPath, 'utf8')) as StoredConfig
      } catch {
        stored = { provider: this.activeProvider, models: {}, encryptedKeys: {} }
      }
      stored.provider = this.activeProvider
      stored.models = { ...stored.models, ...this.models }
      stored.encryptedKeys = stored.encryptedKeys ?? {}
      if (change) {
        if (change.apiKey === '') {
          delete stored.encryptedKeys[change.provider]
        } else if (safeStorage.isEncryptionAvailable()) {
          stored.encryptedKeys[change.provider] = safeStorage.encryptString(change.apiKey).toString('base64')
        }
      }
      writeFileSync(this.configPath, JSON.stringify(stored))
    } catch (err) {
      console.error('[tutor] Konfiguration konnte nicht gespeichert werden:', err)
    }
  }
}

function buildPrompt(request: TutorRequest): string {
  switch (request.kind) {
    case 'move':
      return formatMovePrompt(request)
    case 'suggest':
      return formatSuggestPrompt(request)
    case 'report':
      return formatReportPrompt(request)
    case 'question':
      return formatQuestionPrompt(request)
  }
}

function formatMovePrompt(r: TutorMoveRequest): string {
  const moveLabel = `${r.moveNumber}${r.color === 'w' ? '.' : '…'} ${r.san}`
  const moverSide = r.color === 'w' ? 'Weiß' : 'Schwarz'
  const who = r.twoPlayerMode ? moverSide : r.color === r.playerColor ? 'Der Schüler' : 'Die Gegner-Engine'
  const context = r.twoPlayerMode
    ? `Spielphase: ${r.phase}. Dies ist eine über das Brett gespielte Partie zwischen zwei Personen (kein Engine-Gegner).`
    : `Spielphase: ${r.phase}. Der Schüler spielt ${r.playerColor === 'w' ? 'Weiß' : 'Schwarz'}.`
  return [
    `${who} hat gerade ${moveLabel} gespielt – laut Stockfish ${classifyLabel(r.classification, r.locale)} (−${r.lossPct.toFixed(0)} % Gewinnchance, Bewertung aus Weiß-Sicht vorher ${r.evalBefore}, nachher ${r.evalAfter}).`,
    ``,
    context,
    `Partie bisher: ${r.historySan}`,
    `Stellung vor dem Zug (FEN): ${r.fenBefore}`,
    `Bester Zug laut Stockfish war ${r.bestMoveSan}, Hauptvariante: ${r.bestLineSan}`,
    ``,
    r.twoPlayerMode
      ? `Erkläre kurz, warum der Zug von ${moverSide} problematisch war und welche Idee ${r.bestMoveSan} verfolgt.`
      : r.color === r.playerColor
        ? `Erkläre dem Schüler kurz, warum sein Zug problematisch war und welche Idee ${r.bestMoveSan} verfolgt.`
        : `Erkläre dem Schüler kurz, warum der Engine-Zug schwach war und wie er das jetzt ausnutzen kann (bester Zug: ${r.bestMoveSan}).`
  ].join('\n')
}

function formatSuggestPrompt(r: TutorSuggestRequest): string {
  return [
    `Der Schüler bittet um einen Zugvorschlag für die aktuelle Stellung.`,
    ``,
    `Aktuelle Stellung (FEN): ${r.fen}, ${r.turn === 'w' ? 'Weiß' : 'Schwarz'} am Zug. Der Schüler spielt ${r.playerColor === 'w' ? 'Weiß' : 'Schwarz'}.`,
    `Partie bisher: ${r.historySan || '(noch keine Züge)'}`,
    `Stockfish-Bewertung (aus Weiß-Sicht): ${r.evalNow}`,
    `Empfohlener Zug laut Stockfish: ${r.bestMoveSan}, Hauptvariante: ${r.bestLineSan}`,
    ``,
    `Erkläre kurz die Idee hinter ${r.bestMoveSan} (welcher Plan, welches Motiv). Nenne keine anderen Züge als die gelieferte Variante.`
  ].join('\n')
}

/** Klassifikations-Label in der Zielsprache – Fallback auf den rohen Schlüssel für 'good' (kein Label vorgesehen). */
function classifyLabel(classification: string, locale: SupportedLocale): string {
  const labels: Record<string, string> = CLASSIFY_LABELS[locale]
  return labels[classification] ?? classification
}

function formatReportPrompt(r: TutorReportRequest): string {
  const mistakesList = r.mistakes.length
    ? r.mistakes
        .map((m) => {
          const who = r.twoPlayerMode ? `${m.color === 'w' ? 'Weiß' : 'Schwarz'}: ` : ''
          const moveLabel = `${m.moveNumber}${m.color === 'w' ? '.' : '…'} ${m.san}`
          return `${who}${moveLabel} (${classifyLabel(m.classification, r.locale)}, −${m.lossPct.toFixed(0)} %)`
        })
        .join('; ')
    : '(keine groben Fehler erkannt)'
  const introLine = r.twoPlayerMode
    ? `Die Partie ist zu Ende. Ergebnis: ${r.result}. Es war eine über das Brett gespielte Partie zwischen zwei Personen (Weiß und Schwarz), kein Engine-Gegner.`
    : `Die Partie ist zu Ende. Ergebnis: ${r.result}. Der Schüler spielte ${r.playerColor === 'w' ? 'Weiß' : 'Schwarz'}.`
  const mistakesLabel = r.twoPlayerMode ? 'Fehler beider Seiten während der Partie' : 'Fehler des Schülers während der Partie'
  const statsLabel = r.twoPlayerMode ? 'Statistik der Partie (beide Seiten zusammen)' : 'Statistik des Schülers'
  const totalLabel = r.twoPlayerMode ? 'Zügen insgesamt' : 'eigenen Zügen'
  return [
    introLine,
    `Vollständige Partie (SAN): ${r.historySan}`,
    ``,
    `${mistakesLabel} (Zugnummer, Zug, Klassifikation, Verlust an Gewinnchance): ${mistakesList}`,
    `${statsLabel}: ${r.stats.blunders} Blunder, ${r.stats.mistakes} Fehler, ${r.stats.inaccuracies} Ungenauigkeiten, ${r.stats.bestMoves} beste Züge von ${r.stats.totalMoves} ${totalLabel}.`,
    ``,
    `Schreibe einen Partie-Report ${r.twoPlayerMode ? 'für beide Spieler' : 'für den Schüler'} mit drei Teilen:`,
    `1) Wiederkehrende Fehlermuster, falls in der obigen Liste erkennbar (sonst diesen Teil weglassen).`,
    `2) Die wichtigsten kritischen Momente aus der obigen Liste, kurz erklärt.`,
    `3) Zwei bis drei konkrete, umsetzbare Lernpunkte für die nächste Partie.`,
    `Stütze dich ausschließlich auf die oben gelisteten Fehler und die Statistik – erfinde keine weiteren Zugfehler oder Varianten, die dort nicht stehen. Fließtext mit kurzen Absätzen, keine Überschriften, insgesamt maximal etwa 180 Wörter.`
  ].join('\n')
}

function formatQuestionPrompt(r: TutorQuestionRequest): string {
  return [
    `Frage des Schülers: ${r.question}`,
    ``,
    `Aktuelle Stellung (FEN): ${r.fen}, ${r.turn === 'w' ? 'Weiß' : 'Schwarz'} am Zug. Der Schüler spielt ${r.playerColor === 'w' ? 'Weiß' : 'Schwarz'}.`,
    `Partie bisher: ${r.historySan || '(noch keine Züge)'}`,
    `Stockfish-Bewertung (aus Weiß-Sicht): ${r.evalNow}`,
    `Beste Varianten laut Stockfish:`,
    ...r.linesSan.map((l, i) => `${i + 1}) ${l}`)
  ].join('\n')
}
