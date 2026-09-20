import { useTranslation } from 'react-i18next'
import type { ChessnutBoardApi } from '../chessnut/useChessnutBoard'
import type { ChessnutSyncApi } from '../chessnut/useChessnutSync'
import { HelpHint } from './HelpHint'

interface ChessnutPanelProps {
  chessnut: ChessnutBoardApi
  sync: ChessnutSyncApi
  bestMoveBlink: boolean
  onToggleBestMoveBlink: () => void
  /** false im Zwei-Spieler-Modus – der Bestzug-Toggle wird dann ausgeblendet (würde live verraten). */
  bestMoveAvailable: boolean
  beepEnabled: boolean
  onToggleBeep: () => void
}

/** Einzeiler unter dem Brett: Status, Batterie und Korrekturhinweis kompakt in einer Zeile. */
export function ChessnutPanel({
  chessnut,
  sync,
  bestMoveBlink,
  onToggleBestMoveBlink,
  bestMoveAvailable,
  beepEnabled,
  onToggleBeep
}: ChessnutPanelProps): React.JSX.Element {
  const { t } = useTranslation()
  const connected = chessnut.status === 'connected'

  const STATUS_LABELS: Record<ChessnutBoardApi['status'], string> = {
    unsupported: t('chessnut.statusUnsupported'),
    disconnected: t('chessnut.statusDisconnected'),
    connecting: t('chessnut.statusConnecting'),
    connected: t('chessnut.statusConnected'),
    error: t('chessnut.statusError')
  }

  return (
    <div className="chessnut-bar">
      <span className="chessnut-bar-label">♟️ Chessnut Air</span>
      <HelpHint section="chessnut" placement="above" />
      <span className={`chessnut-status ${chessnut.status}`}>{STATUS_LABELS[chessnut.status]}</span>

      {connected && chessnut.battery && (
        <span className="chessnut-battery">
          🔋 {chessnut.battery.percent}%{chessnut.battery.charging ? ' ⚡' : ''}
        </span>
      )}

      {connected && bestMoveAvailable && (
        <label className="chessnut-toggle" title={t('chessnut.bestMoveHint')}>
          <input type="checkbox" checked={bestMoveBlink} onChange={onToggleBestMoveBlink} />
          <span className="toggle-track" aria-hidden="true">
            <span className="toggle-thumb" />
          </span>
          <span className="chessnut-toggle-label">{t('chessnut.bestMoveLabel')}</span>
        </label>
      )}

      {connected && (
        <label className="chessnut-toggle" title={t('chessnut.beepHint')}>
          <input type="checkbox" checked={beepEnabled} onChange={onToggleBeep} />
          <span className="toggle-track" aria-hidden="true">
            <span className="toggle-thumb" />
          </span>
          <span className="chessnut-toggle-label">{t('chessnut.beepLabel')}</span>
        </label>
      )}

      {connected && sync.mismatches.length > 0 && (
        <span className="chessnut-mismatch-inline">
          {t('chessnut.pleaseReplay', { squares: sync.mismatches.join(', ') })}
        </span>
      )}

      {!connected && chessnut.status === 'error' && chessnut.error && (
        <span className="chessnut-error-inline" title={chessnut.error}>
          {chessnut.error}
        </span>
      )}

      <span className="chessnut-bar-spacer" />

      {connected ? (
        <button className="btn" onClick={chessnut.disconnect}>
          {t('chessnut.disconnect')}
        </button>
      ) : (
        <button className="btn" onClick={chessnut.connect} disabled={chessnut.status === 'unsupported'}>
          {t('chessnut.connect')}
        </button>
      )}
    </div>
  )
}
