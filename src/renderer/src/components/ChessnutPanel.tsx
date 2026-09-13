import type { ChessnutBoardApi } from '../chessnut/useChessnutBoard'
import type { ChessnutSyncApi } from '../chessnut/useChessnutSync'

interface ChessnutPanelProps {
  chessnut: ChessnutBoardApi
  sync: ChessnutSyncApi
  bestMoveBlink: boolean
  onToggleBestMoveBlink: () => void
}

const STATUS_LABELS: Record<ChessnutBoardApi['status'], string> = {
  unsupported: 'Nicht unterstützt',
  disconnected: 'Getrennt',
  connecting: 'Verbinde …',
  connected: 'Verbunden',
  error: 'Fehler'
}

/** Einzeiler unter dem Brett: Status, Batterie und Korrekturhinweis kompakt in einer Zeile. */
export function ChessnutPanel({
  chessnut,
  sync,
  bestMoveBlink,
  onToggleBestMoveBlink
}: ChessnutPanelProps): React.JSX.Element {
  const connected = chessnut.status === 'connected'

  return (
    <div className="chessnut-bar">
      <span className="chessnut-bar-label">♟️ Chessnut Air</span>
      <span className={`chessnut-status ${chessnut.status}`}>{STATUS_LABELS[chessnut.status]}</span>

      {connected && chessnut.battery && (
        <span className="chessnut-battery">
          🔋 {chessnut.battery.percent}%{chessnut.battery.charging ? ' ⚡' : ''}
        </span>
      )}

      {connected && (
        <label
          className="chessnut-toggle"
          title="Den besten Zug der laufenden Stockfish-Analyse auf dem Brett blinken lassen (Von- und Ziel-Feld im Wechsel), solange du am Zug bist"
        >
          <input type="checkbox" checked={bestMoveBlink} onChange={onToggleBestMoveBlink} />
          <span className="toggle-track" aria-hidden="true">
            <span className="toggle-thumb" />
          </span>
          <span className="chessnut-toggle-label">Bester Zug</span>
        </label>
      )}

      {connected && sync.mismatches.length > 0 && (
        <span className="chessnut-mismatch-inline">Bitte nachziehen: {sync.mismatches.join(', ')}</span>
      )}

      {!connected && chessnut.status === 'error' && chessnut.error && (
        <span className="chessnut-error-inline" title={chessnut.error}>
          {chessnut.error}
        </span>
      )}

      <span className="chessnut-bar-spacer" />

      {connected ? (
        <button className="btn" onClick={chessnut.disconnect}>
          Trennen
        </button>
      ) : (
        <button className="btn" onClick={chessnut.connect} disabled={chessnut.status === 'unsupported'}>
          Verbinden
        </button>
      )}
    </div>
  )
}
