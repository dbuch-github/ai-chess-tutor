import type { GameLibraryApi } from '../game/useGameLibrary'

interface GameLibraryDialogProps {
  library: GameLibraryApi
  onOpenGame: (path: string) => void
  onClose: () => void
}

const RESULT_LABELS: Record<string, string> = {
  '1-0': 'Weiß gewinnt',
  '0-1': 'Schwarz gewinnt',
  '1/2-1/2': 'Remis',
  '*': 'Offen'
}

function formatDate(pgnDate: string): string {
  // PGN-Datumsformat ist "YYYY.MM.DD"
  const parts = pgnDate.split('.')
  if (parts.length !== 3) return pgnDate
  const [y, m, d] = parts
  return `${d}.${m}.${y}`
}

export function GameLibraryDialog({
  library,
  onOpenGame,
  onClose
}: GameLibraryDialogProps): React.JSX.Element {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog library-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Partie-Bibliothek</h2>

        {library.loading ? (
          <p className="panel-empty">Lädt …</p>
        ) : library.games.length === 0 ? (
          <p className="panel-empty">
            Noch keine gespeicherten Partien. Partien werden automatisch gespeichert, sobald sie enden.
          </p>
        ) : (
          <ul className="library-list">
            {library.games.map((g) => (
              <li key={g.path} className="library-row">
                <div className="library-info">
                  <span className="library-players">
                    {g.white} – {g.black}
                  </span>
                  <span className="library-meta">
                    {formatDate(g.date)} · {RESULT_LABELS[g.result] ?? g.result} · {g.plyCount} Halbzüge
                  </span>
                </div>
                <div className="library-actions">
                  <button className="btn" onClick={() => onOpenGame(g.path)}>
                    Öffnen
                  </button>
                  <button className="btn danger" onClick={() => library.remove(g.path)}>
                    Löschen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}
