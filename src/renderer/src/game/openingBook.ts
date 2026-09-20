import openingsData from '../data/openings.json'

interface OpeningEntry {
  eco: string
  name: string
  moves: string[]
}

const OPENINGS = openingsData as OpeningEntry[]

export interface OpeningMatch {
  eco: string
  name: string
  /** Wie viele der gespielten Halbzüge zu dieser Eröffnung passen. */
  matchedPlies: number
}

/** Buchzüge werden nur in den ersten 10 Vollzügen (20 Halbzüge) angeboten. */
const MAX_BOOK_PLIES = 20

function keyOf(moves: string[]): string {
  return moves.join(' ')
}

// key = gespielte SAN-Züge bis hierhin -> die (längste bekannte) Eröffnung mit genau dieser Zugfolge
const EXACT_MATCH = new Map<string, OpeningEntry>()
// key = SAN-Präfix -> Häufigkeit jedes bekannten nächsten Zugs (Basis fürs Eröffnungsbuch)
const CONTINUATIONS = new Map<string, Map<string, number>>()

for (const entry of OPENINGS) {
  const key = keyOf(entry.moves)
  if (!EXACT_MATCH.has(key)) EXACT_MATCH.set(key, entry)

  for (let i = 0; i < entry.moves.length && i < MAX_BOOK_PLIES; i++) {
    const prefixKey = keyOf(entry.moves.slice(0, i))
    let bucket = CONTINUATIONS.get(prefixKey)
    if (!bucket) {
      bucket = new Map()
      CONTINUATIONS.set(prefixKey, bucket)
    }
    const nextMove = entry.moves[i]
    bucket.set(nextMove, (bucket.get(nextMove) ?? 0) + 1)
  }
}

/**
 * Findet die am weitesten passende bekannte Eröffnung für die bisher
 * gespielten Züge (SAN, wie von chess.js `history()` geliefert). Liefert die
 * längste Übereinstimmung ab Partiebeginn – bleibt danach "eingefroren",
 * auch wenn spätere Züge von der Theorie abweichen.
 */
export function detectOpening(playedSan: string[]): OpeningMatch | null {
  for (let len = playedSan.length; len > 0; len--) {
    const entry = EXACT_MATCH.get(keyOf(playedSan.slice(0, len)))
    if (entry) return { eco: entry.eco, name: entry.name, matchedPlies: len }
  }
  return null
}

/**
 * Wählt – nach Häufigkeit in der Datenbank gewichtet – einen Buchzug (SAN)
 * für die aktuelle Stellung, oder `null`, wenn die Partie das Buch bereits
 * verlassen hat oder zu weit fortgeschritten ist.
 */
export function pickBookMove(playedSan: string[]): string | null {
  if (playedSan.length >= MAX_BOOK_PLIES) return null
  const bucket = CONTINUATIONS.get(keyOf(playedSan))
  if (!bucket || bucket.size === 0) return null
  const total = [...bucket.values()].reduce((sum, w) => sum + w, 0)
  let roll = Math.random() * total
  for (const [move, weight] of bucket) {
    roll -= weight
    if (roll <= 0) return move
  }
  return [...bucket.keys()][0] // Rundungsausreißer
}

export const PREVIEW_PLIES = 3

/**
 * Vorschau der nächsten bekannten Theoriezüge ab der aktuellen Stellung – im
 * Unterschied zu pickBookMove() deterministisch (an jedem Schritt der in der
 * Datenbank häufigste Folgezug statt eine Zufallswahl), damit die Anzeige bei
 * jedem Render stabil bleibt statt bei jedem Aufruf zu wechseln.
 */
export function previewContinuation(playedSan: string[], count = PREVIEW_PLIES): string[] {
  const result: string[] = []
  const prefix = [...playedSan]
  for (let i = 0; i < count; i++) {
    const bucket = CONTINUATIONS.get(keyOf(prefix))
    if (!bucket || bucket.size === 0) break
    let bestMove = ''
    let bestWeight = -1
    for (const [move, weight] of bucket) {
      if (weight > bestWeight) {
        bestWeight = weight
        bestMove = move
      }
    }
    result.push(bestMove)
    prefix.push(bestMove)
  }
  return result
}
