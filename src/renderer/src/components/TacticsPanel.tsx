import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { findTactics, type TacticFinding } from '../game/tactics'
import { buildLinePreview } from '../game/boardVisuals'
import type { BoardPreviewApi } from '../game/useBoardPreview'
import { HelpHint } from './HelpHint'

interface TacticsPanelProps {
  fen: string
  boardPreview: BoardPreviewApi
}

function typeLabel(t: (key: string) => string, finding: TacticFinding): string {
  if (finding.type === 'discoveredCheck') {
    return finding.double ? t('tactics.types.discoveredCheckDouble') : t('tactics.types.discoveredCheck')
  }
  return t(`tactics.types.${finding.type}`)
}

/** Trainingsfeature: zeigt taktische Muster (Gabel, Fesselung, Spieß, ...), die die
 *  Seite am Zug in der aktuellen Stellung spielen könnte, siehe game/tactics.ts. */
export function TacticsPanel({ fen, boardPreview }: TacticsPanelProps): React.JSX.Element {
  const { t } = useTranslation()
  const findings = useMemo(() => findTactics(fen), [fen])

  return (
    <section className="panel tactics-panel">
      <header className="panel-header">
        <span className="panel-title">
          <h2>{t('tactics.title')}</h2>
          <HelpHint section="tactics" />
        </span>
      </header>
      {findings.length === 0 ? (
        <p className="panel-empty">{t('tactics.empty')}</p>
      ) : (
        <ul className="tactics-findings">
          {findings.map((finding) => {
            const active = boardPreview.isActive(finding.key)
            return (
              <li key={finding.key}>
                <button
                  type="button"
                  className={`analysis-line-btn ${active ? 'active' : ''}`}
                  title={t('analysis.showOnBoard')}
                  onClick={() => {
                    const uci = finding.from + finding.to + (finding.promotion ?? '')
                    const preview = buildLinePreview(fen, [uci])
                    if (preview) boardPreview.toggle(finding.key, preview)
                  }}
                >
                  <span className="tactics-type">{typeLabel(t, finding)}</span>
                  <span className="line-moves">{finding.san}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
