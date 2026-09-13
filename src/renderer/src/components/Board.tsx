import { useEffect, useRef } from 'react'
import { Chessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import type { ActivePreview } from '../game/useBoardPreview'
import type { ThreatPreview } from '../chessnut/useChessnutThreatPreview'

interface BoardProps {
  fen: string
  orientation: 'white' | 'black'
  turnColor: 'white' | 'black'
  lastMove: [string, string] | null
  check: boolean
  /** 'both' = Zug-und-Herzug für beide Seiten auf dem Bildschirm (Zwei-Spieler-Modus ohne verbundenes Brett). */
  movableColor: 'white' | 'black' | 'both' | undefined
  dests: Map<string, string[]>
  onMove: (from: string, to: string) => void
  /** Vorgeschlagener Zug (Tutor-Chat oder Analyse-Linie) – als Preview eingeblendet. */
  suggestion?: ActivePreview | null
  /** Am physischen Chessnut-Brett gehobene gegnerische Figur samt ihren Bedrohungen. */
  threatPreview?: ThreatPreview | null
}

export function Board(props: BoardProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<Api | null>(null)
  const onMoveRef = useRef(props.onMove)
  onMoveRef.current = props.onMove

  useEffect(() => {
    if (!containerRef.current) return
    apiRef.current = Chessground(containerRef.current, {
      animation: { enabled: true, duration: 150 },
      coordinates: false,
      highlight: { lastMove: true, check: true },
      movable: { free: false, showDests: true },
      events: {
        move: (orig: Key, dest: Key) => onMoveRef.current(orig, dest)
      }
    })
    // Chessground positions pieces with pixel transforms measured at init;
    // recompute whenever the container changes size or layout settles.
    const observer = new ResizeObserver(() => apiRef.current?.redrawAll())
    observer.observe(containerRef.current)
    return () => {
      observer.disconnect()
      apiRef.current?.destroy()
      apiRef.current = null
    }
  }, [])

  useEffect(() => {
    apiRef.current?.set({
      fen: props.fen,
      orientation: props.orientation,
      turnColor: props.turnColor,
      lastMove: (props.lastMove as [Key, Key] | null) ?? undefined,
      check: props.check,
      movable: {
        free: false,
        color: props.movableColor,
        dests: props.dests as Map<Key, Key[]>,
        showDests: true
      }
    })
  }, [props.fen, props.orientation, props.turnColor, props.lastMove, props.check, props.movableColor, props.dests])

  useEffect(() => {
    const shapes = props.suggestion ? suggestionToShapes(props.suggestion) : []
    if (props.threatPreview) shapes.push(...threatPreviewToShapes(props.threatPreview))
    apiRef.current?.setAutoShapes(shapes)
  }, [props.suggestion, props.threatPreview])

  return <div ref={containerRef} className="board" />
}

/**
 * Übersetzt einen Zugvorschlag in Chessground-Shapes, schwächste Information
 * zuunterst gezeichnet, der eigentliche Zug obenauf:
 * · graue Kreise – eigene Felder, die durch den Zug schwach werden
 * · grüne Linie – aufgedeckter Angriff einer anderen eigenen Figur
 * · grüne Kreise – eigene Figuren, die neu gedeckt werden
 * · rote Kreise – gegnerische Figuren, die neu angegriffen werden
 * · lila Linie + gelber Kreis – Fesselung (Angreifer → König, gefesselte Figur markiert)
 * · pinker Kreis – der gegnerische König, falls der Zug (auch aufgedeckt) Schach bietet
 * · blauer Pfeil (kräftig → blass → grau) – der Zug selbst plus die nächsten Halbzüge der Variante
 */
function suggestionToShapes(s: ActivePreview): DrawShape[] {
  const shapes: DrawShape[] = []

  for (const sq of s.weak) shapes.push({ orig: sq as Key, brush: 'paleGrey' })
  for (const d of s.discovered) {
    shapes.push({ orig: d.fromSquare as Key, dest: d.targetSquare as Key, brush: 'green' })
    if (d.isCheck) shapes.push({ orig: d.targetSquare as Key, brush: 'pink' })
  }
  for (const sq of s.defends) shapes.push({ orig: sq as Key, brush: 'paleGreen' })
  for (const sq of s.attacks) shapes.push({ orig: sq as Key, brush: 'red' })
  for (const pin of s.pins) {
    shapes.push({ orig: s.to as Key, dest: pin.kingSquare as Key, brush: 'purple' })
    shapes.push({ orig: pin.pinnedSquare as Key, brush: 'yellow' })
  }
  if (s.isCheck && s.checkedKingSquare) {
    shapes.push({ orig: s.checkedKingSquare as Key, brush: 'pink' })
  }

  shapes.push({ orig: s.from as Key, dest: s.to as Key, brush: 'blue' })
  const followBrushes = ['paleBlue', 'paleGrey']
  s.followUp.forEach((mv, i) => {
    shapes.push({ orig: mv.from as Key, dest: mv.to as Key, brush: followBrushes[i] ?? 'paleGrey' })
  })

  return shapes
}

/**
 * Zeigt eine am physischen Brett gehobene gegnerische Figur (gelber Kreis auf
 * ihrem Feld) und alle davon bedrohten eigenen Figuren (rote Kreise, dieselbe
 * Farbe wie "gegnerische Figur wird neu angegriffen" bei einem Zugvorschlag).
 */
function threatPreviewToShapes(t: ThreatPreview): DrawShape[] {
  const shapes: DrawShape[] = [{ orig: t.from as Key, brush: 'yellow' }]
  for (const sq of t.attacks) shapes.push({ orig: sq as Key, brush: 'red' })
  return shapes
}
