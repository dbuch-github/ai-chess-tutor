import type { AnalysisLine, AnalysisSnapshot } from '../../../shared/types'
import { winPctWhite } from '../game/classify'

/** Compact one-decimal label that fits the narrow bar, e.g. "+0.6" or "M5". */
function compactScore(line: AnalysisLine, sideToMove: 'w' | 'b'): string {
  if (line.mate !== undefined) {
    const mate = sideToMove === 'w' ? line.mate : -line.mate
    return mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`
  }
  const pawns = (sideToMove === 'w' ? (line.cp ?? 0) : -(line.cp ?? 0)) / 100
  return pawns > 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1)
}

interface EvalBarProps {
  snapshot: AnalysisSnapshot | null
  currentFen: string
}

export function EvalBar({ snapshot, currentFen }: EvalBarProps): React.JSX.Element {
  const top = snapshot?.fen === currentFen ? snapshot.lines.find((l) => l.multipv === 1) : undefined
  const sideToMove = (snapshot?.fen.split(' ')[1] ?? 'w') as 'w' | 'b'
  const whitePct = top ? winPctWhite(top, sideToMove) : 50
  const label = top ? compactScore(top, sideToMove) : '…'

  return (
    <div className="eval-bar" title={`Weiß gewinnt zu ${whitePct.toFixed(0)} %`}>
      <div className="eval-bar-black" style={{ height: `${100 - whitePct}%` }} />
      <div className="eval-bar-label">{label}</div>
    </div>
  )
}
