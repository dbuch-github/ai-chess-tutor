import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import it from './locales/it.json'
import pt from './locales/pt.json'
import ru from './locales/ru.json'
import ar from './locales/ar.json'
import pl from './locales/pl.json'
import tr from './locales/tr.json'
import zh from './locales/zh.json'
import hi from './locales/hi.json'
import el from './locales/el.json'
import sr from './locales/sr.json'
import hr from './locales/hr.json'
import { loadSettings } from './settings'

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr },
    es: { translation: es },
    it: { translation: it },
    pt: { translation: pt },
    ru: { translation: ru },
    ar: { translation: ar },
    pl: { translation: pl },
    tr: { translation: tr },
    zh: { translation: zh },
    hi: { translation: hi },
    el: { translation: el },
    sr: { translation: sr },
    hr: { translation: hr }
  },
  lng: loadSettings().locale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
