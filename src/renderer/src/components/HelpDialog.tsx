import { useTranslation } from 'react-i18next'

interface HelpDialogProps {
  onClose: () => void
}

const SECTIONS = [
  'overview',
  'newGame',
  'tutor',
  'analysis',
  'moveList',
  'chessnut',
  'pgn',
  'clock',
  'settings',
  'language'
] as const

/** Hilfe-Dialog: kurze Erklärung der App und ihrer wichtigsten Funktionen, aus dem Info-Dialog erreichbar. */
export function HelpDialog({ onClose }: HelpDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog help-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{t('help.title')}</h2>
        {SECTIONS.map((key) => (
          <div key={key}>
            <h3>{t(`help.${key}Title`)}</h3>
            <p className="field-hint">{t(`help.${key}Text`)}</p>
          </div>
        ))}
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
