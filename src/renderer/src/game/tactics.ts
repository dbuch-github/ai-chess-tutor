import { Chess } from 'chess.js'
import { computeMoveImpact, isCoveredByAnyPiece, squareToRC, PIECE_VALUES } from './boardVisuals'
import type { CapturablePiece } from './useGame'

export type TacticType = 'check' | 'discoveredCheck' | 'hanging' | 'pin' | 'fork' | 'skewer' | 'discoveredAttack'

export interface TacticFinding {
  /** Eindeutig je Zug+Muster – dient als sourceKey für boardPreview.toggle(). */
  key: string
  type: TacticType
  /** Nur bei 'discoveredCheck': Doppelschach statt einfachem Abzugsschach. */
  double?: boolean
  from: string
  to: string
  promotion?: string
  san: string
  /** Geschätzter Materialgewinn in Bauerneinheiten (Schach/Fesselung: kleiner Fixwert). */
  gain: number
  /** Betroffene gegnerische Felder, für die Beschriftung im Panel. */
  targets: string[]
}

const MAX_FINDINGS = 6
const CHECK_GAIN = 0.5
const PIN_GAIN = 0.5

function valueAt(board: ReturnType<Chess['board']>, square: string): number {
  const [r, c] = squareToRC(square)
  const cell = board[r]?.[c]
  if (!cell) return 0
  return cell.type === 'k' ? Infinity : PIECE_VALUES[cell.type as CapturablePiece]
}

/**
 * Taktische Muster in der aktuellen Stellung, die die Seite am Zug jetzt
 * spielen könnte – rein geometrisch (keine Engine-Suche, siehe boardVisuals.ts
 * computeMoveImpact), gefiltert auf Züge mit klarem Vorteil: das Zielfeld darf
 * nach dem Zug nicht kostenlos von einer gleich- oder niedrigwertigen
 * gegnerischen Figur zurückgeschlagen werden (leichte Sicherheitsprüfung
 * statt vollständiger Zugtausch-Simulation, siehe minDefenderValue).
 */
export function findTactics(fen: string): TacticFinding[] {
  const chess = new Chess(fen)
  const opponent = chess.turn() === 'w' ? 'b' : 'w'
  const findings: TacticFinding[] = []

  for (const move of chess.moves({ verbose: true })) {
    // Unterverwandlung ist kein Stufe-1-Muster – nur die Damen-Variante
    // betrachten, sonst vervierfachen sich die Funde auf jedem Bauern-Endfeld.
    if (move.promotion && move.promotion !== 'q') continue

    const impact = computeMoveImpact(fen, move.from, move.to, move.promotion)
    if (!impact) continue

    const moverValue = move.piece === 'k' ? Infinity : PIECE_VALUES[move.piece as CapturablePiece]
    const after = new Chess(fen)
    after.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' })
    const afterBoard = after.board()

    // Bewusst kein voller Zugtausch (SEE): "sicher" heißt hier schlicht, dass
    // niemand die gezogene Figur auf ihrem neuen Feld zurückschlagen kann –
    // auch ein Rückschlag durch eine wertvollere Figur (z. B. den König)
    // verliert die eigene Figur trotzdem, zählt also nicht als sicher.
    if (isCoveredByAnyPiece(afterBoard, move.to, opponent)) continue

    const push = (type: TacticType, gain: number, targets: string[], double?: boolean): void => {
      findings.push({
        key: `${type}-${move.from}-${move.to}`,
        type,
        double,
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        san: move.san,
        gain,
        targets
      })
    }

    // Schach / Abzugsschach & Doppelschach
    const discoveredCheck = impact.discovered.some((d) => d.isCheck)
    if (discoveredCheck) {
      push('discoveredCheck', CHECK_GAIN, [impact.checkedKingSquare ?? move.to], impact.directCheck)
    } else if (impact.isCheck) {
      push('check', CHECK_GAIN, [impact.checkedKingSquare ?? move.to])
    }

    // Hängende Figur: Schlagzug – dass das Zielfeld danach ungedeckt ist,
    // stellt bereits das Sicherheits-Gate oben sicher.
    if (move.captured) {
      push('hanging', PIECE_VALUES[move.captured as CapturablePiece], [move.to])
    }

    // Fesselung
    if (impact.pins.length > 0) {
      push('pin', PIN_GAIN, impact.pins.map((p) => p.pinnedSquare))
    }

    // Spieß
    for (const skewer of impact.skewers) {
      push('skewer', valueAt(afterBoard, skewer.behindSquare), [skewer.behindSquare])
    }

    // Gabel: mindestens zwei gleichzeitig angegriffene Ziele, die jeweils
    // ungedeckt oder wertvoller als die ziehende Figur sind (sonst kein
    // echter Materialgewinn, da der Gegner einfach zurückschlägt).
    const forkTargetValues = impact.attacks
      .map((sq) => ({ sq, value: valueAt(afterBoard, sq) }))
      .filter(({ sq, value }) => value > moverValue || !isCoveredByAnyPiece(afterBoard, sq, opponent))
    if (forkTargetValues.length >= 2) {
      const sorted = forkTargetValues.map((t) => t.value).sort((a, b) => b - a)
      // Der Gegner rettet die wertvollste Figur – realistisch gewinnbar ist die nächstbeste.
      push(
        'fork',
        sorted[1],
        forkTargetValues.map((t) => t.sq)
      )
    }

    // Abzugsangriff (kein Schach – das läuft über discoveredCheck)
    for (const d of impact.discovered) {
      if (d.isCheck) continue
      const attackerValue = valueAt(afterBoard, d.fromSquare)
      const targetValue = valueAt(afterBoard, d.targetSquare)
      if (targetValue > attackerValue || !isCoveredByAnyPiece(afterBoard, d.targetSquare, opponent)) {
        push('discoveredAttack', targetValue, [d.targetSquare])
      }
    }
  }

  findings.sort((a, b) => b.gain - a.gain)
  return findings.slice(0, MAX_FINDINGS)
}
