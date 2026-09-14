const PIECE_TYPE: Record<string, string> = {
  N: 'knight',
  B: 'bishop',
  R: 'rook',
  Q: 'queen',
  K: 'king'
}

function PieceIcon({ letter, color }: { letter: string; color: 'w' | 'b' }): React.JSX.Element {
  return <piece className={`figurine ${PIECE_TYPE[letter]} ${color === 'w' ? 'white' : 'black'}`} />
}

export interface FigurineSan {
  /** Symbol der ziehenden Figur, `null` bei Bauernzügen und Rochade. */
  leadIcon: React.ReactNode | null
  /** Rest der Notation (inkl. Umwandlungssymbol), beginnt bei allen Zügen an derselben Stelle. */
  text: React.ReactNode
}

/**
 * Übersetzt eine SAN-Notation in Figurinen-Notation: der Buchstabe der
 * ziehenden Figur (und einer Umwandlung) wird durch ein kleines Figurensymbol
 * ersetzt, z. B. "Nc3" -> ♞c3, "e8=Q" -> e8=♛. Rochade bleibt Text. Das
 * Leitsymbol wird separat zurückgegeben, damit es in einer festen Spalte
 * sitzen kann und die Notation selbst über alle Züge hinweg fluchtet.
 */
export function figurineSan(san: string, color: 'w' | 'b'): FigurineSan {
  if (san.startsWith('O-O')) return { leadIcon: null, text: san }

  const leadMatch = san.match(/^([NBRQK])/)
  const rest = leadMatch ? san.slice(1) : san
  const leadIcon = leadMatch ? <PieceIcon letter={leadMatch[1]} color={color} /> : null

  const promoMatch = rest.match(/^([^=]*)=([NBRQ])(.*)$/)
  const text = promoMatch ? (
    <>
      {promoMatch[1]}=<PieceIcon letter={promoMatch[2]} color={color} />
      {promoMatch[3]}
    </>
  ) : (
    rest
  )

  return { leadIcon, text }
}

// Erkennt Figurenzüge (Leitbuchstabe N/B/R/Q/K, optionale Unterscheidung/
// Schlagangabe, Zielfeld, optionale Umwandlung, optionales Schach-/Mattzeichen)
// innerhalb von Fließtext. Bauernzüge ohne Leitbuchstaben bleiben unverändert.
const MOVE_TOKEN = /\b([NBRQK])([a-h]|[1-8])?(x)?([a-h][1-8])(?:=([NBRQ]))?([+#])?/g

/**
 * Übersetzt Figurenzüge innerhalb eines Fließtexts (z. B. eine Tutor-Antwort)
 * in Figurinen-Notation, analog zu {@link figurineSan}. Da im Fließtext nicht
 * zuverlässig erkennbar ist, welche Seite gerade zieht, wird – wie bei
 * gedruckter Figurinennotation üblich – ein einheitliches Symbolset
 * verwendet, unabhängig von der tatsächlichen Figurenfarbe.
 */
export function figurineText(text: string, color: 'w' | 'b' = 'w'): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0

  for (const match of text.matchAll(MOVE_TOKEN)) {
    const idx = match.index ?? 0
    if (idx > lastIndex) parts.push(text.slice(lastIndex, idx))

    const [full, piece, disambig, capture, dest, promo, suffix] = match
    parts.push(
      <span className="figurine-inline" key={key++}>
        <PieceIcon letter={piece} color={color} />
        {disambig ?? ''}
        {capture ?? ''}
        {dest}
        {promo && (
          <>
            =<PieceIcon letter={promo} color={color} />
          </>
        )}
        {suffix ?? ''}
      </span>
    )
    lastIndex = idx + full.length
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}
