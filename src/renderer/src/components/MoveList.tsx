import { useEffect, useRef } from 'react'
import type { MoveRecord } from '../game/useGame'
import type { Classification } from '../game/classify'
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
  const title =
    badge && record.lossPct !== undefined
      ? `${badge.label} (−${record.lossPct.toFixed(0)} % Gewinnchance)`
      : badge?.label
  const { leadIcon, text } = figurineSan(record.san, record.color)
  return (
    <span className={`move ${record.classification ?? ''}`} title={title}>
      <span className="figurine-slot">{leadIcon}</span>
      {text}
      {badge && <sup className="move-badge">{badge.symbol}</sup>}
    </span>
  )
}

export function MoveList({ moves }: { moves: MoveRecord[] }): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [moves.length])

  const rows: { no: number; white?: MoveRecord; black?: MoveRecord }[] = []
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ no: i / 2 + 1, white: moves[i], black: moves[i + 1] })
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
            <div className="move-row" key={row.no}>
              <span className="move-no">{row.no}.</span>
              {row.white ? <MoveCell record={row.white} /> : <span />}
              {row.black ? <MoveCell record={row.black} /> : <span />}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </section>
  )
}
