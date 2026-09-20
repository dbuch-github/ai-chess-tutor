import type { CapturablePiece } from '../game/useGame'
import { PIECE_VALUES } from '../game/boardVisuals'

export { PIECE_VALUES }

const PIECE_NAMES: Record<CapturablePiece, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen'
}

export interface ClockBadgeInfo {
  label: string
  running: boolean
  low: boolean
}

interface CapturedRowProps {
  /** Pieces this player has captured (they have the opponent's color). */
  pieces: CapturablePiece[]
  pieceColor: 'white' | 'black'
  /** Material advantage of this player in pawns, shown when positive. */
  lead: number
  position: 'top' | 'bottom'
  /** Schachuhr für diese Seite – weggelassen, wenn keine Zeitkontrolle aktiv ist. */
  clock?: ClockBadgeInfo
}

export function CapturedRow({ pieces, pieceColor, lead, position, clock }: CapturedRowProps): React.JSX.Element {
  const sorted = [...pieces].sort((a, b) => PIECE_VALUES[b] - PIECE_VALUES[a])
  return (
    <div className={`cg-wrap captured-row ${position}`}>
      {sorted.map((p, i) => (
        <piece key={i} className={`${PIECE_NAMES[p]} ${pieceColor}`} />
      ))}
      {lead > 0 && <span className="material-lead">+{lead}</span>}
      {clock && (
        <span className={`clock-badge ${clock.running ? 'running' : ''} ${clock.low ? 'low' : ''}`}>
          {clock.label}
        </span>
      )}
    </div>
  )
}
