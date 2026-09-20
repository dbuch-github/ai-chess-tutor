import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EngineKind, LlmProviderId, TutorStatus } from '../../../shared/types'
import {
  CLOCK_PRESETS,
  DEFAULT_SETTINGS,
  levelFromWeightsPath,
  MAIA_LEVELS,
  TUTOR_MODEL_KEY,
  type AppSettings,
  type ClockMode
} from '../settings'

interface SettingsDialogProps {
  settings: AppSettings
  tutorStatus: TutorStatus | null
  onSave: (settings: AppSettings, apiKeyChange?: string) => void
  onClose: () => void
}

const TUTOR_KEY_HINTS: Record<LlmProviderId, { label: string; keyPlaceholder: string; keyHint: string }> = {
  anthropic: { label: 'Anthropic (Claude)', keyPlaceholder: 'sk-ant-…', keyHint: 'console.anthropic.com' },
  openai: { label: 'OpenAI (ChatGPT)', keyPlaceholder: 'sk-…', keyHint: 'platform.openai.com' },
  google: { label: 'Google (Gemini)', keyPlaceholder: 'AIza…', keyHint: 'aistudio.google.com' }
}
const TUTOR_PROVIDER_IDS: LlmProviderId[] = ['anthropic', 'openai', 'google']

/** Verzeichnis eines Pfads, oder undefined bei einem bereits reinen Ordner-/Leerstring. */
function dirnameOf(path: string): string | undefined {
  const idx = path.lastIndexOf('/')
  return idx > 0 ? path.slice(0, idx) : undefined
}

