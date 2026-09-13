import { useCallback, useEffect, useRef, useState } from 'react'
import type { TutorRequest, TutorStatus } from '../../../shared/types'
import { formatScore } from './classify'
import { buildLinePreview, type MovePreview } from './boardVisuals'
import type { BoardPreviewApi } from './useBoardPreview'
import { gamePhase, historySan, pvToSan } from './notation'
import type { GameApi, MoveRecord } from './useGame'
import type { TutorMode } from '../settings'

export interface TutorMessage {
  id: number
  role: 'tutor' | 'user' | 'error'
  text: string
  streaming?: boolean
  preview?: MovePreview
}

export interface TutorApi {
  messages: TutorMessage[]
  busy: boolean
  status: TutorStatus | null
  ask: (question: string) => void
  suggestMove: () => void
  togglePreview: (message: TutorMessage) => void
  refreshStatus: () => void
  clear: () => void
}

let nextId = 1

function sideToMove(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}

function messageKey(id: number): string {
  return `msg-${id}`
}

export function useTutor(game: GameApi, mode: TutorMode, boardPreview: BoardPreviewApi): TutorApi {
  const [messages, setMessages] = useState<TutorMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<TutorStatus | null>(null)
  const commentedRef = useRef(new Set<string>())
  const busyRef = useRef(false)
  const gameRef = useRef(game)
  gameRef.current = game

  const refreshStatus = useCallback(() => {
    window.api.tutorStatus().then(setStatus)
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  // Streaming-Deltas in die laufende Tutor-Nachricht schreiben
  useEffect(() => {
    return window.api.onTutorDelta((id, delta) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id && m.streaming ? { ...m, text: m.text + delta } : m))
      )
    })
  }, [])

  const runRequest = useCallback(
    (request: TutorRequest, preview?: MovePreview) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      const id = nextId++
      setMessages((prev) => [...prev, { id, role: 'tutor', text: '', streaming: true, preview }])
      // Nur einblenden, wenn der Vorschlag noch zur aktuell angezeigten Stellung passt
      if (preview && preview.fen === gameRef.current.fen) {
        boardPreview.show(messageKey(id), preview)
      }
      window.api
        .requestTutor(id, request)
        .then((result) => {
          setMessages((prev) =>
            prev
              .map((m) => {
                if (m.id !== id) return m
                if (result.ok) return { ...m, text: result.text ?? m.text, streaming: false }
                return { ...m, role: 'error' as const, text: result.error ?? 'Unbekannter Fehler', streaming: false }
              })
              .filter((m) => m.text !== '')
          )
        })
        .finally(() => {
          busyRef.current = false
          setBusy(false)
        })
    },
    [boardPreview]
  )

  // Auto-Kommentare: neu klassifizierte Züge je nach Modus kommentieren
  useEffect(() => {
    if (mode === 'off' || !status?.hasApiKey) return
    const moves = game.moves
    // rückwärts den jüngsten kommentierwürdigen, noch nicht kommentierten Zug suchen
    for (let i = moves.length - 1; i >= 0; i--) {
      const move = moves[i]
      if (!move.classification) continue
      const key = `${i}:${move.uci}`
      if (commentedRef.current.has(key)) continue
      if (!shouldComment(move, game.playerColor, mode)) {
        commentedRef.current.add(key)
        continue
      }
      commentedRef.current.add(key)
      const built = buildMoveRequest(gameRef.current, move, i)
      if (built) runRequest(built.request, built.preview)
      break
    }
  }, [game.moves, game.playerColor, mode, status?.hasApiKey, runRequest])

  const ask = useCallback(
    (question: string) => {
      const g = gameRef.current
      const line = g.getEval(g.fen)
      const stm = sideToMove(g.fen)
      setMessages((prev) => [...prev, { id: nextId++, role: 'user', text: question }])
      runRequest({
        kind: 'question',
        question,
        fen: g.fen,
        turn: stm,
        playerColor: g.playerColor,
        evalNow: line ? formatScore(line, stm) : 'unbekannt',
        linesSan:
          g.snapshot?.fen === g.fen
            ? g.snapshot.lines.map((l) => `${formatScore(l, stm)}: ${pvToSan(g.fen, l.pvUci)}`)
            : [],
        historySan: historySan(g.moves)
      })
    },
    [runRequest]
  )

  const suggestMove = useCallback(() => {
    const g = gameRef.current
    const line = g.getEval(g.fen)
    if (!line) return
    const preview = buildLinePreview(g.fen, line.pvUci)
    if (!preview) return
    const stm = sideToMove(g.fen)
    runRequest(
      {
        kind: 'suggest',
        fen: g.fen,
        turn: stm,
        playerColor: g.playerColor,
        evalNow: formatScore(line, stm),
        bestMoveSan: preview.sanMove,
        bestLineSan: pvToSan(g.fen, line.pvUci),
        historySan: historySan(g.moves)
      },
      preview
    )
  }, [runRequest])

  const togglePreview = useCallback(
    (message: TutorMessage) => {
      if (!message.preview) return
      boardPreview.toggle(messageKey(message.id), message.preview)
    },
    [boardPreview]
  )

  const clear = useCallback(() => {
    setMessages([])
    commentedRef.current.clear()
    boardPreview.hide()
    window.api.resetTutor()
  }, [boardPreview])

  return { messages, busy, status, ask, suggestMove, togglePreview, refreshStatus, clear }
}

function shouldComment(move: MoveRecord, playerColor: 'w' | 'b', mode: TutorMode): boolean {
  const isPlayer = move.color === playerColor
  if (mode === 'mistakes') {
    return isPlayer && (move.classification === 'blunder' || move.classification === 'mistake')
  }
  // chatty: Spielerfehler ab Ungenauigkeit, Engine-Patzer zum Ausnutzen
  if (isPlayer) {
    return (
      move.classification === 'blunder' ||
      move.classification === 'mistake' ||
      move.classification === 'inaccuracy'
    )
  }
  return move.classification === 'blunder' || move.classification === 'mistake'
}

function buildMoveRequest(
  game: GameApi,
  move: MoveRecord,
  index: number
): { request: TutorRequest; preview: MovePreview } | null {
  const before = game.getEval(move.fenBefore)
  const after = game.getEval(move.fenAfter)
  if (!before || !after || move.lossPct === undefined || !move.classification) return null
  const preview = buildLinePreview(move.fenBefore, before.pvUci)
  if (!preview) return null
  return {
    request: {
      kind: 'move',
      moveNumber: Math.floor(index / 2) + 1,
      san: move.san,
      color: move.color,
      playerColor: game.playerColor,
      classification: move.classification,
      lossPct: move.lossPct,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      evalBefore: formatScore(before, sideToMove(move.fenBefore)),
      evalAfter: formatScore(after, sideToMove(move.fenAfter)),
      bestMoveSan: preview.sanMove,
      bestLineSan: pvToSan(move.fenBefore, before.pvUci),
      historySan: historySan(game.moves.slice(0, index + 1)),
      phase: gamePhase(move.fenBefore, index)
    },
    preview
  }
}
