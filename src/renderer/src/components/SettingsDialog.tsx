import { useEffect, useState } from 'react'
import type { EngineKind, LlmProviderId, TutorStatus } from '../../../shared/types'
import { CLOCK_PRESETS, DEFAULT_SETTINGS, TUTOR_MODEL_KEY, type AppSettings, type ClockMode } from '../settings'

interface SettingsDialogProps {
  settings: AppSettings
  tutorStatus: TutorStatus | null
  onSave: (settings: AppSettings, apiKeyChange?: string) => void
  onClose: () => void
}

const ENGINE_KINDS: { value: EngineKind; label: string }[] = [
  { value: 'stockfish', label: 'Stockfish (klassisch, Elo-begrenzt)' },
  { value: 'maia', label: 'Maia (lc0, menschliches Spiel)' },
  { value: 'custom', label: 'Andere UCI-Engine' }
]

/** Bei CSSLab/maia-chess offiziell verfügbare Netz-Stärken (siehe scripts/fetch-engines.mjs). */
const MAIA_LEVELS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]

const CLOCK_MODES: { value: ClockMode; label: string }[] = [
  { value: 'unlimited', label: 'Frei (keine Zeitkontrolle)' },
  { value: 'classical', label: CLOCK_PRESETS.classical.label },
  { value: 'rapid', label: CLOCK_PRESETS.rapid.label },
  { value: 'blitz', label: CLOCK_PRESETS.blitz.label },
  { value: 'bullet', label: CLOCK_PRESETS.bullet.label }
]

const TUTOR_PROVIDERS: { value: LlmProviderId; label: string; keyPlaceholder: string; keyHint: string }[] = [
  { value: 'anthropic', label: 'Anthropic (Claude)', keyPlaceholder: 'sk-ant-…', keyHint: 'console.anthropic.com' },
  { value: 'openai', label: 'OpenAI (ChatGPT)', keyPlaceholder: 'sk-…', keyHint: 'platform.openai.com' },
  { value: 'google', label: 'Google (Gemini)', keyPlaceholder: 'AIza…', keyHint: 'aistudio.google.com' }
]

/** Verzeichnis eines Pfads, oder undefined bei einem bereits reinen Ordner-/Leerstring. */
function dirnameOf(path: string): string | undefined {
  const idx = path.lastIndexOf('/')
  return idx > 0 ? path.slice(0, idx) : undefined
}

/** Spielstärke aus einem "…/maia-1500.pb.gz"-Pfad, falls erkennbar. */
function levelFromWeightsPath(path: string): number | null {
  const m = /maia-(\d+)\.pb\.gz$/.exec(path)
  return m ? Number(m[1]) : null
}

