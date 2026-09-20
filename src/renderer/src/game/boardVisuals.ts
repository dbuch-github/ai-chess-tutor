import { Chess } from 'chess.js'
import type { CapturablePiece } from './useGame'

/** Materialwerte in Bauerneinheiten – Basis für Sicherheits-/Vorteilsprüfungen
 *  (siehe minDefenderValue) und die Taktik-Erkennung (game/tactics.ts). */
export const PIECE_VALUES: Record<CapturablePiece, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }

export interface PinInfo {
  pinnedSquare: string
  kingSquare: string
}

export interface SkewerInfo {
  /** Vordere, wertvollere Figur, die weichen muss. */
  frontSquare: string
  /** Dahinterliegende, schwächere Figur, die danach fällt. */
  behindSquare: string
}

export interface DiscoveredAttack {
  /** Eigene Figur, deren Linie durch den Zug frei wird. */
  fromSquare: string
  /** Neu angegriffenes gegnerisches Feld (König oder Figur). */
  targetSquare: string
  isCheck: boolean
}

export interface FollowUpMove {
  from: string
  to: string
  sanMove: string
}

export interface MoveImpact {
  /** Gegnerische Felder, die die gezogene Figur von ihrem Zielfeld aus angreift. */
  attacks: string[]
  /** Eigene Felder, die die gezogene Figur von ihrem Zielfeld aus deckt. */
  defends: string[]
  /** Fesselungen, die durch diesen Zug entlang der Linie/Diagonale entstehen. */
  pins: PinInfo[]
  /** Spieße, die durch diesen Zug entlang der Linie/Diagonale entstehen. */
  skewers: SkewerInfo[]
  /** Setzt der Zug den gegnerischen König ins Schach (direkt oder aufgedeckt)? */
  isCheck: boolean
  /** Gibt speziell die gezogene Figur selbst Schach (im Unterschied zu einem rein
   *  aufgedeckten Schach einer anderen Figur) – für Doppelschach-Erkennung. */
  directCheck: boolean
  /** Feld des gegnerischen Königs, falls isCheck – für die Hervorhebung. */
  checkedKingSquare?: string
  /** Angriffe, die entstehen, weil das verlassene Feld eine eigene Linie freigibt. */
  discovered: DiscoveredAttack[]
  /** Eigene Felder, die vorher durch die gezogene Figur gedeckt waren und es jetzt durch nichts mehr sind. */
  weak: string[]
  /** SAN-Notation des simulierten Zugs. */
  san: string
}

export interface MovePreview {
  /** Stellung, für die der Vorschlag gilt – entscheidet, ob er automatisch eingeblendet wird. */
  fen: string
  from: string
  to: string
  sanMove: string
  attacks: string[]
  defends: string[]
  pins: PinInfo[]
  skewers: SkewerInfo[]
  isCheck: boolean
  checkedKingSquare?: string
  discovered: DiscoveredAttack[]
  weak: string[]
  /** Die nächsten 1–2 Halbzüge derselben Hauptvariante, nur als Pfeil-Trail. */
  followUp: FollowUpMove[]
}

type Board = ReturnType<Chess['board']>
type Cell = Board[number][number]
/** Ein garantiert besetztes Feld – die Fälle, in denen wir Cell schon auf null geprüft haben. */
type PieceCell = NonNullable<Cell>
type PieceColor = 'w' | 'b'

const ROOK_DIRS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
]
const BISHOP_DIRS: [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1]
]
const QUEEN_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS]
const KNIGHT_OFFSETS: [number, number][] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1]
]
/** Je eine Achse als Richtungspaar – die beiden Linien, die durch ein leer gewordenes Feld neu offen sein können. */
const AXIS_PAIRS: { dirs: [[number, number], [number, number]]; sliders: Set<string> }[] = [
  { dirs: [[-1, 0], [1, 0]], sliders: new Set(['r', 'q']) },
  { dirs: [[0, -1], [0, 1]], sliders: new Set(['r', 'q']) },
  { dirs: [[-1, -1], [1, 1]], sliders: new Set(['b', 'q']) },
  { dirs: [[-1, 1], [1, -1]], sliders: new Set(['b', 'q']) }
]

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8
}

export function squareToRC(square: string): [number, number] {
  return [8 - Number(square[1]), square.charCodeAt(0) - 'a'.charCodeAt(0)]
}

/**
 * Alle besetzten Felder, die eine Figur vom Feld (r,c) aus erreicht – bei
 * Läufer/Turm/Dame jeweils nur das erste besetzte Feld je Richtung (weiter
 * dahinter "sieht" die Figur nichts, weil dort blockiert wird).
 */
