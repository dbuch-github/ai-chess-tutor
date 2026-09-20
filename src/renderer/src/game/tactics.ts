import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import { computeMoveImpact, defendersOf, isCoveredByAnyPiece, squareToRC, PIECE_VALUES } from './boardVisuals'
import type { CapturablePiece } from './useGame'

export type TacticType =
  | 'check'
  | 'discoveredCheck'
  | 'hanging'
  | 'pin'
  | 'fork'
  | 'skewer'
  | 'discoveredAttack'
  | 'trapped'
  | 'overworked'
  | 'underpromotion'

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
  /** Geschätzter Materialgewinn in Bauerneinheiten (Schach/Fesselung/Unterverwandlung: kleiner Fixwert). */
  gain: number
  /** Betroffene gegnerische Felder, für die Beschriftung im Panel. */
  targets: string[]
}

const MAX_FINDINGS = 6
const CHECK_GAIN = 0.5
const PIN_GAIN = 0.5
const UNDERPROMOTION_GAIN = 1
/** Ab dieser Figurenwertigkeit lohnt sich die Überlastungs-Prüfung (Bauern sind zu billig,
 *  um als "überlastet" pädagogisch interessant zu sein). */
const OVERLOAD_MIN_VALUE = 3

function valueAt(board: ReturnType<Chess['board']>, square: string): number {
  const [r, c] = squareToRC(square)
  const cell = board[r]?.[c]
  if (!cell) return 0
  return cell.type === 'k' ? Infinity : PIECE_VALUES[cell.type as CapturablePiece]
}

/** Für jede gegnerische Figur ab OVERLOAD_MIN_VALUE mit genau einem Verteidiger: welche
 *  anderen Ziele fallen, wenn dieser Verteidiger anderswo gebraucht wird? Liefert eine
 *  Zuordnung Ziel -> die übrigen vom selben (alleinigen) Verteidiger gedeckten Ziele. */
function findOverloadedTargets(board: ReturnType<Chess['board']>, opponent: 'w' | 'b'): Map<string, string[]> {
  const byDefender = new Map<string, string[]>()
  for (const row of board) {
    for (const cell of row) {
      if (!cell || cell.color !== opponent || cell.type === 'k') continue
      if (PIECE_VALUES[cell.type as CapturablePiece] < OVERLOAD_MIN_VALUE) continue
      const defs = defendersOf(board, cell.square, opponent)
      if (defs.length !== 1) continue
      const list = byDefender.get(defs[0]) ?? []
      list.push(cell.square)
      byDefender.set(defs[0], list)
    }
  }
  const overloadedBy = new Map<string, string[]>()
  for (const targets of byDefender.values()) {
    if (targets.length < 2) continue
    for (const t of targets) {
      overloadedBy.set(
        t,
        targets.filter((x) => x !== t)
      )
    }
  }
  return overloadedBy
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
  const mover = chess.turn()
  const opponent = mover === 'w' ? 'b' : 'w'
  const findings: TacticFinding[] = []
  const overloadedBy = findOverloadedTargets(chess.board(), opponent)

  for (const move of chess.moves({ verbose: true })) {
    // Unterverwandlung ist ein eigener Durchlauf (muss mit der Damenumwandlung
    // an derselben Stelle verglichen werden) – hier nur die Damen-Variante
    // betrachten, sonst vervierfachen sich die übrigen Funde auf jedem
    // Bauern-Endfeld.
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

    // Überlastung: greift dieser Zug eines der vorab ermittelten, exklusiv
    // gedeckten Ziele an?
    for (const atk of impact.attacks) {
      const siblings = overloadedBy.get(atk)
      if (siblings && siblings.length > 0) {
        push(
          'overworked',
          Math.min(...siblings.map((s) => valueAt(afterBoard, s))),
          siblings
        )
      }
    }

    // Eingesperrte Figur: eine von mir angegriffene gegnerische Nicht-Bauern-,
    // Nicht-König-Figur ohne sicheres Fluchtfeld.
    for (const row of afterBoard) {
      for (const cell of row) {
        if (!cell || cell.color !== opponent || cell.type === 'k' || cell.type === 'p') continue
        if (!isCoveredByAnyPiece(afterBoard, cell.square, mover)) continue
        const escapes = after.moves({ square: cell.square as Square, verbose: true })
        const noSafeEscape =
          escapes.length === 0 || escapes.every((esc) => isCoveredByAnyPiece(afterBoard, esc.to, mover))
        if (noSafeEscape) {
          push('trapped', valueAt(afterBoard, cell.square), [cell.square])
        }
      }
    }
  }

  // Unterverwandlung: separater Durchlauf, weil jede Nicht-Damen-Umwandlung mit
  // der Damenumwandlung an derselben Stelle verglichen werden muss.
  const promotionMoves = chess.moves({ verbose: true }).filter((m) => m.promotion)
  const queenBySquarePair = new Map<string, (typeof promotionMoves)[number]>()
  for (const m of promotionMoves) if (m.promotion === 'q') queenBySquarePair.set(`${m.from}-${m.to}`, m)

  for (const move of promotionMoves) {
    if (move.promotion === 'q') continue
    const queenMove = queenBySquarePair.get(`${move.from}-${move.to}`)
    if (!queenMove) continue

    const impact = computeMoveImpact(fen, move.from, move.to, move.promotion)
    if (!impact) continue
    const after = new Chess(fen)
    after.move({ from: move.from, to: move.to, promotion: move.promotion })
    if (isCoveredByAnyPiece(after.board(), move.to, opponent)) continue

    const queenImpact = computeMoveImpact(fen, queenMove.from, queenMove.to, 'q')
    const queenAfter = new Chess(fen)
    queenAfter.move({ from: queenMove.from, to: queenMove.to, promotion: 'q' })

    const avoidsStalemate = queenAfter.isStalemate() && !after.isStalemate()
    const givesExtraCheck = impact.directCheck && !(queenImpact?.directCheck ?? false)
    if (avoidsStalemate || givesExtraCheck) {
      findings.push({
        key: `underpromotion-${move.from}-${move.to}-${move.promotion}`,
        type: 'underpromotion',
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        san: move.san,
        gain: UNDERPROMOTION_GAIN,
        targets: [move.to]
      })
    }
  }

  // Dieselbe taktische Tatsache (z. B. "der Springer auf d6 ist eingesperrt")
  // kann über viele verschiedene, belanglose Züge hinweg unverändert bestehen
  // bleiben – ohne Deduplizierung würden solche Wiederholungen die Liste
  // dominieren und andere Funde (mit demselben Ziel, aber anderem Muster,
  // z. B. eine Fesselung auf demselben Feld) verdrängen.
  const deduped = new Map<string, TacticFinding>()
  for (const finding of findings) {
    // "double" muss Teil des Schlüssels sein – Einfach- und Doppelschach mit
    // demselben Zielfeld sind unterschiedliche, beide erwähnenswerte Funde.
    const key = `${finding.type}:${finding.double ? 1 : 0}:${[...finding.targets].sort().join(',')}`
    const existing = deduped.get(key)
    if (!existing || finding.gain > existing.gain) deduped.set(key, finding)
  }

  const result = [...deduped.values()]
  result.sort((a, b) => b.gain - a.gain)
  return result.slice(0, MAX_FINDINGS)
}