export function SettingsDialog({
  settings,
  tutorStatus,
  onSave,
  onClose
}: SettingsDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState<AppSettings>({ ...settings })
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [deleteKey, setDeleteKey] = useState(false)
  const [defaultWeightsPath, setDefaultWeightsPath] = useState('')
  const [defaultLc0Path, setDefaultLc0Path] = useState('')

  useEffect(() => {
    window.api.getDefaultMaiaWeightsPath().then(setDefaultWeightsPath)
    window.api.getDefaultEnginePath('lc0').then((p) => setDefaultLc0Path(p ?? ''))
  }, [])

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void =>
    setDraft((d) => ({ ...d, [key]: value }))

  const browse = async (
    title: string,
    key: 'opponentPath' | 'weightsPath' | 'analysisPath',
    defaultPath?: string
  ): Promise<void> => {
    const path = await window.api.selectFile(title, defaultPath)
    if (path) update(key, path)
  }

  const selectClockMode = (mode: ClockMode): void => {
    update('clockMode', mode)
    // Sinnvolle Grundzeit/Inkrement für die gewählte Kategorie vorbelegen –
    // danach frei anpassbar, ohne dass ein erneuter Wechsel das wieder überschreibt.
    if (mode !== 'unlimited') {
      const preset = CLOCK_PRESETS[mode]
      update('clockBaseMinutes', preset.minutes)
      update('clockIncrementSeconds', preset.increment)
    }
  }

  const apiKeyChange = deleteKey ? '' : apiKeyInput.trim() ? apiKeyInput.trim() : undefined
  const activeTutorProvider = TUTOR_PROVIDERS.find((p) => p.value === draft.tutorProvider)!
  const tutorModelKey = TUTOR_MODEL_KEY[draft.tutorProvider]
  const tutorHasKey = tutorStatus?.hasApiKeyByProvider[draft.tutorProvider] ?? false

  const selectTutorProvider = (provider: LlmProviderId): void => {
    update('tutorProvider', provider)
    // Ein für einen anderen Provider getippter Key darf nicht versehentlich hier landen
    setApiKeyInput('')
    setDeleteKey(false)
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog settings-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Engine-Einstellungen</h2>

        <h3>Gegner-Engine</h3>
        <label>
          Engine-Art
          <select
            id="engine-kind"
            value={draft.engineKind}
            onChange={(e) => update('engineKind', e.target.value as EngineKind)}
          >
            {ENGINE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        {draft.engineKind === 'maia' ? (
          <>
            <label>
              Pfad zu lc0
              <div className="path-row">
                <input
                  id="opponent-path"
                  type="text"
                  value={draft.opponentPath}
                  onChange={(e) => update('opponentPath', e.target.value)}
                  placeholder="/opt/homebrew/bin/lc0"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    browse(
                      'lc0-Binary wählen',
                      'opponentPath',
                      dirnameOf(draft.opponentPath) ?? dirnameOf(defaultLc0Path)
                    )
                  }
                >
                  Durchsuchen…
                </button>
              </div>
            </label>
            <label>
              Spielstärke
              <select
                id="maia-level"
                value={levelFromWeightsPath(draft.weightsPath) ?? levelFromWeightsPath(defaultWeightsPath) ?? 1200}
                onChange={async (e) => {
                  const level = Number(e.target.value)
                  update('weightsPath', await window.api.getDefaultMaiaWeightsPath(level))
                }}
              >
                {MAIA_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    Elo ≈ {level}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Maia-Gewichtsdatei (.pb.gz)
              <div className="path-row">
                <input
                  id="weights-path"
                  type="text"
                  value={draft.weightsPath}
                  onChange={(e) => update('weightsPath', e.target.value)}
                  placeholder={defaultWeightsPath || '/pfad/zu/maia-1200.pb.gz'}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    browse(
                      'Maia-Gewichtsdatei wählen',
                      'weightsPath',
                      dirnameOf(draft.weightsPath) ?? dirnameOf(defaultWeightsPath)
                    )
                  }
                >
                  Durchsuchen…
                </button>
              </div>
            </label>
            <p className="field-hint">
              Die Stärkeauswahl oben setzt automatisch den passenden Pfad; eigene Netze (z. B.
              andere Stärken oder Varianten) lassen sich hier auch manuell wählen – weitere gibt es
              unter{' '}
              <a href="https://github.com/CSSLab/maia-chess/releases" target="_blank" rel="noreferrer">
                github.com/CSSLab/maia-chess
              </a>
              . Maia zieht ohne Suche direkt aus dem Netz – die Spielstärke steckt in der gewählten
              Datei, keine weitere Konfiguration nötig.
            </p>
          </>
        ) : (
          <>
            <label>
              Pfad zur Engine
              <div className="path-row">
                <input
                  id="opponent-path"
                  type="text"
                  value={draft.opponentPath}
                  onChange={(e) => update('opponentPath', e.target.value)}
                  placeholder="/opt/homebrew/bin/stockfish"
                  spellCheck={false}
                />
                <button type="button" className="btn" onClick={() => browse('Engine wählen', 'opponentPath')}>
                  Durchsuchen…
                </button>
              </div>
            </label>
            <label className="row">
              <input
                id="limit-strength"
                type="checkbox"
                checked={draft.limitStrength}
                onChange={(e) => update('limitStrength', e.target.checked)}
              />
              Spielstärke begrenzen (UCI_Elo)
            </label>
            <div className="field-row">
              <label>
                Elo
                <input
                  id="elo"
                  type="number"
                  min={1320}
                  max={3190}
                  step={10}
                  value={draft.elo}
                  disabled={!draft.limitStrength}
                  onChange={(e) => update('elo', Number(e.target.value))}
                />
              </label>
              <label>
                Bedenkzeit pro Zug (ms)
                <input
                  id="movetime"
                  type="number"
                  min={100}
                  max={30000}
                  step={100}
                  value={draft.moveTimeMs}
                  onChange={(e) => update('moveTimeMs', Number(e.target.value))}
                />
              </label>
            </div>
          </>
        )}

        <h3>Eröffnungsbuch</h3>
        <label className="row">
          <input
            id="use-opening-book"
            type="checkbox"
            checked={draft.useOpeningBook}
            onChange={(e) => update('useOpeningBook', e.target.checked)}
          />
          Für den Gegner nutzen (erste 10 Vollzüge)
        </label>
        <p className="field-hint">
          Der Gegner zieht dabei zufällig aus bekannten Eröffnungslinien statt immer nach dem
          Engine-Bestzug – realistischer und abwechslungsreicher. Danach übernimmt die Engine.
        </p>

        <h3>Bedenkzeit (Schachuhr)</h3>
        <label>
          Zeitkontrolle
          <select
            id="clock-mode"
            value={draft.clockMode}
            onChange={(e) => selectClockMode(e.target.value as ClockMode)}
          >
            {CLOCK_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {draft.clockMode !== 'unlimited' && (
          <div className="field-row">
            <label>
              Grundzeit (Minuten)
              <input
                id="clock-minutes"
                type="number"
                min={1}
                max={240}
                step={1}
                value={draft.clockBaseMinutes}
                onChange={(e) => update('clockBaseMinutes', Number(e.target.value))}
              />
            </label>
            <label>
              Inkrement (Sekunden/Zug)
              <input
                id="clock-increment"
                type="number"
                min={0}
                max={60}
                step={1}
                value={draft.clockIncrementSeconds}
                onChange={(e) => update('clockIncrementSeconds', Number(e.target.value))}
              />
            </label>
          </div>
        )}
        <p className="field-hint">
          {draft.clockMode === 'unlimited'
            ? 'Freies Spiel ohne Uhr – jede Seite hat beliebig viel Bedenkzeit.'
            : 'Läuft die Uhr einer Seite ab, verliert sie die Partie sofort durch Zeitüberschreitung. Speichern setzt beide Uhren auf die hier gewählte Grundzeit zurück.'}
        </p>

        <h3>Sound</h3>
        <label className="row">
          <input
            id="move-sound"
            type="checkbox"
            checked={draft.moveSoundEnabled}
            onChange={(e) => update('moveSoundEnabled', e.target.checked)}
          />
          Klick-Geräusch bei jedem Zug
        </label>

        <h3>Analyse-Engine (Stockfish)</h3>
        <label>
          Pfad zu Stockfish
          <div className="path-row">
            <input
              id="analysis-path"
              type="text"
              value={draft.analysisPath}
              onChange={(e) => update('analysisPath', e.target.value)}
              placeholder="/opt/homebrew/bin/stockfish"
              spellCheck={false}
            />
            <button type="button" className="btn" onClick={() => browse('Stockfish wählen', 'analysisPath')}>
              Durchsuchen…
            </button>
          </div>
        </label>

        <h3>LLM-Tutor</h3>
        <label>
          Anbieter
          <select
            id="tutor-provider"
            value={draft.tutorProvider}
            onChange={(e) => selectTutorProvider(e.target.value as LlmProviderId)}
          >
            {TUTOR_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Modell
          <input
            id="tutor-model"
            type="text"
            value={draft[tutorModelKey] as string}
            onChange={(e) => update(tutorModelKey, e.target.value as AppSettings[typeof tutorModelKey])}
            placeholder={DEFAULT_SETTINGS[tutorModelKey] as string}
            spellCheck={false}
          />
        </label>
        <label>
          API-Key {tutorHasKey && !deleteKey && <span className="key-state">✓ gespeichert (Keychain)</span>}
          <input
            id="tutor-api-key"
            type="password"
            value={apiKeyInput}
            onChange={(e) => {
              setApiKeyInput(e.target.value)
              setDeleteKey(false)
            }}
            placeholder={tutorHasKey ? 'Neuen Key eingeben, um zu ersetzen' : activeTutorProvider.keyPlaceholder}
            spellCheck={false}
          />
        </label>
        <p className="field-hint">API-Key erhältlich unter {activeTutorProvider.keyHint}.</p>
        {tutorHasKey && (
          <label className="row">
            <input
              id="delete-key"
              type="checkbox"
              checked={deleteKey}
              onChange={(e) => setDeleteKey(e.target.checked)}
            />
            Gespeicherten Key löschen
          </label>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={() => onSave(draft, apiKeyChange)}>
            Speichern &amp; anwenden
          </button>
        </div>
      </div>
    </div>
  )
}