function reachableOccupied(board: Board, r: number, c: number, piece: { type: string; color: PieceColor }): PieceCell[] {
  const hits: PieceCell[] = []
  const castSliding = (dirs: [number, number][]): void => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr
      let cc = c + dc
      while (inBounds(rr, cc)) {
        const cell = board[rr][cc]
        if (cell) {
          hits.push(cell)
          break
        }
        rr += dr
        cc += dc
      }
    }
  }
  const castStep = (offsets: [number, number][]): void => {
    for (const [dr, dc] of offsets) {
      const rr = r + dr
      const cc = c + dc
      if (inBounds(rr, cc)) {
        const cell = board[rr][cc]
        if (cell) hits.push(cell)
      }
    }
  }
  switch (piece.type) {
    case 'r':
      castSliding(ROOK_DIRS)
      break
    case 'b':
      castSliding(BISHOP_DIRS)
      break
    case 'q':
      castSliding(QUEEN_DIRS)
      break
    case 'n':
      castStep(KNIGHT_OFFSETS)
      break
    case 'k':
      castStep(QUEEN_DIRS)
      break
    case 'p': {
      const dr = piece.color === 'w' ? -1 : 1
      castStep([
        [dr, -1],
        [dr, 1]
      ])
      break
    }
  }
  return hits
}

/** Deckt irgendeine Figur der angegebenen Farbe das Feld `square`? */
export function isCoveredByAnyPiece(board: Board, square: string, color: PieceColor): boolean {
  return minDefenderValue(board, square, color) !== null
}

/** Niedrigster Materialwert einer Figur der angegebenen Farbe, die `square`
 *  deckt/angreift – `null`, wenn keine. Grundlage für die Sicherheitsprüfung
 *  "kann dieses Feld danach kostenlos zurückgeschlagen werden?" (siehe
 *  game/tactics.ts), ohne dafür eine vollständige Zugtausch-Simulation (SEE)
 *  zu benötigen. */
export function minDefenderValue(board: Board, square: string, color: PieceColor): number | null {
  let min: number | null = null
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c]
      if (!cell || cell.color !== color) continue
      if (!reachableOccupied(board, r, c, cell).some((hit) => hit.square === square)) continue
      const value = cell.type === 'k' ? Infinity : PIECE_VALUES[cell.type as CapturablePiece]
      if (min === null || value < min) min = value
    }
  }
  return min
}

/** Felder aller Figuren der angegebenen Farbe, die `square` decken/angreifen –
 *  Grundlage für die Überlastungs-Erkennung (siehe game/tactics.ts): eine
 *  Figur mit genau einem Verteidiger ist im Ernstfall verloren, wenn dieser
 *  Verteidiger anderswo gebraucht wird. */
export function defendersOf(board: Board, square: string, color: PieceColor): string[] {
  const defenders: string[] = []
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c]
      if (!cell || cell.color !== color || cell.type === 'k') continue
      if (reachableOccupied(board, r, c, cell).some((hit) => hit.square === square)) {
        defenders.push(cell.square)
      }
    }
  }
  return defenders
}

/**
 * Simuliert einen Zug auf einer Stellung und berechnet, was die gezogene
 * Figur von ihrem Zielfeld aus bewirkt: Angriffe, Deckungen, Fesselungen,
 * aufgedeckte Angriffe durch das verlassene Feld sowie neu schwache eigene
 * Felder. Rein geometrisch anhand der resultierenden Brettstellung.
 */
