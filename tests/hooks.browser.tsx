import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Chess } from 'chess.js'
import { useGame, type GameApi } from '../src/renderer/src/game/useGame'
import { useChessClock } from '../src/renderer/src/game/useClock'
import { useGameLibrary } from '../src/renderer/src/game/useGameLibrary'
import { useTutor } from '../src/renderer/src/game/useTutor'
import { parsePgn } from '../src/renderer/src/game/pgn'
import { piecesOf } from '../src/renderer/src/chessnut/inferMove'
import { useChessnutSync } from '../src/renderer/src/chessnut/useChessnutSync'

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
const globals = window as any
globals.IS_REACT_ACT_ENVIRONMENT = true
function mockApi(extra: Record<string, unknown> = {}) {
  globals.api = {
    setAnalysisPosition: async () => {}, onAnalysisSnapshot: () => () => {},
    libraryList: async () => [], librarySave: async () => ({ ok: true }),
    tutorStatus: async () => ({ hasApiKey: true }), onTutorDelta: () => () => {}, resetTutor: async () => {},
    ...extra
  }
}
async function mount(Component: () => React.ReactNode) {
  const el = document.createElement('div'); document.body.append(el)
  const root = createRoot(el)
  const render = async () => { await act(async () => { root.render(<Component />) }) }
  await render()
  return { render, close: async () => { await act(async () => root.unmount()); el.remove() } }
}

