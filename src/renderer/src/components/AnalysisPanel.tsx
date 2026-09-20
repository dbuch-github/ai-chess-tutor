import { useTranslation } from 'react-i18next'
import type { AnalysisLine, AnalysisSnapshot } from '../../../shared/types'
import { formatScore } from '../game/classify'
import { buildLinePreview } from '../game/boardVisuals'
import type { BoardPreviewApi } from '../game/useBoardPreview'
import { pvToSan } from '../game/notation'
import { HelpHint } from './HelpHint'

interface AnalysisPanelProps {
  snapshot: AnalysisSnapshot | null
  currentFen: string
  boardPreview: BoardPreviewApi
}

const MAX_LINES = 3

function lineKey(multipv: number): string {
  return `line-${multipv}`
}

export function AnalysisPanel({ snapshot, currentFen, boardPreview }: AnalysisPanelProps): React.JSX.Element {
  const { t } = useTranslation()
  const isCurrent = snapshot?.fen === currentFen
  const lines: AnalysisLine[] = isCurrent && snapshot ? snapshot.lines : []
  const sideToMove = (snapshot?.fen.split(' ')[1] ?? 'w') as 'w' | 'b'
  const depth = lines[0]?.depth

  return (
    <section className="panel analysis-panel">
      <header className="panel-header">
        <span className="panel-title">
          <h2>{t('analysis.title')}</h2>
          <HelpHint section="analysis" />
        </span>
        {depth !== undefined && <span className="panel-meta">{t('analysis.depth', { depth })}</span>}
      </header>
      {/* Immer MAX_LINES Zeilen reservieren (auch bei 0–2 vorliegenden Linien) –
          sonst wächst/schrumpft die Box bei jeder neuen Analyse-Tiefe sichtbar. */}
      <ol className="analysis-lines">
        {Array.from({ length: MAX_LINES }, (_, i) => i + 1).map((multipv) => {
          const line = lines.find((l) => l.multipv === multipv)
          if (!line) {
            return (
              <li key={multipv}>
                <div className="analysis-line-btn placeholder" aria-hidden="true">
                  <span className="line-score">—</span>
                  <span className="line-moves">…</span>
                </div>
              </li>
            )
          }
          const key = lineKey(multipv)
          const active = boardPreview.isActive(key)
          return (
            <li key={multipv}>
              <button
                type="button"
                className={`analysis-line-btn ${active ? 'active' : ''}`}
                disabled={!isCurrent}
                title={t('analysis.showOnBoard')}
                onClick={() => {
                  const preview = buildLinePreview(currentFen, line.pvUci)
                  if (preview) boardPreview.toggle(key, preview)
                }}
              >
                <span className={`line-score ${scoreTone(line, sideToMove)}`}>
                  {formatScore(line, sideToMove)}
                </span>
                <span className="line-moves">{isCurrent ? pvToSan(currentFen, line.pvUci) : '—'}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function scoreTone(line: AnalysisLine, sideToMove: 'w' | 'b'): string {
  const cp = line.mate !== undefined ? (line.mate > 0 ? 10000 : -10000) : (line.cp ?? 0)
  const whiteCp = sideToMove === 'w' ? cp : -cp
  if (whiteCp > 60) return 'score-white'
  if (whiteCp < -60) return 'score-black'
  return 'score-even'
}
