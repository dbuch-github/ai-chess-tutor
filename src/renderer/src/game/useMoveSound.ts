import { useEffect, useRef } from 'react'
import type { GameApi } from './useGame'

let sharedCtx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedCtx) sharedCtx = new Ctor()
  return sharedCtx
}

/**
 * Synthetisiert ein kurzes, perkussives "Klack" (Figur auf Holzbrett) direkt per
 * Web-Audio-API – braucht keine Audiodatei: ein gefilterter Rausch-Burst für den
 * harten Anschlag, dazu ein kurzer tiefer Tonimpuls für den "Körper" des Klangs.
 */
function playClick(): void {
  const ctx = getContext()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  const now = ctx.currentTime

  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.05))
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buffer

  const bandpass = ctx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = 2200
  bandpass.Q.value = 1.1

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.55, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)

  noise.connect(bandpass)
  bandpass.connect(noiseGain)
  noiseGain.connect(ctx.destination)
  noise.start(now)
  noise.stop(now + 0.08)

  const thud = ctx.createOscillator()
  thud.type = 'sine'
  thud.frequency.setValueAtTime(210, now)
  thud.frequency.exponentialRampToValueAtTime(90, now + 0.05)
  const thudGain = ctx.createGain()
  thudGain.gain.setValueAtTime(0.35, now)
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
  thud.connect(thudGain)
  thudGain.connect(ctx.destination)
  thud.start(now)
  thud.stop(now + 0.07)
}

/** Spielt bei jedem tatsächlich neu gespielten Zug (inkl. Redo) ein Klick-Geräusch ab. */
export function useMoveSound(game: GameApi, enabled: boolean): void {
  const prevCountRef = useRef(game.moves.length)

  useEffect(() => {
    const prev = prevCountRef.current
    prevCountRef.current = game.moves.length
    if (enabled && game.moves.length > prev) playClick()
  }, [game.moves.length, enabled])
}
