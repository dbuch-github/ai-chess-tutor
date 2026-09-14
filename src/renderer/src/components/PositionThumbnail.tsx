import { useId } from 'react'
import { Chess } from 'chess.js'
import type { MoveImpact } from '../game/boardVisuals'

const PIECE_TYPE: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king'
}

interface PositionThumbnailProps {
  /** Stellung NACH dem besprochenen Zug (fenAfter) – so lässt sich der eigene
   *  Zug als "letzter Zug" darstellen, genau wie auf dem Hauptbrett. */
  fen: string
  orientation?: 'white' | 'black'
  /** Der besprochene (eigene) Zug, in UCI-Notation – Von-/Nach-Feld werden als
   *  "letzter Zug" hervorgehoben, wie bei chessgrounds last-move-Highlight. */
  lastMoveUci?: string
  /** Wirkung des eigenen Zugs (siehe boardVisuals.computeMoveImpact) – als
   *  Ringe/Pfeile für Deckung/Fesselung/aufgedeckten Angriff/Schach, dieselbe
   *  Farbsprache wie die Zugvorschau auf dem Hauptbrett. Der Zug selbst wird
   *  nicht mehr als Pfeil gezeichnet (siehe lastMoveUci). ownMoveTo (Zielfeld
   *  des eigenen Zugs) wird nur als Ursprung für Fesselungspfeile gebraucht. */
  ownImpact?: MoveImpact
  ownMoveTo?: string
  /** Der Zug direkt davor (meist der Gegner) – als grauer Pfeil, zeigt woher
   *  die Figur kam und erzählt so den Kontext vor dem eigenen Zug. */
  opponentMove?: { from: string; to: string }
  /** Felder, die der Gegnerzug bedroht (dessen `attacks`) – als roter Pfeil
   *  vom Zielfeld des Gegnerzugs. Visualisiert die Drohung, die der eigene
   *  Zug ggf. übersehen hat. */
  opponentThreats?: string[]
}

/**
 * Kleines, statisches Stellungsbild für den Partie-Report – ohne eigene
 * Chessground-Instanz. Nutzt dieselben Figuren-Sprites wie das Hauptbrett:
 * ein `piece`-Element mit Typ-/Farbklasse innerhalb eines `.cg-wrap`-
 * Vorfahren zieht sich die von chessground geladenen Sprites (siehe auch
 * Figurine.tsx/figurineText, dieselbe Technik für Fließtext).
 */
