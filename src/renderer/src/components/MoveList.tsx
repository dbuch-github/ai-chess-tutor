import { Fragment, useEffect, useRef } from 'react'
import type { MoveRecord } from '../game/useGame'
import type { Classification } from '../game/classify'
import { historySan } from '../game/notation'
import { figurineSan } from './Figurine'

const BADGES: Record<Classification, { symbol: string; label: string } | null> = {
  best: { symbol: '★', label: 'Bester Zug' },
  good: null,
  inaccuracy: { symbol: '?!', label: 'Ungenauigkeit' },
  mistake: { symbol: '?', label: 'Fehler' },
  blunder: { symbol: '??', label: 'Blunder' }
}

function MoveCell({ record }: { record: MoveRecord }): React.JSX.Element {
  const badge = record.classification ? BADGES[record.classification] : null
  const titleParts: string[] = []
  if (badge) {
    titleParts.push(
      record.lossPct !== undefined ? `${badge.label} (−${record.lossPct.toFixed(0)} % Gewinnchance)` : badge.label
    )
  }
  // Tutor-Anmerkung mit in die Zugnotation aufnehmen (nicht nur im Chat-Verlauf sichtbar)
  if (record.comment) titleParts.push(record.comment)
  const title = titleParts.length ? titleParts.join(' — ') : undefined
  const { leadIcon, text } = figurineSan(record.san, record.color)
  return (
    <span className={`move ${record.classification ?? ''} ${record.comment ? 'has-comment' : ''}`} title={title}>
      <span className="figurine-slot">{leadIcon}</span>
      {text}
      {badge && <sup className="move-badge">{badge.symbol}</sup>}
    </span>
  )
}

/** Zurückgenommene, dann anders fortgesetzte Zugfolge – als Nebenvariante unter der Hauptzeile. */
function VariationRow({ variation }: { variation: MoveRecord[] }): React.JSX.Element {
  return (
    <div className="move-row move-variation" title="Zurückgenommene Fortsetzung">
      <span className="move-no" />
      <span className="variation-text">({historySan(variation)})</span>
    </div>
  )
}

export function MoveList({ moves }: { moves: MoveRecord[] }): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [moves.length])

  const rows: { no: number; white?: MoveRecord; black?: MoveRecord }[] = []
  for (const move of moves) {
    const no = Number(move.fenBefore.split(' ')[5])
    if (rows.at(-1)?.no !== no) rows.push({ no })
    rows[rows.length - 1][move.color === 'w' ? 'white' : 'black'] = move
  }

  return (
    <section className="panel move-list">
      <header className="panel-header">
        <h2>Partie</h2>
      </header>
      {rows.length === 0 ? (
        <p className="panel-empty">Noch keine Züge.</p>
      ) : (
        <div className="move-rows cg-wrap">
          {rows.map((row) => (
            <Fragment key={row.no}>
              <div className="move-row">
                <span className="move-no">{row.no}.</span>
                {row.white ? <MoveCell record={row.white} /> : <span />}
                {row.black ? <MoveCell record={row.black} /> : <span />}
              </div>
              {row.white?.variation && <VariationRow variation={row.white.variation} />}
              {row.black?.variation && <VariationRow variation={row.black.variation} />}
            </Fragment>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </section>
  )
}