export function SettingsDialog({
  settings,
  tutorStatus,
  onSave,
  onClose
}: SettingsDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<AppSettings>({ ...settings })
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [deleteKey, setDeleteKey] = useState(false)
  const [defaultWeightsPath, setDefaultWeightsPath] = useState('')
  const [defaultLc0Path, setDefaultLc0Path] = useState('')

  useEffect(() => {
    window.api.getDefaultMaiaWeightsPath().then(setDefaultWeightsPath)
    window.api.getDefaultEnginePath('lc0').then((p) => setDefaultLc0Path(p ?? ''))
  }, [])

  const ENGINE_KINDS: { value: EngineKind; label: string }[] = [
    { value: 'stockfish', label: t('settings.engineKindStockfish') },
    { value: 'maia', label: t('settings.engineKindMaia') },
    { value: 'custom', label: t('settings.engineKindCustom') }
  ]

  const CLOCK_MODES: { value: ClockMode; label: string }[] = [
    { value: 'unlimited', label: t('clock.presets.unlimited') },
    { value: 'classical', label: t('clock.presets.classical') },
    { value: 'rapid', label: t('clock.presets.rapid') },
    { value: 'blitz', label: t('clock.presets.blitz') },
    { value: 'bullet', label: t('clock.presets.bullet') }
  ]

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
  const activeTutorProvider = TUTOR_KEY_HINTS[draft.tutorProvider]
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
        <h2>{t('settings.title')}</h2>

        <h3>{t('settings.opponentEngine')}</h3>
        <label>
          {t('settings.engineKind')}
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
              {t('settings.pathToLc0')}
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
                      t('settings.chooseLc0Binary'),
                      'opponentPath',
                      dirnameOf(draft.opponentPath) ?? dirnameOf(defaultLc0Path)
                    )
                  }
                >
                  {t('settings.browse')}
                </button>
              </div>
            </label>
            <label>
              {t('settings.strength')}
              <select
                id="maia-level"
                value={levelFromWeightsPath(draft.weightsPath) ?? levelFromWeightsPath(defaultWeightsPath) ?? 1200}
                disabled={draft.adaptiveStrength}
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
              {t('settings.maiaWeightsFile')}
              <div className="path-row">
                <input
                  id="weights-path"
                  type="text"
                  value={draft.weightsPath}
                  onChange={(e) => update('weightsPath', e.target.value)}
                  placeholder={defaultWeightsPath || t('settings.maiaPathPlaceholder')}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    browse(
                      t('settings.chooseMaiaWeights'),
                      'weightsPath',
                      dirnameOf(draft.weightsPath) ?? dirnameOf(defaultWeightsPath)
                    )
                  }
                >
                  {t('settings.browse')}
                </button>
              </div>
            </label>
            <p className="field-hint">
              {t('settings.maiaHintBeforeLink')}
              <a href="https://github.com/CSSLab/maia-chess/releases" target="_blank" rel="noreferrer">
                github.com/CSSLab/maia-chess
              </a>
              {t('settings.maiaHintAfterLink')}
            </p>
          </>
        ) : (
          <>
            <label>
              {t('settings.pathToEngine')}
              <div className="path-row">
                <input
                  id="opponent-path"
                  type="text"
                  value={draft.opponentPath}
                  onChange={(e) => update('opponentPath', e.target.value)}
                  placeholder="/opt/homebrew/bin/stockfish"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => browse(t('settings.chooseEngine'), 'opponentPath')}
                >
                  {t('settings.browse')}
                </button>
              </div>
            </label>
            <label className="row">
              <input
                id="limit-strength"
                type="checkbox"
                checked={draft.limitStrength}
                disabled={draft.adaptiveStrength}
                onChange={(e) => update('limitStrength', e.target.checked)}
              />
              {t('settings.limitStrength')}
            </label>
            <div className="field-row">
              <label>
                {t('settings.elo')}
                <input
                  id="elo"
                  type="number"
                  min={1320}
                  max={3190}
                  step={10}
                  value={draft.elo}
                  disabled={!draft.limitStrength || draft.adaptiveStrength}
                  onChange={(e) => update('elo', Number(e.target.value))}
                />
              </label>
              <label>
                {t('settings.moveTimeMs')}
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

        {draft.engineKind !== 'custom' && (
          <>
            <label className="row">
              <input
                id="adaptive-strength"
                type="checkbox"
                checked={draft.adaptiveStrength}
                onChange={(e) => update('adaptiveStrength', e.target.checked)}
              />
              {t('settings.adaptiveStrength')}
            </label>
            <p className="field-hint">
              {t('settings.estimatedEloHint', { elo: draft.estimatedElo, games: draft.ratedGamesCount })}
            </p>
          </>
        )}

        <h3>{t('settings.openingBook')}</h3>
        <label className="row">
          <input
            id="use-opening-book"
            type="checkbox"
            checked={draft.useOpeningBook}
            onChange={(e) => update('useOpeningBook', e.target.checked)}
          />
          {t('settings.useOpeningBookForOpponent')}
        </label>
        <p className="field-hint">{t('settings.openingBookHint')}</p>

        <h3>{t('settings.clock')}</h3>
        <label>
          {t('settings.timeControl')}
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
              {t('settings.baseTimeMinutes')}
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
              {t('settings.incrementSeconds')}
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
          {draft.clockMode === 'unlimited' ? t('settings.clockHintUnlimited') : t('settings.clockHintTimed')}
        </p>

        <h3>{t('settings.sound')}</h3>
        <label className="row">
          <input
            id="move-sound"
            type="checkbox"
            checked={draft.moveSoundEnabled}
            onChange={(e) => update('moveSoundEnabled', e.target.checked)}
          />
          {t('settings.moveSoundLabel')}
        </label>

        <h3>{t('settings.analysisEngine')}</h3>
        <label>
          {t('settings.pathToStockfish')}
          <div className="path-row">
            <input
              id="analysis-path"
              type="text"
              value={draft.analysisPath}
              onChange={(e) => update('analysisPath', e.target.value)}
              placeholder="/opt/homebrew/bin/stockfish"
              spellCheck={false}
            />
            <button type="button" className="btn" onClick={() => browse(t('settings.chooseStockfish'), 'analysisPath')}>
              {t('settings.browse')}
            </button>
          </div>
        </label>

        <h3>{t('settings.llmTutor')}</h3>
        <label>
          {t('settings.provider')}
          <select
            id="tutor-provider"
            value={draft.tutorProvider}
            onChange={(e) => selectTutorProvider(e.target.value as LlmProviderId)}
          >
            {TUTOR_PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {TUTOR_KEY_HINTS[id].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('settings.model')}
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
          {t('settings.apiKey')}{' '}
          {tutorHasKey && !deleteKey && <span className="key-state">{t('settings.apiKeySavedKeychain')}</span>}
          <input
            id="tutor-api-key"
            type="password"
            value={apiKeyInput}
            onChange={(e) => {
              setApiKeyInput(e.target.value)
              setDeleteKey(false)
            }}
            placeholder={tutorHasKey ? t('settings.apiKeyReplacePlaceholder') : activeTutorProvider.keyPlaceholder}
            spellCheck={false}
          />
        </label>
        <p className="field-hint">{t('settings.apiKeyAvailableAt', { hint: activeTutorProvider.keyHint })}</p>
        {tutorHasKey && (
          <label className="row">
            <input
              id="delete-key"
              type="checkbox"
              checked={deleteKey}
              onChange={(e) => setDeleteKey(e.target.checked)}
            />
            {t('settings.deleteStoredKey')}
          </label>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            {t('settings.cancel')}
          </button>
          <button className="btn primary" onClick={() => onSave(draft, apiKeyChange)}>
            {t('settings.saveAndApply')}
          </button>
        </div>
      </div>
    </div>
  )
}
