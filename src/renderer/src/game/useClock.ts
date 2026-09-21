import { useEffect, useRef, useState } from 'react'
import type { ClockMode } from '../settings'
import type { GameApi } from './useGame'

export interface ClockConfig {
  mode: ClockMode
  baseMinutes: number
  incrementSeconds: number
}

export interface ClockApi {
  enabled: boolean
  remainingMs: { w: number; b: number }
  /** Welche Seite gerade tatsächlich herunterzählt (null = Uhr steht/ist aus). */
  running: 'w' | 'b' | null
}

const TICK_MS = 100

/** mm:ss, bzw. h:mm:ss ab einer Stunde Restzeit. */
export function formatClockMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * Einfache Schachuhr auf Basis von Wanduhrzeit: zählt für die jeweils am Zug
 * befindliche Seite herunter, schreibt bei jedem gespielten Zug das Inkrement
 * gut und meldet bei Zeitüberschreitung ein erzwungenes Partieergebnis.
 * Rein renderer-seitig – braucht keine Engine-/IPC-Anbindung.
 */
export function useChessClock(game: GameApi, config: ClockConfig): ClockApi {
  const enabled = config.mode !== 'unlimited'
  const [remaining, setRemaining] = useState<{ w: number; b: number }>({ w: 0, b: 0 })
  const remainingRef = useRef(remaining)
  const prevMoveCountRef = useRef(0)
  const historyRef = useRef<{ uci?: string; remaining: { w: number; b: number } }[]>([])

  // Neue/importierte Partie oder geänderte Zeitkontrolle -> Uhr auf Grundzeit zurücksetzen
  useEffect(() => {
    const baseMs = config.baseMinutes * 60_000
    const initial = { w: baseMs, b: baseMs }
    remainingRef.current = initial
    setRemaining(initial)
    prevMoveCountRef.current = game.moves.length
    historyRef.current = [
      { remaining: initial },
      ...game.moves.map(move => ({ uci: move.uci, remaining: { ...initial } }))
    ]
    // game.startedAt identifiziert eindeutig eine neue Partie (newGame/importGame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.startedAt, config.mode, config.baseMinutes])

  // Zeitstände für Rücknahme/Wiederherstellung behalten. Ein neuer Zweig ersetzt
  // die alte Zukunft; Redo stellt deren Zeit wieder her, ohne erneut Inkrement.
  useEffect(() => {
    const prevCount = prevMoveCountRef.current
    const count = game.moves.length
    prevMoveCountRef.current = count
    if (!enabled || count === prevCount) return
    const history = historyRef.current
    history[prevCount].remaining = { ...remainingRef.current }
    let next = { ...remainingRef.current }
    if (count < prevCount) {
      next = { ...history[count].remaining }
    } else {
      for (let i = prevCount; i < count; i++) {
        const move = game.moves[i]
        const saved = history[i + 1]
        if (saved?.uci === move.uci) {
          next = { ...saved.remaining }
        } else {
          history.length = i + 1
          next = { ...next, [move.color]: next[move.color] + config.incrementSeconds * 1000 }
          history.push({ uci: move.uci, remaining: { ...next } })
        }
      }
    }
    remainingRef.current = next
    setRemaining(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.moves.length, enabled, config.incrementSeconds])

  // Erst ab dem ersten gespielten Zug läuft die Uhr - der allererste Zug der
  // Partie (übliches Verhalten bei einer freien/kasuellen Zeitkontrolle, nicht
  // die Turnier-Variante mit sofort laufender Uhr) ist unbegrenzt bedenkbar.
  const running = enabled && game.moves.length > 0 && !game.result && !game.reviewMode ? game.turn : null

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const delta = now - last
      last = now
      const next = {
        ...remainingRef.current,
        [running]: Math.max(0, remainingRef.current[running] - delta)
      }
      remainingRef.current = next
      setRemaining(next)
      if (next[running] <= 0) {
        window.clearInterval(id)
        game.forceResult({
          result: running === 'w' ? '0-1' : '1-0',
          reason: 'time-forfeit',
          winner: running === 'w' ? 'b' : 'w',
          termination: 'time forfeit'
        })
      }
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [running, game.forceResult])

  return { enabled, remainingMs: remaining, running }
}
