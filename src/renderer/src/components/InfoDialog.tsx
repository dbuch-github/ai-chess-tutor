import { useTranslation } from 'react-i18next'

const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/daniel_buch'
const GPL_URL = 'https://www.gnu.org/licenses/gpl-3.0.html'
const SOURCE_URL = 'https://github.com/dbuch-github/ai-chess-tutor'

interface InfoDialogProps {
  onClose: () => void
  onOpenHelp: () => void
}

/** Info-Overlay, das direkt nach dem Start der App erscheint (wegklickbar per Backdrop/Button). */
export function InfoDialog({ onClose, onOpenHelp }: InfoDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog info-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Relativer Pfad statt "/app-icon.png": im gepackten Build lädt Electron die
            index.html über file:// - dort löst ein absoluter Pfad gegen den Dateisystem-
            Root auf statt gegen das Verzeichnis der HTML-Datei und bricht das Bild. */}
        <img className="info-icon" src="app-icon.png" alt="" width={144} height={144} />
        <h2>AI Chess Tutor</h2>
        <p className="info-author">{t('info.author')}</p>
        <p className="info-license">
          {t('info.licenseFreeSoftware')}{' '}
          <a href={GPL_URL} target="_blank" rel="noreferrer">
            GNU GPL v3.0
          </a>{' '}
          {t('info.licenseSuffix')}{' '}
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            {t('info.sourceCode')}
          </a>
        </p>
        <button
          className="btn btn-coffee"
          onClick={() => window.api.openExternal(BUY_ME_A_COFFEE_URL)}
        >
          ☕ Buy Me a Coffee
        </button>
        <div className="dialog-actions">
          <button className="btn" onClick={onOpenHelp}>
            {t('info.help')}
          </button>
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
