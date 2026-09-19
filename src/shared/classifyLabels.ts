import type { SupportedLocale } from './types'

/** Zugklassifikationen, die als Label angezeigt bzw. in Prompts/PGN-Kommentare eingebettet werden. */
export type LabeledClassification = 'best' | 'inaccuracy' | 'mistake' | 'blunder'

/**
 * Zentrales Wörterbuch für Zugklassifikations-Labels – von Renderer (Zugliste, PGN-Export)
 * und Main-Prozess (Tutor-Prompt-Texte) gemeinsam genutzt, damit die Begriffe nicht an
 * mehreren Stellen unabhängig voneinander übersetzt werden.
 */
export const CLASSIFY_LABELS: Record<SupportedLocale, Record<LabeledClassification, string>> = {
  en: { best: 'Best move', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' },
  de: { best: 'Bester Zug', inaccuracy: 'Ungenauigkeit', mistake: 'Fehler', blunder: 'Blunder' },
  fr: { best: 'Meilleur coup', inaccuracy: 'Imprécision', mistake: 'Erreur', blunder: 'Gaffe' },
  es: { best: 'Mejor jugada', inaccuracy: 'Imprecisión', mistake: 'Error', blunder: 'Error grave' },
  it: { best: 'Mossa migliore', inaccuracy: 'Imprecisione', mistake: 'Errore', blunder: 'Errore grave' },
  pt: { best: 'Melhor lance', inaccuracy: 'Imprecisão', mistake: 'Erro', blunder: 'Erro grave' },
  ru: { best: 'Лучший ход', inaccuracy: 'Неточность', mistake: 'Ошибка', blunder: 'Зевок' },
  ar: { best: 'أفضل حركة', inaccuracy: 'عدم دقة', mistake: 'خطأ', blunder: 'خطأ فادح' },
  pl: { best: 'Najlepszy ruch', inaccuracy: 'Niedokładność', mistake: 'Błąd', blunder: 'Rażący błąd' },
  tr: { best: 'En iyi hamle', inaccuracy: 'Yanlışlık', mistake: 'Hata', blunder: 'Gaf' },
  zh: { best: '最佳走法', inaccuracy: '不精确', mistake: '错误', blunder: '重大失误' },
  hi: { best: 'सर्वश्रेष्ठ चाल', inaccuracy: 'अशुद्धि', mistake: 'गलती', blunder: 'बड़ी चूक' },
  el: { best: 'Καλύτερη κίνηση', inaccuracy: 'Ανακρίβεια', mistake: 'Λάθος', blunder: 'Γκάφα' },
  sr: { best: 'Najbolji potez', inaccuracy: 'Netačnost', mistake: 'Greška', blunder: 'Krupan previd' },
  hr: { best: 'Najbolji potez', inaccuracy: 'Netočnost', mistake: 'Pogreška', blunder: 'Krupan previd' }
}
