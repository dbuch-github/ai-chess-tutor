import { useTranslation } from 'react-i18next'
import type { GameLibraryApi } from '../game/useGameLibrary'
import type { SupportedLocale } from '../../../shared/types'

interface GameLibraryDialogProps {
  library: GameLibraryApi
  onOpenGame: (path: string) => void
  onClose: () => void
}

function formatDate(pgnDate: string, locale: SupportedLocale): string {
  // PGN-Datumsformat ist "YYYY.MM.DD"
  const parts = pgnDate.split('.')
  if (parts.length !== 3) return pgnDate
  const [y, m, d] = parts.map(Number)
  const date = new Date(y, m - 1, d)
  if (Number.isNaN(date.getTime())) return pgnDate
  return new Intl.DateTimeFormat(locale).format(date)
}

export function GameLibraryDialog({
  library,
  onOpenGame,
  onClose
}: GameLibraryDialogProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as SupportedLocale

  const RESULT_LABELS: Record<string, string> = {
    '1-0': t('library.resultWhiteWins'),
    '0-1': t('library.resultBlackWins'),
    '1/2-1/2': t('library.resultDraw'),
    '*': t('library.resultOpen')
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog library-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{t('library.title')}</h2>

        {library.loading ? (
          <p className="panel-empty">{t('library.loading')}</p>
        ) : library.games.length === 0 ? (
          <p className="panel-empty">{t('library.empty')}</p>
        ) : (
          <ul className="library-list">
            {library.games.map((g) => (
              <li key={g.path} className="library-row">
                <div className="library-info">
                  <span className="library-players">
                    {g.white} – {g.black}
                  </span>
                  <span className="library-meta">
                    {formatDate(g.date, locale)} · {RESULT_LABELS[g.result] ?? g.result} ·{' '}
                    {t('library.halfMoves', { count: g.plyCount })}
                  </span>
                </div>
                <div className="library-actions">
                  <button className="btn" onClick={() => onOpenGame(g.path)}>
                    {t('library.open')}
                  </button>
                  <button className="btn danger" onClick={() => library.remove(g.path)}>
                    {t('library.delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
