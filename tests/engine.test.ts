import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { UciEngine } from '../src/main/engine/UciEngine'
import { EngineManager } from '../src/main/engine/EngineManager'
import type { AnalysisSnapshot } from '../src/shared/types'

const fixture = fileURLToPath(new URL('./fixtures/fake-uci.mjs', import.meta.url))

test('stopping a search settles all stop callers and leaves the next move intact', { timeout: 10_000 }, async () => {
  const engine = new UciEngine()
  await engine.start(fixture)
  try {
    const first = engine.goMovetime(5000)
    const started = Date.now()
    await Promise.all([engine.stopSearch(), engine.stopSearch()])
    assert.equal(await first, 'e2e4')
    assert.ok(Date.now() - started < 900, 'stop must finish on bestmove, not the timeout')
    assert.equal(await engine.goNodes(1), 'e2e4')
  } finally { await engine.quit() }
})

test('a stop timeout rejects the pending move and prevents late answers contaminating a restart', { timeout: 10_000 }, async () => {
  const engine = new UciEngine()
  await engine.start(fixture)
  await engine.setOptions({ IgnoreStop: true })
  const move = assert.rejects(engine.goMovetime(5000), /stop timeout/)
  await assert.rejects(engine.stopSearch(), /stop timeout/)
  await move
  assert.equal(engine.running, false)
  await engine.start(fixture)
  try { assert.equal(await engine.goNodes(1), 'e2e4') }
  finally { await engine.quit() }
})

test('quitting settles a pending move instead of leaving its caller busy', { timeout: 10_000 }, async () => {
  const engine = new UciEngine()
  await engine.start(fixture)
  const move = assert.rejects(engine.goMovetime(5000), /Engine stopped/)
  await engine.quit()
  await move
})

class ControlledEngine extends UciEngine {
  commands: string[] = []
  stopGate: Promise<void> | null = null
  override get running() { return true }
  override async start() {}
  override async setOptions() {}
  override newGame() {}
  override async quit() {}
  override async stopSearch() { await this.stopGate }
  override position(moves: string[], initialFen?: string) { this.commands.push(JSON.stringify({ moves, initialFen })) }
  override goInfinite() { this.commands.push('go') }
  override async goMovetime() { return 'e2e4' }
}

test('late info keeps the old FEN and rapid A-B-A switches start only the newest search', { timeout: 10_000 }, async () => {
  const engine = new ControlledEngine()
  const snapshots: AnalysisSnapshot[] = []
  const manager = new EngineManager(s => snapshots.push(s), new ControlledEngine(), engine)
  await manager.setAnalysisPosition('A', [])
  let release!: () => void
  engine.stopGate = new Promise<void>(r => { release = r })
  const b = manager.setAnalysisPosition('B', ['e2e4'])
  await Promise.resolve()
  engine.emit('info', { multipv: 1, depth: 14, cp: 42, pvUci: ['a2a4'] })
  await new Promise(r => setTimeout(r, 220))
  assert.equal(snapshots[0]?.fen, 'A')
  const a = manager.setAnalysisPosition('A', [])
  engine.emit('info', { multipv: 1, depth: 15, cp: 43, pvUci: ['a2a4'] })
  release()
  await Promise.all([a, b])
  assert.deepEqual(snapshots.map(s => s.fen), ['A', 'A'])
  assert.equal(engine.commands.filter(c => c === 'go').length, 2)
  engine.emit('info', { multipv: 1, depth: 1, cp: 0, pvUci: ['h2h4'] })
  await manager.setAnalysisPosition('C', ['d2d4'])
  assert.equal(snapshots.at(-1)?.lines[0].depth, 1)
  await manager.shutdown()
})

test('custom starting FEN reaches UCI, opponent and resumed analysis', { timeout: 10_000 }, async () => {
  const fen = '7k/8/8/8/8/8/4P3/K7 w - - 0 1'
  const sent: string[] = []
  const uci = new UciEngine()
  uci.send = command => { sent.push(command) }
  uci.position(['e2e4'], fen)
  assert.equal(sent[0], `position fen ${fen} moves e2e4`)
  uci.position([])
  assert.equal(sent[1], 'position startpos')
  const analysis = new ControlledEngine()
  const opponent = new ControlledEngine()
  const manager = new EngineManager(() => {}, opponent, analysis)
  await manager.configureOpponent({ kind: 'stockfish', enginePath: '', limitStrength: false, elo: 1500, moveTimeMs: 5 })
  await manager.requestOpponentMove(['e2e4'], fen)
  await manager.setAnalysisPosition('end', ['e2e4'], fen)
  await manager.configureAnalysis({ enginePath: '', multiPv: 3, threads: 1, hashMb: 16 })
  const expected = JSON.stringify({ moves: ['e2e4'], initialFen: fen })
  assert.ok(opponent.commands.includes(expected))
  assert.equal(analysis.commands.filter(c => c === expected).length, 2)
})