export function computeMoveImpact(fenBefore: string, from: string, to: string, promotion?: string): MoveImpact | null {
  const boardBefore = new Chess(fenBefore).board()
  let chess: Chess
  let move: ReturnType<Chess['move']>
  try {
    chess = new Chess(fenBefore)
    move = chess.move({ from, to, promotion: promotion || 'q' })
  } catch {
    return null
  }
  const isCheck = chess.inCheck()
  const board = chess.board()
  const [rank, file] = squareToRC(to)
  const piece = board[rank]?.[file]
  if (!piece) return null
  const opponent: PieceColor = piece.color === 'w' ? 'b' : 'w'

  let checkedKingSquare: string | undefined
  if (isCheck) {
    for (const row of board) {
      const king = row.find((cell) => cell && cell.type === 'k' && cell.color === opponent)
      if (king) {
        checkedKingSquare = king.square
        break
      }
    }
  }

  const attacks: string[] = []
  const defends: string[] = []
  // Schach direkt durch die gezogene Figur selbst (im Unterschied zu isCheck,
  // das auch bei einem rein aufgedeckten Schach wahr ist) – für die
  // Doppelschach-Erkennung in game/tactics.ts.
  let directCheck = false
  for (const cell of reachableOccupied(board, rank, file, piece)) {
    if (cell.color === opponent) {
      if (cell.type === 'k') directCheck = true
      else attacks.push(cell.square) // Schach wird separat als isCheck geführt
    } else if (cell.square !== to && cell.type !== 'k') {
      // Das eigene Königsfeld "deckt" jede Figur ohnehin irgendwie – keine
      // lehrreiche Information, deshalb hier ausgeblendet.
      defends.push(cell.square)
    }
  }

  // Fesselungen/Spieße: bei Läufer/Turm/Dame hinter der ersten getroffenen
  // gegnerischen Figur in derselben Richtung weitersuchen. Ist die dahinter-
  // liegende Figur der König, ist die vordere gefesselt (absolute Fesselung).
  // Ist es eine andere gegnerische Figur, entscheidet der Wertevergleich:
  // vordere Figur wertvoller als die dahinterliegende -> Spieß (die vordere
  // muss weichen, die schwächere dahinter fällt danach); sonst (gleich- oder
  // niedrigwertiger) -> relative Fesselung.
  const pins: PinInfo[] = []
  const skewers: SkewerInfo[] = []
  if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
    const dirs = piece.type === 'b' ? BISHOP_DIRS : piece.type === 'r' ? ROOK_DIRS : QUEEN_DIRS
    for (const [dr, dc] of dirs) {
      let r = rank + dr
      let c = file + dc
      while (inBounds(r, c) && !board[r][c]) {
        r += dr
        c += dc
      }
      const first = inBounds(r, c) ? board[r][c] : null
      if (!first || first.color !== opponent) continue
      let r2 = r + dr
      let c2 = c + dc
      while (inBounds(r2, c2)) {
        const behind = board[r2][c2]
        if (behind) {
          if (behind.type === 'k' && behind.color === opponent) {
            pins.push({ pinnedSquare: first.square, kingSquare: behind.square })
          } else if (
            behind.color === opponent &&
            PIECE_VALUES[first.type as CapturablePiece] > PIECE_VALUES[behind.type as CapturablePiece]
          ) {
            skewers.push({ frontSquare: first.square, behindSquare: behind.square })
          }
          break
        }
        r2 += dr
        c2 += dc
      }
    }
  }

  // Aufgedeckte Angriffe: durch das Verlassen von `from` können bis zu zwei
  // neue Linien entstehen (jede der vier Achsen durch das leere Feld).
  const discovered: DiscoveredAttack[] = []
  const [vr, vc] = squareToRC(from)
  const firstHit = (dr: number, dc: number): Cell => {
    let r = vr + dr
    let c = vc + dc
    while (inBounds(r, c)) {
      const cell = board[r][c]
      if (cell) return cell
      r += dr
      c += dc
    }
    return null
  }
  for (const { dirs, sliders } of AXIS_PAIRS) {
    const hitA = firstHit(dirs[0][0], dirs[0][1])
    const hitB = firstHit(dirs[1][0], dirs[1][1])
    for (const [near, far] of [
      [hitA, hitB],
      [hitB, hitA]
    ] as const) {
      if (
        near &&
        far &&
        near.square !== to &&
        far.square !== to &&
        near.color === piece.color &&
        sliders.has(near.type) &&
        far.color === opponent
      ) {
        discovered.push({ fromSquare: near.square, targetSquare: far.square, isCheck: far.type === 'k' })
      }
    }
  }

  // Schwache Felder: eigene Felder, die die Figur von `from` aus deckte und
  // die jetzt von keiner eigenen Figur mehr gedeckt werden.
  const beforePiece = boardBefore[vr]?.[vc]
  const weak: string[] = []
  if (beforePiece) {
    const coveredBefore = reachableOccupied(boardBefore, vr, vc, beforePiece)
      .filter((cell) => cell.color === piece.color && cell.type !== 'k')
      .map((cell) => cell.square)
    for (const square of coveredBefore) {
      if (square !== to && !isCoveredByAnyPiece(board, square, piece.color)) weak.push(square)
    }
  }

  return { attacks, defends, pins, skewers, isCheck, directCheck, checkedKingSquare, discovered, weak, san: move.san }
}

const MAX_FOLLOWUP_PLIES = 2

/**
 * Baut die vollständige Board-Vorschau für eine Engine-Hauptvariante: den
 * ersten Zug mit voller Wirkungsanalyse, plus die nächsten Halbzüge als
 * schlichter Pfeil-Trail (Default: ein bis zwei, z. B. für Analyse-Zeilen;
 * für die Eröffnungsvorschau wird ein größerer Wert übergeben).
 */
export function buildLinePreview(fen: string, pvUci: string[], maxFollowUpPlies = MAX_FOLLOWUP_PLIES): MovePreview | null {
  if (pvUci.length === 0) return null
  const [firstUci, ...restUci] = pvUci
  const from = firstUci.slice(0, 2)
  const to = firstUci.slice(2, 4)
  const promotion = firstUci.slice(4) || undefined
  const impact = computeMoveImpact(fen, from, to, promotion)
  if (!impact) return null

  const followUp: FollowUpMove[] = []
  try {
    const chess = new Chess(fen)
    chess.move({ from, to, promotion: promotion ?? 'q' })
    for (const uci of restUci.slice(0, maxFollowUpPlies)) {
      const mv = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || 'q' })
      followUp.push({ from: mv.from, to: mv.to, sanMove: mv.san })
    }
  } catch {
    // Folgezüge sind nur ergänzend – bei Problemen brechen wir sie einfach ab
  }

  return {
    fen,
    from,
    to,
    sanMove: impact.san,
    attacks: impact.attacks,
    defends: impact.defends,
    pins: impact.pins,
    skewers: impact.skewers,
    isCheck: impact.isCheck,
    checkedKingSquare: impact.checkedKingSquare,
    discovered: impact.discovered,
    weak: impact.weak,
    followUp
  }
}