export function PositionThumbnail({
  fen,
  orientation = 'white',
  lastMoveUci,
  ownImpact,
  ownMoveTo,
  opponentMove,
  opponentThreats
}: PositionThumbnailProps): React.JSX.Element {
  const board = new Chess(fen).board() // board[0] = Reihe 8 ... board[7] = Reihe 1, je Feld a..h
  const squares = board.flatMap((rankRow, rowIdx) =>
    rankRow.map((cell, fileIdx) => ({ cell, file: fileIdx, rank: 7 - rowIdx }))
  )
  // Reversal des komplett ausgeflachten Feldes = 180°-Drehung des Bretts,
  // entspricht chessground orientation="black".
  const ordered = orientation === 'white' ? squares : [...squares].reverse()
  const highlighted = new Set(lastMoveUci ? [lastMoveUci.slice(0, 2), lastMoveUci.slice(2, 4)] : [])

  const files = orientation === 'white' ? [...'abcdefgh'] : [...'abcdefgh'].reverse()
  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8]

  return (
    <div className="thumb-frame">
      <div className="thumb-ranks">
        {ranks.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
      <div className="position-thumb cg-wrap">
        {ordered.map(({ cell, file, rank }) => {
          const square = `${'abcdefgh'[file]}${rank + 1}`
          const isLight = (file + rank) % 2 === 1
          return (
            <div
              key={square}
              className={`thumb-square ${isLight ? 'light' : 'dark'}${highlighted.has(square) ? ' highlight' : ''}`}
            >
              {cell && <piece className={`thumb-piece ${PIECE_TYPE[cell.type]} ${cell.color === 'w' ? 'white' : 'black'}`} />}
            </div>
          )
        })}
        {(ownImpact || opponentMove) && (
          <ImpactOverlay
            orientation={orientation}
            ownImpact={ownImpact}
            ownMoveTo={ownMoveTo}
            opponentMove={opponentMove}
            opponentThreats={opponentThreats}
          />
        )}
      </div>
      <div />
      <div className="thumb-files">
        {files.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
    </div>
  )
}

// Dieselben Pinselfarben wie chessground (siehe node_modules/@lichess-org/chessground/dist/state.js) –
// so wirkt die Analyse hier wie die vertraute Zugvorschau auf dem Hauptbrett. "grey" (voll deckend,
// für den Gegner-Kontextpfeil) ist eine Ergänzung, chessground selbst kennt nur das blassere paleGrey.
const BRUSH = {
  red: { color: '#882020', opacity: 1 },
  paleGreen: { color: '#15781B', opacity: 0.4 },
  green: { color: '#15781B', opacity: 1 },
  purple: { color: '#68217a', opacity: 0.65 },
  yellow: { color: '#e68f00', opacity: 1 },
  pink: { color: '#ee2080', opacity: 0.5 },
  paleGrey: { color: '#4a4a4a', opacity: 0.35 },
  grey: { color: '#4a4a4a', opacity: 0.8 }
}

/** Mittelpunkt eines Feldes im 0–8-Koordinatensystem des SVG-Overlays, blickrichtungsabhängig. */
function squareCenter(square: string, orientation: 'white' | 'black'): [number, number] {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  const col = orientation === 'white' ? file : 7 - file
  const row = orientation === 'white' ? 7 - rank : rank
  return [col + 0.5, row + 0.5]
}

function Ring({ square, brush, orientation }: { square: string; brush: keyof typeof BRUSH; orientation: 'white' | 'black' }): React.JSX.Element {
  const [cx, cy] = squareCenter(square, orientation)
  const { color, opacity } = BRUSH[brush]
  return <circle cx={cx} cy={cy} r={0.36} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={0.08} />
}

function Arrow({
  from,
  to,
  brush,
  orientation,
  markerId
}: {
  from: string
  to: string
  brush: keyof typeof BRUSH
  orientation: 'white' | 'black'
  markerId: string
}): React.JSX.Element {
  const [x1, y1] = squareCenter(from, orientation)
  const [x2, y2] = squareCenter(to, orientation)
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  // Pfeilspitze endet leicht vor dem Zielfeldmittelpunkt, damit sie nicht auf der Figur sitzt.
  const pullBack = 0.32
  const ex = x2 - (dx / len) * pullBack
  const ey = y2 - (dy / len) * pullBack
  const { color, opacity } = BRUSH[brush]
  return (
    <line
      x1={x1}
      y1={y1}
      x2={ex}
      y2={ey}
      stroke={color}
      strokeOpacity={opacity}
      strokeWidth={0.1}
      strokeLinecap="round"
      markerEnd={`url(#${markerId})`}
    />
  )
}

type ArrowBrush = 'green' | 'purple' | 'grey' | 'red'
const ARROW_BRUSHES: ArrowBrush[] = ['green', 'purple', 'grey', 'red']

function ImpactOverlay({
  ownImpact,
  ownMoveTo,
  opponentMove,
  opponentThreats,
  orientation
}: {
  ownImpact?: MoveImpact
  ownMoveTo?: string
  opponentMove?: { from: string; to: string }
  opponentThreats?: string[]
  orientation: 'white' | 'black'
}): React.JSX.Element {
  // Eindeutiges Präfix, damit die Marker-IDs sich nicht mit denen anderer
  // gleichzeitig angezeigter Stellungsbilder (mehrere kritische Momente) überschneiden.
  const uid = useId()
  const markerId = (brush: ArrowBrush): string => `thumb-arrow-${brush}-${uid}`

  return (
    <svg className="thumb-impact" viewBox="0 0 8 8">
      <defs>
        {ARROW_BRUSHES.map((key) => (
          <marker key={key} id={markerId(key)} orient="auto" overflow="visible" markerWidth="4" markerHeight="4" refX="2.2" refY="2">
            <path d="M0,0 V4 L3,2 Z" fill={BRUSH[key].color} fillOpacity={BRUSH[key].opacity} />
          </marker>
        ))}
      </defs>

      {ownImpact?.weak.map((sq) => <Ring key={`weak-${sq}`} square={sq} brush="paleGrey" orientation={orientation} />)}
      {ownImpact?.discovered.map((d) => (
        <Arrow
          key={`disc-${d.fromSquare}-${d.targetSquare}`}
          from={d.fromSquare}
          to={d.targetSquare}
          brush="green"
          orientation={orientation}
          markerId={markerId('green')}
        />
      ))}
      {ownImpact?.defends.map((sq) => <Ring key={`def-${sq}`} square={sq} brush="paleGreen" orientation={orientation} />)}
      {ownImpact?.attacks.map((sq) => <Ring key={`atk-${sq}`} square={sq} brush="red" orientation={orientation} />)}
      {ownMoveTo &&
        ownImpact?.pins.map((pin) => (
          <Arrow
            key={`pin-arrow-${pin.pinnedSquare}`}
            from={ownMoveTo}
            to={pin.kingSquare}
            brush="purple"
            orientation={orientation}
            markerId={markerId('purple')}
          />
        ))}
      {ownImpact?.pins.map((pin) => <Ring key={`pinned-${pin.pinnedSquare}`} square={pin.pinnedSquare} brush="yellow" orientation={orientation} />)}
      {ownImpact?.isCheck && ownImpact.checkedKingSquare && <Ring square={ownImpact.checkedKingSquare} brush="pink" orientation={orientation} />}

      {/* Gegnerzug direkt davor: grauer Pfeil zeigt, woher die Figur kam. */}
      {opponentMove && (
        <Arrow from={opponentMove.from} to={opponentMove.to} brush="grey" orientation={orientation} markerId={markerId('grey')} />
      )}
      {/* Was dieser Zug bedroht – die Drohung, die der eigene Zug übersehen haben könnte. */}
      {opponentMove &&
        opponentThreats?.map((sq) => (
          <Arrow key={`threat-${sq}`} from={opponentMove.to} to={sq} brush="red" orientation={orientation} markerId={markerId('red')} />
        ))}
    </svg>
  )
}
