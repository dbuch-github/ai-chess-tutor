import { useTranslation } from 'react-i18next'
import type { SupportedLocale } from '../../../shared/types'
import { loadSettings, saveSettings } from '../settings'
import { TopbarDropdown } from './TopbarDropdown'

// Alphabetisch nach Eigenname sortiert (wie in den meisten Sprachauswahl-Menüs üblich) –
// lateinschriftige Sprachen zuerst untereinander alphabetisch, danach Griechisch,
// Kyrillisch, Arabisch, Devanagari und Chinesisch in dieser Schrift-Reihenfolge.
const LANGUAGES: { code: SupportedLocale; flag: string; name: string }[] = [
  { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'fr', flag: '🇫🇷', name: 'Français' },
  { code: 'hr', flag: '🇭🇷', name: 'Hrvatski' },
  { code: 'it', flag: '🇮🇹', name: 'Italiano' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski' },
  { code: 'pt', flag: '🇵🇹', name: 'Português' },
  { code: 'sr', flag: '🇷🇸', name: 'Srpski' },
  { code: 'tr', flag: '🇹🇷', name: 'Türkçe' },
  { code: 'el', flag: '🇬🇷', name: 'Ελληνικά' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский' },
  { code: 'ar', flag: '🇸🇦', name: 'العربية' },
  { code: 'hi', flag: '🇮🇳', name: 'हिन्दी' },
  { code: 'zh', flag: '🇨🇳', name: '中文' }
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
    <TopbarDropdown label={<span className="lang-flag">{current.flag}</span>} align="right">
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
