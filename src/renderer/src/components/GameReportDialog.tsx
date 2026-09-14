import type { TutorReportMistake, TutorReportStats } from '../../../shared/types'
import type { GameReportApi } from '../game/useGameReport'
import { computeMoveImpact } from '../game/boardVisuals'
import { figurineSan, figurineText } from './Figurine'
import { PositionThumbnail } from './PositionThumbnail'
import { VisualLegend } from './VisualLegend'

interface GameReportDialogProps {
  stats: TutorReportStats
  criticalMoments: TutorReportMistake[]
  report: GameReportApi
  hasApiKey: boolean
  /** Zwei-Spieler-Modus (OTB): zeigt an jedem kritischen Moment zusätzlich an, welche Seite zog. */
  twoPlayerMode: boolean
  /** Blickrichtung der Stellungsbilder bei den kritischen Momenten. */
  playerColor: 'w' | 'b'
  onOpenSettings: () => void
  onClose: () => void
}

const CLASS_LABELS: Record<string, string> = {
  blunder: 'Blunder',
  mistake: 'Fehler',
  inaccuracy: 'Ungenauigkeit'
}

export function GameReportDialog({
  stats,
  criticalMoments,
  report,
  hasApiKey,
  twoPlayerMode,
  playerColor,
  onOpenSettings,
  onClose
}: GameReportDialogProps): React.JSX.Element {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog report-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Partie-Report</h2>

        <div className="report-stats">
          <span className="stat-chip bad">{stats.blunders} Blunder</span>
          <span className="stat-chip warn">{stats.mistakes} Fehler</span>
          <span className="stat-chip warn-soft">{stats.inaccuracies} Ungenauigkeiten</span>
          <span className="stat-chip good">{stats.bestMoves} beste Züge</span>
        </div>

        {criticalMoments.length > 0 && (
          <div className="report-moments cg-wrap">
            <h3>Kritische Momente</h3>
            <VisualLegend showFollowUp={false} />
            <ul>
              {criticalMoments.map((m) => {
                const { leadIcon, text } = figurineSan(m.san, m.color)
                const to = m.uci.slice(2, 4)
                const ownImpact = computeMoveImpact(m.fenBefore, m.uci.slice(0, 2), to, m.uci.slice(4) || undefined) ?? undefined
                const opponentMove = m.prevUci ? { from: m.prevUci.slice(0, 2), to: m.prevUci.slice(2, 4) } : undefined
                const opponentImpact =
                  opponentMove && m.prevFenBefore
                    ? computeMoveImpact(m.prevFenBefore, opponentMove.from, opponentMove.to, m.prevUci?.slice(4) || undefined)
                    : null
                return (
                  <li key={`${m.moveNumber}-${m.color}`}>
                    <PositionThumbnail
                      fen={m.fenAfter}
                      lastMoveUci={m.uci}
                      orientation={playerColor === 'w' ? 'white' : 'black'}
                      ownImpact={ownImpact}
                      ownMoveTo={to}
                      opponentMove={opponentMove}
                      opponentThreats={opponentImpact?.attacks}
                    />
                    <span className="moment-details">
                      <span className="move-no">
                        {m.moveNumber}
                        {m.color === 'w' ? '.' : '…'}
                      </span>{' '}
                      <span className="figurine-slot">{leadIcon}</span>
                      {text}
                      {twoPlayerMode && (
                        <span className="stat-chip inline">{m.color === 'w' ? 'Weiß' : 'Schwarz'}</span>
                      )}
                      <span className={`stat-chip inline ${m.classification === 'blunder' ? 'bad' : 'warn'}`}>
                        {CLASS_LABELS[m.classification] ?? m.classification}
                      </span>
                      <span className="loss">−{m.lossPct.toFixed(0)} %</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {!hasApiKey ? (
          <p className="panel-empty">
            Kein API-Key hinterlegt.{' '}
            <button className="link-btn" onClick={onOpenSettings}>
              Jetzt in den Einstellungen setzen
            </button>
          </p>
        ) : report.report ? (
          <div className="report-text cg-wrap">
            {figurineText(report.report.text)}
            {report.report.streaming && <span className="cursor">▍</span>}
            {report.report.error && <div className="error-line">{report.report.error}</div>}
          </div>
        ) : (
          <p className="panel-empty">
            Fasst die Partie zusammen: wiederkehrende Fehlermuster, die kritischsten Momente und
            konkrete Lernpunkte für die nächste Partie.
          </p>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            Schließen
          </button>
          {hasApiKey && (
            <button className="btn primary" onClick={report.request} disabled={report.busy}>
              {report.report ? 'Neu erstellen' : 'Report erstellen'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
