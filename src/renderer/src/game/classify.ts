import type { AnalysisLine } from '../../../shared/types'

export type Score = { cp?: number; mate?: number }

export type Classification = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

/** Minimum analysis depth before we trust an eval for move classification. */
export const MIN_CLASSIFY_DEPTH = 10

/**
 * Win probability for White in percent, Lichess formula.
 * Engine scores are reported from the side to move's perspective.
 */
export function winPctWhite(score: Score, sideToMove: 'w' | 'b'): number {
  let pct: number
  if (score.mate !== undefined) {
    pct = score.mate > 0 ? 100 : 0
  } else {
    pct = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * (score.cp ?? 0))) - 1)
  }
  return sideToMove === 'w' ? pct : 100 - pct
}

/**
 * Classify a move by the mover's loss in win probability.
 * `before`/`after` are the top engine lines for the position before and after
 * the move; `mover` is the side that made it.
 */
export function classifyMove(
  before: AnalysisLine,
  after: AnalysisLine,
  mover: 'w' | 'b',
  wasEngineBest: boolean
): { classification: Classification; lossPct: number } {
  const beforeSideToMove = mover
  const afterSideToMove = mover === 'w' ? 'b' : 'w'
  const whiteBefore = winPctWhite(before, beforeSideToMove)
  const whiteAfter = winPctWhite(after, afterSideToMove)
  const moverBefore = mover === 'w' ? whiteBefore : 100 - whiteBefore
  const moverAfter = mover === 'w' ? whiteAfter : 100 - whiteAfter
  const lossPct = Math.max(0, moverBefore - moverAfter)

  let classification: Classification
  if (lossPct >= 30) classification = 'blunder'
  else if (lossPct >= 20) classification = 'mistake'
  else if (lossPct >= 10) classification = 'inaccuracy'
  else classification = wasEngineBest ? 'best' : 'good'

  return { classification, lossPct }
}

export function formatScore(line: Score, sideToMove: 'w' | 'b'): string {
  if (line.mate !== undefined) {
    const mate = sideToMove === 'w' ? line.mate : -line.mate
    return mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`
  }
  const cp = sideToMove === 'w' ? (line.cp ?? 0) : -(line.cp ?? 0)
  const pawns = cp / 100
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2)
}