export async function runHookTests() {
  const passed: string[] = []
  {
    const requests: any[] = []
    const parsed = parsePgn('1. e4 e5 2. Nf3 *')
    const moves = parsed.moves.map(m => ({ ...m, classification: 'mistake', lossPct: 25 }))
    let game = {
      ...parsed, fen: moves[0].fenAfter, playerColor: 'w', twoPlayerMode: false,
      moves: moves.slice(0, 1), setMoveComment: () => {},
      getEval: (fen: string) => {
        const m = new Chess(fen).moves({ verbose: true })[0]
        return { depth: 15, multipv: 1, cp: 0, pvUci: [m.from + m.to + (m.promotion ?? '')] }
      }
    } as unknown as GameApi
    mockApi({ requestTutor: (_id: number, req: unknown) => new Promise(resolve => requests.push({ req, resolve })) })
    const preview = { active: null, show() {}, hide() {}, toggle() {}, isActive: () => false }
    let tutor!: ReturnType<typeof useTutor>
    const ui = await mount(() => { tutor = useTutor(game, 'mistakes', preview); return null })
    assert(requests.length === 1, 'first mistake should start a tutor request')
    game = { ...game, moves: [moves[0], { ...moves[1], classification: 'good' }, moves[2]] as any, fen: moves[2].fenAfter }
    await ui.render()
    assert(requests.length === 1, 'second mistake must wait while tutor is busy')
    await act(async () => requests[0].resolve({ ok: true, text: 'First comment' }))
    assert(requests.length === 2, 'queued mistake must be sent when the first answer finishes')
    assert(requests[1].req.san === 'Nf3', 'queued comment must refer to the pending move')
    await act(async () => requests[1].resolve({ ok: true, text: 'Second comment' }))
    assert(!tutor.busy, 'tutor should become available after draining pending comments')
    await ui.close()
    passed.push('Tutor retries pending automatic comments after an active answer')
  }
  {
    const chess = new Chess()
    let snapshot = piecesOf(chess)
    const game = { fen: chess.fen(), lastMove: null, turn: 'w', playerColor: 'w', twoPlayerMode: false, result: null, reviewMode: false } as unknown as GameApi
    let sync!: ReturnType<typeof useChessnutSync>
    const ui = await mount(() => {
      sync = useChessnutSync(game, { status: 'connected', snapshot, setLeds: async () => {} } as any)
      return null
    })
    assert(!sync.awaitingPhysicalSync, 'initial board should synchronize')
    snapshot = piecesOf(chess); delete snapshot.e2
    for (let i = 0; i < 3; i++) { snapshot = { ...snapshot }; await ui.render() }
    assert(sync.invalidAttempt === 0, 'holding own piece must not signal an invalid move')
    snapshot = { ...snapshot, e5: 'P' }
    for (let i = 0; i < 2; i++) { snapshot = { ...snapshot }; await ui.render() }
    assert(sync.invalidAttempt === 1, 'illegal placement must still signal exactly once')
    await ui.close()
    passed.push('Chessnut hook distinguishes a held piece from an illegal placement')
  }
  {
    const saved: string[] = []
    const positions: any[] = []
    const opponent: any[] = []
    mockApi({
      setAnalysisPosition: async (...args: unknown[]) => { positions.push(args) },
      requestOpponentMove: async (...args: unknown[]) => { opponent.push(args); return '(none)' },
      librarySave: async (pgn: string) => { saved.push(pgn); return { ok: true } }
    })
    let game!: GameApi
    const ui = await mount(() => { game = useGame(true, true); useGameLibrary(game, 'Engine'); return null })
    const fen = '7k/8/8/8/8/8/4P3/K7 b - - 0 24'
    await act(async () => { assert(game.importGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n24... Kg7 {keep me} *`), 'setup must import') })
    assert(game.initialFen === fen && game.moves[0].comment === 'keep me', 'hook must preserve setup metadata')
    assert(positions.at(-1)[2] === fen, 'analysis IPC must receive setup FEN')
    await act(async () => game.continuePlaying())
    await act(async () => game.makeUserMove('e2', 'e4'))
    assert(opponent.at(-1)[1] === fen, 'opponent IPC must receive setup FEN, even with the opening book enabled')
    await act(async () => game.forceResult({ result: '1-0', reason: 'time-forfeit', winner: 'w', termination: 'time forfeit' }))
    assert(saved.length === 1, 'completed game must auto-save once')
    assert(parsePgn(saved[0]).outcome?.result === '1-0', 'auto-save must retain the clock result')
    await act(async () => game.importGame(saved[0]))
    assert(game.outcome?.reason === 'time-forfeit', 'reopening must retain the completion reason')
    assert(saved.length === 1, 'reopening must not auto-save again')
    await act(async () => game.newGame('w'))
    assert(game.initialFen === new Chess().fen() && game.outcome === null, 'new game must clear custom setup and outcome')
    await ui.close()
    passed.push('Game hook and auto-save preserve custom FEN, comments and flag-fall outcome')
  }
  {
    mockApi()
    let game!: GameApi
    const ui = await mount(() => { game = useGame(true, false); return null })
    await act(async () => game.startTwoPlayerGame())
    await act(async () => game.makeUserMove('e2', 'e4'))
    await act(async () => game.makeUserMove('e7', 'e5'))
    await act(async () => game.makeUserMove('g1', 'f3'))
    assert(game.moves.map(m => m.san).join(' ') === 'e4 e5 Nf3', 'mainline before undo')
    await act(async () => game.undoMove())
    assert(game.moves.map(m => m.san).join(' ') === 'e4 e5', 'undo removes the last move')
    await act(async () => game.makeUserMove('f1', 'c4'))
    assert(game.moves.length === 3 && game.moves[2].san === 'Bc4', 'a different move replaces the undone one')
    assert(
      game.moves[2].variations?.[0].moves.map(m => m.san).join(' ') === 'Nf3',
      'the discarded continuation is kept as a variation on the new move'
    )
    await act(async () => game.undoMove())
    await act(async () => game.makeUserMove('f1', 'c4'))
    assert(!game.moves[2].variations, 'replaying the exact same move must not attach a variation')
    await ui.close()
    passed.push('Undo followed by a different move records the discarded continuation as a variation')
  }
  {
    const pending: ((move: string) => void)[] = []
    mockApi({ requestOpponentMove: () => new Promise<string>(resolve => pending.push(resolve)) })
    let game!: GameApi
    const ui = await mount(() => { game = useGame(true, false); return null })
    await act(async () => game.newGame('b'))
    assert(pending.length === 1, 'black game must request the first engine move')
    await act(async () => game.newGame('b'))
    assert(pending.length === 2, 'same-position restart must request a new engine move')
    await act(async () => pending[0]('d2d4'))
    assert(game.moves.length === 0 && game.thinking, 'old answer must not move or clear the new search')
    await act(async () => pending[1]('e2e4'))
    assert(game.moves[0]?.san === 'e4' && !game.thinking, 'new engine answer must be applied')
    await ui.close()
    passed.push('Restart as black replaces the pending first engine move')
  }
  {
    mockApi()
    let game!: GameApi
    let clock!: ReturnType<typeof useChessClock>
    const ui = await mount(() => {
      game = useGame(true, false)
      clock = useChessClock(game, { mode: 'rapid', baseMinutes: 15, incrementSeconds: 10 })
      return null
    })
    await act(async () => game.startTwoPlayerGame())
    await act(async () => game.makeUserMove('e2', 'e4'))
    const first = { ...clock.remainingMs }
    await act(async () => game.undoMove())
    assert(clock.remainingMs.w === 900000, 'undo must restore the clock before the move')
    await act(async () => game.redoMove())
    assert(clock.remainingMs.w === first.w, 'redo must not grant another increment')
    await act(async () => game.makeUserMove('e7', 'e5'))
    const pair = { ...clock.remainingMs }
    for (let i = 0; i < 3; i++) {
      await act(async () => game.undoMove())
      assert(game.moves.length === 0, 'undo must remove the whole pair')
      await act(async () => game.redoMove())
      assert(Math.abs(clock.remainingMs.w - pair.w) < 100, 'pair redo must restore white clock')
      assert(Math.abs(clock.remainingMs.b - pair.b) < 100, 'pair redo must restore black clock')
    }
    await act(async () => game.undoMove())
    await act(async () => game.makeUserMove('d2', 'd4'))
    assert(clock.remainingMs.w === 910000, 'a replacement move receives exactly one increment')
    await act(async () => game.makeUserMove('d7', 'd5'))
    assert(clock.remainingMs.b === 910000, 'new branch credits the black move as well')
    await act(async () => game.newGame('w'))
    assert(clock.remainingMs.w === 900000 && clock.remainingMs.b === 900000, 'new game resets clock history')
    await ui.close()
    passed.push('Clock undo and redo restore times for individual moves, pairs and new branches')
  }
  return passed
}
