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

/**
 * Anzeigegröße je Screenshot in CSS-Pixeln (= native Auflösung der Aufnahme
 * geteilt durch 2, da auf Retina-Displays mit devicePixelRatio 2 aufgenommen)
 * – als width/height-Attribute gesetzt, damit der Browser nicht künstlich auf
 * die volle Dialogbreite hochskaliert, sondern die Bilder in ihrer
 * tatsächlichen Ausschnittsgröße zeigt (nur per max-width nach unten begrenzt).
 */
const IMAGE_SIZE: Record<(typeof SECTIONS)[number], { w: number; h: number }> = {
  overview: { w: 1280, h: 828 },
  newGame: { w: 274, h: 207 },
  tutor: { w: 472, h: 318 },
  analysis: { w: 472, h: 146 },
  moveList: { w: 472, h: 224 },
  chessnut: { w: 625, h: 48 },
  pgn: { w: 274, h: 162 },
  clock: { w: 635, h: 111 },
  settings: { w: 635, h: 333 },
  language: { w: 274, h: 502 }
}

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
            <img
              className="help-screenshot"
              src={`help/${key}.png`}
              width={IMAGE_SIZE[key].w}
              height={IMAGE_SIZE[key].h}
              alt=""
              loading="lazy"
            />
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
