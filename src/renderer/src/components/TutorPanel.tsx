import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

function MessageBubble({
  message,
  tutor,
  boardPreview
}: {
  message: TutorMessage
  tutor: TutorApi
  boardPreview: BoardPreviewApi
}): React.JSX.Element {
  const { t } = useTranslation()
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
          {isActive ? t('tutor.hidePreview') : t('tutor.showPreview', { move: message.preview.sanMove })}
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
  const { t } = useTranslation()
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

  const MODES: { value: TutorMode; label: string; hint: string }[] = [
    { value: 'off', label: t('tutor.modeOffLabel'), hint: t('tutor.modeOffHint') },
    { value: 'mistakes', label: t('tutor.modeMistakesLabel'), hint: t('tutor.modeMistakesHint') },
    { value: 'chatty', label: t('tutor.modeChattyLabel'), hint: t('tutor.modeChattyHint') }
  ]

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
        <h2>{t('tutor.title')}</h2>
        <div className="mode-switch" role="radiogroup" aria-label={t('tutor.modeAriaLabel')}>
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
        <button className="btn" onClick={onUndo} disabled={!canUndo} title={t('tutor.undoHint')}>
          {t('tutor.undoMove')}
        </button>
        <button className="btn" onClick={onRedo} disabled={!canRedo} title={t('tutor.redoHint')}>
          {t('tutor.redoMove')}
        </button>
      </div>

      {showLegend && <VisualLegend />}

      {tutor.status && !tutor.status.hasApiKey ? (
        <p className="panel-empty">
          {t('report.noApiKey')}{' '}
          <button className="link-btn" onClick={onOpenSettings}>
            {t('report.setKeyNow')}
          </button>
        </p>
      ) : tutor.messages.length === 0 ? (
        <p className="panel-empty">{t('tutor.emptyPlaceholder')}</p>
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
          title={canSuggest ? t('tutor.suggestMoveHintReady') : t('tutor.suggestMoveHintWait')}
        >
          {t('tutor.suggestMove')}
        </button>
        <input
          id="tutor-question"
          type="text"
          value={input}
          placeholder={t('tutor.questionPlaceholder')}
          disabled={tutor.busy || !tutor.status?.hasApiKey}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <button className="btn" onClick={submit} disabled={tutor.busy || !input.trim()}>
          {t('tutor.send')}
        </button>
      </div>
    </section>
  )
}
