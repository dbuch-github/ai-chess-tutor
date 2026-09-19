import { useTranslation } from 'react-i18next'
import type { SupportedLocale } from '../../../shared/types'
import { loadSettings, saveSettings } from '../settings'
import { TopbarDropdown } from './TopbarDropdown'

const LANGUAGES: { code: SupportedLocale; flag: string; name: string }[] = [
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
  { code: 'fr', flag: '🇫🇷', name: 'Français' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'it', flag: '🇮🇹', name: 'Italiano' }
]

/** Sprachauswahl über eine Flagge (Topbar, ganz rechts) – wechselt i18next sofort und persistiert die Wahl. */
export function LanguageSwitcher(): React.JSX.Element {
  const { i18n, t } = useTranslation()
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0]

  const select = (code: SupportedLocale): void => {
    i18n.changeLanguage(code)
    saveSettings({ ...loadSettings(), locale: code })
  }

  return (
    <TopbarDropdown label={<span className="lang-flag">{current.flag}</span>}>
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          className="menu-item"
          aria-label={t('topbar.language')}
          onClick={() => select(lang.code)}
        >
          <span className="menu-item-label">
            <span className="lang-flag">{lang.flag}</span> {lang.name}
          </span>
        </button>
      ))}
    </TopbarDropdown>
  )
}
