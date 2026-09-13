import { useCallback, useRef, useState } from 'react'
import type { TutorReportRequest } from '../../../shared/types'
import { computeCriticalMoments, computeReportStats } from './gameReport'
import { historySan } from './notation'
import type { GameApi } from './useGame'

export interface GameReportMessage {
  text: string
  streaming: boolean
  error?: string
}

export interface GameReportApi {
  report: GameReportMessage | null
  busy: boolean
  request: () => void
  clear: () => void
}

// Eigener, negativer ID-Raum – kollidiert nie mit den Tutor-Chat-Nachrichten-IDs,
// sodass beide Streams unabhängig über denselben IPC-Kanal laufen können.
let nextReportId = -1

export function useGameReport(game: GameApi, hasApiKey: boolean): GameReportApi {
  const [report, setReport] = useState<GameReportMessage | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const request = useCallback(() => {
    if (!hasApiKey || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const id = nextReportId--
    setReport({ text: '', streaming: true })

    const req: TutorReportRequest = {
      kind: 'report',
      playerColor: game.playerColor,
      twoPlayerMode: game.twoPlayerMode,
      result: game.result ?? 'Partie läuft noch',
      historySan: historySan(game.moves),
      mistakes: computeCriticalMoments(game.moves, game.playerColor, game.twoPlayerMode),
      stats: computeReportStats(game.moves, game.playerColor, game.twoPlayerMode)
    }

    const unsubscribe = window.api.onTutorDelta((deltaId, delta) => {
      if (deltaId !== id) return
      setReport((prev) => (prev ? { ...prev, text: prev.text + delta } : prev))
    })

    window.api
      .requestTutor(id, req)
      .then((result) => {
        setReport((prev) => {
          if (!prev) return prev
          if (result.ok) return { text: result.text ?? prev.text, streaming: false }
          return { text: prev.text, streaming: false, error: result.error ?? 'Unbekannter Fehler' }
        })
      })
      .finally(() => {
        unsubscribe()
        busyRef.current = false
        setBusy(false)
      })
  }, [game, hasApiKey])

  const clear = useCallback(() => setReport(null), [])

  return { report, busy, request, clear }
}
