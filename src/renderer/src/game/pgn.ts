import { Chess } from 'chess.js'
import { CLASSIFY_LABELS, type LabeledClassification } from '../../../shared/classifyLabels'
import type { SupportedLocale } from '../../../shared/types'
import type { CapturablePiece, MoveRecord } from './useGame'
import { boardOutcome, importedOutcome, type GameOutcome } from './result'
import i18n from '../i18n'

export interface PgnMeta {
  initialFen?: string
  initialComment?: string
  outcome?: GameOutcome | null
  playerColor: 'w' | 'b'
  opponentName: string
  startedAt: Date
  /** Zwei-Spieler-Modus (OTB): "Weiß"/"Schwarz" statt "Spieler"/Engine-Name in den Kopfzeilen. */
  twoPlayerMode?: boolean
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatPgnDate(d: Date): string {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

const LOSS_LABELED: LabeledClassification[] = ['inaccuracy', 'mistake', 'blunder']

/**
 * Baut den PGN-Kommentar zu einem Zug: Klassifikation + Gewinnchancen-Verlust
 * (ab Ungenauigkeit aufwärts, wie in der Zugliste/im Partie-Report) und –
 * falls vorhanden – der vom Tutor generierte Erklärtext. So bleibt die Partie
 * auch in Lichess-Studies, ChessBase & Co. mit den Erklärungen lesbar.
 */
function moveComment(move: MoveRecord, locale: SupportedLocale): string | undefined {
  const parts: string[] = []
  if (move.lossPct !== undefined && move.classification && (LOSS_LABELED as string[]).includes(move.classification)) {
    const label = CLASSIFY_LABELS[locale][move.classification as LabeledClassification]
    parts.push(i18n.t('pgn.moveCommentLossPct', { lng: locale, label, pct: move.lossPct.toFixed(0) }))
  }
  if (move.comment) parts.push(move.comment)
  return parts.length ? parts.join(' — ') : undefined
}

/** Entfernt geschweifte Klammern aus Kommentartext – die begrenzen PGN-Kommentare selbst. */
function sanitizeComment(text: string): string {
  return text.replace(/[{}]/g, '')
}

/**
 * Baut den PGN-Zugtext (mit Zugnummern, Tutor-Kommentaren und Nebenvarianten
 * in Klammern) rekursiv – so bleibt auch eine zurückgenommene, dann anders
 * fortgesetzte Zugfolge als Variante erhalten statt beim nächsten echten Zug
 * verloren zu gehen.
 */
function renderMoveText(moves: MoveRecord[], locale: SupportedLocale): string {
  const tokens: string[] = []
  let needsMoveNumber = true // nach Kommentar/Variante muss die Zugnummer wiederholt werden
  for (const move of moves) {
    const moveNo = Number(move.fenBefore.split(' ')[5])
    if (move.color === 'w') {
      tokens.push(`${moveNo}.`)
    } else if (needsMoveNumber) {
      tokens.push(`${moveNo}...`)
    }
    tokens.push(move.san)
    needsMoveNumber = false
    const comment = moveComment(move, locale)
    if (comment) {
      tokens.push(`{${sanitizeComment(comment)}}`)
      needsMoveNumber = true
    }
    if (move.variation?.length) {
      tokens.push(`(${renderMoveText(move.variation, locale)})`)
      needsMoveNumber = true
    }
  }
  return tokens.join(' ')
}

/** Baut eine vollständige PGN-Zeichenkette samt Standard-Kopfzeilen aus den gespielten Zügen. */
export function buildPgn(moves: MoveRecord[], meta: PgnMeta): string {
  const locale = i18n.language as SupportedLocale
  const chess = new Chess(meta.initialFen ?? moves[0]?.fenBefore)
  chess.setHeader('Event', 'AI Chess Tutor Partie')
  chess.setHeader('Site', 'AI Chess Tutor')
  chess.setHeader('Date', formatPgnDate(meta.startedAt))
  chess.setHeader('Round', '-')
  chess.setHeader(
    'White',
    meta.twoPlayerMode ? i18n.t('pgn.white', { lng: locale }) : meta.playerColor === 'w' ? i18n.t('pgn.player', { lng: locale }) : meta.opponentName
  )
  chess.setHeader(
    'Black',
    meta.twoPlayerMode ? i18n.t('pgn.black', { lng: locale }) : meta.playerColor === 'b' ? i18n.t('pgn.player', { lng: locale }) : meta.opponentName
  )

  // Nur zum Ermitteln von Kopfzeilen (u. a. SetUp/FEN bei abweichender Startstellung)
  // und Endstellung/Ergebnis über die Hauptvariante – Kommentare und Nebenvarianten
  // baut renderMoveText() unten selbst, weil chess.js keine Varianten schreiben kann.
  for (const move of moves) {
    chess.move({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), promotion: move.uci.slice(4) || undefined })
  }

  const outcome = boardOutcome(chess) ?? meta.outcome
  chess.setHeader('Result', outcome?.result ?? '*')
  if (outcome?.termination) chess.setHeader('Termination', outcome.termination)

  // chess.js trennt Kopfzeilen und Zugtext nur mit einer Leerzeile, wenn tatsächlich
  // Züge vorhanden sind – bei einer leeren Partie hängt das Ergebnis sonst direkt an
  // der letzten Kopfzeile. Robuster: nur die "[...]"-Zeilen vom Anfang übernehmen.
  const headerText = chess
    .pgn()
    .split('\n')
    .filter((line) => line.startsWith('['))
    .join('\n')
  const bodyParts: string[] = []
  if (meta.initialComment) bodyParts.push(`{${sanitizeComment(meta.initialComment)}}`)
  const movetext = renderMoveText(moves, locale)
  if (movetext) bodyParts.push(movetext)
  bodyParts.push(chess.header().Result ?? '*')

  return `${headerText}\n\n${bodyParts.join(' ')}\n`
}

/** Ein passender Dateiname für den Speichern-Dialog, z. B. "2026-09-12-ai-chess-tutor.pgn". */
export function suggestedPgnFilename(startedAt: Date): string {
  const d = startedAt
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-ai-chess-tutor.pgn`
}

export interface ImportedGame {
  initialFen: string
  initialComment?: string
  outcome: GameOutcome | null
  moves: MoveRecord[]
  /**
   * Die Partie tatsächlich durchgespielte Instanz (nicht nur die Endstellung
   * geladen!) – nur so bleibt die interne Zughistorie erhalten, die Undo und
   * ein "Weiterspielen" (Engine braucht die bisherigen Züge) benötigen.
   */
  chess: Chess
}

/** Lädt eine PGN-Zeichenkette und rekonstruiert die Zugliste inkl. FEN je Zug. Wirft bei ungültigem PGN. */
export function parsePgn(pgn: string): ImportedGame {
  const check = new Chess()
  check.loadPgn(pgn) // wirft eine aussagekräftige Fehlermeldung bei ungültigem PGN

  const history = check.history({ verbose: true })
  const comments = new Map(check.getComments().map(({ fen, comment }) => [fen, comment]))
  const initialFen = history[0]?.before ?? check.fen()
  const moves: MoveRecord[] = history.map((move) => ({
    san: move.san,
    uci: move.from + move.to + (move.promotion ?? ''),
    color: move.color,
    fenBefore: move.before,
    fenAfter: move.after,
    captured: move.captured as CapturablePiece | undefined,
    comment: comments.get(move.after)
  }))
  return { moves, chess: check, initialFen, initialComment: comments.get(initialFen), outcome: importedOutcome(check) }
}
