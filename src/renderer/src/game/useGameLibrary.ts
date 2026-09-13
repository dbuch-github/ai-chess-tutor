import { useCallback, useEffect, useRef, useState } from 'react'
import type { LibraryGameSummary } from '../../../shared/types'
import { buildPgn } from './pgn'
import type { GameApi } from './useGame'

export interface GameLibraryApi {
  games: LibraryGameSummary[]
  loading: boolean
  refresh: () => void
  /** Lädt den PGN-Text einer gespeicherten Partie, oder null bei Fehler. */
  load: (path: string) => Promise<string | null>
  remove: (path: string) => Promise<void>
}

/**
 * Speichert jede tatsächlich zu Ende gespielte Partie automatisch als PGN in
 * der lokalen Bibliothek (nicht bei importierten Partien im Review-Modus,
 * und nicht mehrfach für dieselbe Partie bei erneuten Renders).
 */
export function useGameLibrary(game: GameApi, opponentName: string): GameLibraryApi {
  const [games, setGames] = useState<LibraryGameSummary[]>([])
  const [loading, setLoading] = useState(false)
  const prevResultRef = useRef<string | null>(null)
  const savedForGameRef = useRef<number | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    window.api.libraryList().then((list) => {
      setGames(list)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    refresh()
    // Nur beim ersten Mount laden – danach hält refresh() die Liste aktuell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const justFinished = !!game.result && !prevResultRef.current
    prevResultRef.current = game.result
    if (!justFinished || game.reviewMode) return
    if (savedForGameRef.current === game.startedAt.getTime()) return
    savedForGameRef.current = game.startedAt.getTime()

    const pgn = buildPgn(game.moves, {
      playerColor: game.playerColor,
      opponentName,
      startedAt: game.startedAt,
      twoPlayerMode: game.twoPlayerMode
    })
    window.api.librarySave(pgn).then(() => refresh())
    // game.moves bewusst nicht in den Deps – nur der Übergang von "läuft" zu
    // "beendet" soll auslösen, nicht jede Änderung während der Partie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.result, game.reviewMode, game.startedAt, opponentName, refresh])

  const load = useCallback(async (path: string): Promise<string | null> => {
    const result = await window.api.libraryLoad(path)
    return result.ok ? (result.pgn ?? null) : null
  }, [])

  const remove = useCallback(
    async (path: string): Promise<void> => {
      await window.api.libraryDelete(path)
      refresh()
    },
    [refresh]
  )

  return { games, loading, refresh, load, remove }
}
