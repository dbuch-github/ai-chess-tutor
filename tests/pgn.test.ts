import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Chess } from 'chess.js'
import { buildPgn, parsePgn } from '../src/renderer/src/game/pgn'
import { historySan } from '../src/renderer/src/game/notation'

const meta = { playerColor: 'w' as const, opponentName: 'Engine', startedAt: new Date('2026-09-13T10:00:00Z') }

test('FEN setup, comments, move numbers and history survive repeated PGN round trips', () => {
  const fen = '7k/8/8/8/8/8/4P3/K7 b - - 0 24'
  const input = `[SetUp "1"]\n[FEN "${fen}"]\n\n{Start comment} 24... Kg7 {King move} 25. e4 {Pawn move} *`
  const expected = new Chess(); expected.loadPgn(input)
  let game = parsePgn(input)
  for (let i = 0; i < 3; i++) {
    assert.equal(game.initialFen, fen)
    assert.equal(game.chess.fen(), expected.fen())
    assert.equal(game.initialComment, 'Start comment')
    assert.deepEqual(game.moves.map(m => m.comment), ['King move', 'Pawn move'])
    assert.equal(historySan(game.moves), '24… Kg7 25. e4')
    game = parsePgn(buildPgn(game.moves, { ...meta, ...game }))
  }
  game.chess.undo()
  assert.equal(game.chess.fen(), game.moves[1].fenBefore)
})

test('an empty setup PGN retains its position on export', () => {
  const input = '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/4P3/K7 w - - 0 1"]\n\n*'
  const game = parsePgn(input)
  assert.equal(parsePgn(buildPgn(game.moves, { ...meta, ...game })).chess.fen(), game.initialFen)
})

test('flag fall is exported and reimported as a completed game', () => {
  const game = parsePgn('1. e4 e5 *')
  const outcome = { result: '1-0' as const, winner: 'w' as const, reason: 'time-forfeit' as const, termination: 'time forfeit' }
  const pgn = buildPgn(game.moves, { ...meta, outcome })
  const loaded = parsePgn(pgn)
  assert.deepEqual(loaded.outcome, outcome)
  assert.equal(loaded.chess.getHeaders().Result, '1-0')
  assert.equal(loaded.chess.getHeaders().Termination, 'time forfeit')
})

test('checkmate takes precedence over a simultaneous clock result', () => {
  const game = parsePgn('1. f3 e5 2. g4 Qh4# 0-1')
  const pgn = buildPgn(game.moves, { ...meta, outcome: { result: '1-0', winner: 'w', reason: 'time-forfeit', termination: 'time forfeit' } })
  assert.equal(parsePgn(pgn).outcome?.result, '0-1')
  assert.equal(parsePgn(pgn).outcome?.termination, undefined)
})

test('a discarded continuation on a move is written as a bracketed variation, mainline unaffected on reload', () => {
  const discarded = parsePgn('1. e4 e5 2. Nf3 Nc6 *').moves.slice(2)
  const main = parsePgn('1. e4 e5 2. Bc4 Bc5 *').moves
  main[2] = { ...main[2], variations: [{ moves: discarded }] }
  const pgn = buildPgn(main, meta)
  assert.match(pgn, /2\. Bc4 \(2\. Nf3 Nc6\) 2\.\.\. Bc5/)
  assert.equal(historySan(parsePgn(pgn).moves), '1. e4 e5 2. Bc4 Bc5')
})

test('sibling and nested variations retain their comments through repeated PGN round trips', () => {
  const input = '1.e4 e5 2.Bc4 ( {Branch start} 2.Nf3 {Tutor (keep this)} Nc6 (2...Nf6 {Nested})) (2.d4 exd4) Bc5 *'
  let game = parsePgn(input)
  for (let i = 0; i < 3; i++) {
    assert.equal(historySan(game.moves), '1. e4 e5 2. Bc4 Bc5')
    const branches = game.moves[2].variations!
    assert.equal(branches.length, 2)
    assert.equal(branches[0].initialComment, 'Branch start')
    assert.equal(branches[0].moves[0].comment, 'Tutor (keep this)')
    assert.equal(branches[0].moves[1].variations?.[0].moves[0].comment, 'Nested')
    assert.equal(historySan(branches[1].moves), '2. d4 exd4')
    game = parsePgn(buildPgn(game.moves, { ...meta, ...game }))
  }
})

test('variations from a black-to-move FEN keep their starting position and semicolon comments', () => {
  const fen = '7k/8/8/8/8/8/4P3/K7 b - - 0 24'
  const input = `[SetUp "1"]\n[FEN "${fen}"]\n\n24...Kg7 (24...Kh7 ;alternative\n25.e4 $1) 25.e3 *`
  const game = parsePgn(input)
  const loaded = parsePgn(buildPgn(game.moves, { ...meta, ...game }))
  const branch = loaded.moves[0].variations![0].moves
  assert.equal(branch[0].fenBefore, fen)
  assert.equal(branch[0].comment, 'alternative')
  assert.equal(historySan(branch), '24… Kh7 25. e4')
})

test('attached annotations import and malformed variations are rejected', () => {
  const game = parsePgn('1.e4$1 (1.d4!? d5) e5 *')
  assert.equal(game.moves[0].variations?.[0].moves[0].san, 'd4')
  assert.throws(() => parsePgn('1.e4 (1.d4 *'), /Unclosed/)
  assert.throws(() => parsePgn('1.e4 (1.e5) *'), /Invalid move/)
  assert.throws(() => parsePgn('1.e4 {unclosed *'))
})
