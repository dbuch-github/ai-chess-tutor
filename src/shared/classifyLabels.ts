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
  it: { best: 'Mossa migliore', inaccuracy: 'Imprecisione', mistake: 'Errore', blunder: 'Errore grave' }
}
