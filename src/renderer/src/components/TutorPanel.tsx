import { useEffect, useRef, useState } from 'react'
import type { TutorApi, TutorMessage } from '../game/useTutor'
import type { BoardPreviewApi } from '../game/useBoardPreview'
import type { TutorMode } from '../settings'
import { figurineText } from './Figurine'
import { VisualLegend } from './VisualLegend'

interface TutorPanelProps {
  tutor: TutorApi
  boardPreview: BoardPreviewApi
  mode: TutorMode
  canSuggest: boolean
  onModeChange: (mode: TutorMode) => void
  onOpenSettings: () => void
  onUndo: () => void
  canUndo: boolean
  onRedo: () => void
  canRedo: boolean
}

const MODES: { value: TutorMode; label: string; hint: string }[] = [
  { value: 'off', label: 'Still', hint: 'Nur auf Nachfrage' },
  { value: 'mistakes', label: 'Fehler', hint: 'Kommentiert deine Fehler und Blunder' },
  { value: 'chatty', label: 'Aktiv', hint: 'Auch Ungenauigkeiten und Engine-Patzer' }
]

function MessageBubble({
  message,
  tutor,
  boardPreview
}: {
  message: TutorMessage
  tutor: TutorApi
  boardPreview: BoardPreviewApi
}): React.JSX.Element {
  const isActive = boardPreview.isActive(`msg-${message.id}`)
  return (
    <div className={`tutor-msg ${message.role}`}>
      {figurineText(message.text)}
      {message.streaming && <span className="cursor">▍</span>}
      {message.preview && !message.streaming && (
        <button
          className={`preview-toggle ${isActive ? 'active' : ''}`}
          onClick={() => tutor.togglePreview(message)}
        >
          {isActive ? '✕ Vorschlag ausblenden' : `↗ ${message.preview.sanMove} auf dem Brett zeigen`}
        </button>
      )}
    </div>
  )
}

export function TutorPanel({
  tutor,
  boardPreview,
  mode,
  canSuggest,
  onModeChange,
  onOpenSettings,
  onUndo,
  canUndo,
  onRedo,
  canRedo
}: TutorPanelProps): React.JSX.Element {
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const lastMessage = tutor.messages.at(-1)
  const s = boardPreview.active
  const showLegend =
    !!s &&
    (s.attacks.length > 0 ||
      s.defends.length > 0 ||
      s.pins.length > 0 ||
      s.isCheck ||
      s.discovered.length > 0 ||
      s.weak.length > 0 ||
      s.followUp.length > 0)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [tutor.messages.length, lastMessage?.text.length])

  const submit = (): void => {
    const question = input.trim()
    if (!question || tutor.busy) return
    setInput('')
    tutor.ask(question)
  }

  return (
    <section className="panel tutor-panel">
      <header className="panel-header">
        <h2>Tutor</h2>
        <div className="mode-switch" role="radiogroup" aria-label="Tutor-Modus">
          {MODES.map((m) => (
            <button
              key={m.value}
              title={m.hint}
              className={`mode-btn ${mode === m.value ? 'active' : ''}`}
              onClick={() => onModeChange(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <div className="move-controls">
        <button className="btn" onClick={onUndo} disabled={!canUndo} title="Letzten Zug zurücknehmen">
          ↶ Zurücknehmen
        </button>
        <button className="btn" onClick={onRedo} disabled={!canRedo} title="Zurückgenommenen Zug wiederherstellen">
          ↷ Wiederherstellen
        </button>
      </div>

      {showLegend && <VisualLegend />}

      {tutor.status && !tutor.status.hasApiKey ? (
        <p className="panel-empty">
          Kein API-Key hinterlegt.{' '}
          <button className="link-btn" onClick={onOpenSettings}>
            Jetzt in den Einstellungen setzen
          </button>
        </p>
      ) : tutor.messages.length === 0 ? (
        <p className="panel-empty">
          Ich melde mich bei Fehlern – oder frag mich direkt, z. B. „Was ist hier der Plan?“ Auch die
          Analyse-Linien oben lassen sich anklicken.
        </p>
      ) : (
        <div className="tutor-messages cg-wrap">
          {tutor.messages.map((m) => (
            <MessageBubble key={m.id} message={m} tutor={tutor} boardPreview={boardPreview} />
          ))}
          <div ref={endRef} />
        </div>
      )}

      <div className="tutor-input">
        <button
          className="btn"
          onClick={tutor.suggestMove}
          disabled={!canSuggest || tutor.busy || !tutor.status?.hasApiKey}
          title={canSuggest ? 'Zugvorschlag mit Erklärung anfordern' : 'Erst wenn du am Zug bist und die Analyse bereit ist'}
        >
          💡 Zugvorschlag
        </button>
        <input
          id="tutor-question"
          type="text"
          value={input}
          placeholder="Frage an den Tutor …"
          disabled={tutor.busy || !tutor.status?.hasApiKey}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <button className="btn" onClick={submit} disabled={tutor.busy || !input.trim()}>
          Senden
        </button>
      </div>
    </section>
  )
}
