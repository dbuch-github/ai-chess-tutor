import { Fragment, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { MoveRecord } from '../game/useGame'
import type { Classification } from '../game/classify'
import { CLASSIFY_LABELS, type LabeledClassification } from '../../../shared/classifyLabels'
import type { SupportedLocale } from '../../../shared/types'
import { historySan } from '../game/notation'
import { figurineSan } from './Figurine'

const BADGE_SYMBOLS: Record<Classification, string | null> = {
  best: '★',
  good: null,
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??'
}

function MoveCell({ record, locale }: { record: MoveRecord; locale: SupportedLocale }): React.JSX.Element {
  const { t } = useTranslation()
  const symbol = record.classification ? BADGE_SYMBOLS[record.classification] : null
  const label =
    record.classification && record.classification !== 'good'
      ? CLASSIFY_LABELS[locale][record.classification as LabeledClassification]
      : undefined
  const titleParts: string[] = []
  if (label) {
    titleParts.push(
      record.lossPct !== undefined
        ? t('pgn.moveCommentLossPct', { label, pct: record.lossPct.toFixed(0) })
        : label
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
      {symbol && <sup className="move-badge">{symbol}</sup>}
    </span>
  )
}

/** Zurückgenommene, dann anders fortgesetzte Zugfolge – als Nebenvariante unter der Hauptzeile. */
function VariationRow({ variation }: { variation: MoveRecord[] }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="move-row move-variation" title={t('moveList.discardedContinuation')}>
      <span className="move-no" />
      <span className="variation-text">({historySan(variation)})</span>
    </div>
  )
}

export function MoveList({ moves }: { moves: MoveRecord[] }): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as SupportedLocale
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
        <h2>{t('moveList.title')}</h2>
      </header>
      {rows.length === 0 ? (
        <p className="panel-empty">{t('moveList.noMoves')}</p>
      ) : (
        <div className="move-rows cg-wrap">
          {rows.map((row) => (
            <Fragment key={row.no}>
              <div className="move-row">
                <span className="move-no">{row.no}.</span>
                {row.white ? <MoveCell record={row.white} locale={locale} /> : <span />}
                {row.black ? <MoveCell record={row.black} locale={locale} /> : <span />}
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
