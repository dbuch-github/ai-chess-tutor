import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Chess } from 'chess.js'
import { inferMove, isMoveInProgress, piecesOf } from '../src/renderer/src/chessnut/inferMove'

test('lifting a pawn or removing both pieces of a capture is a move in progress', () => {
  const chess = new Chess()
  const lifted = piecesOf(chess); delete lifted.e2
  assert.equal(inferMove(chess, lifted), null)
  assert.equal(isMoveInProgress(chess, lifted), true)
  chess.move('e4'); chess.move('d5')
  const capture = piecesOf(chess); delete capture.e4; delete capture.d5
  assert.equal(isMoveInProgress(chess, capture), true)
})

test('partial castling, en passant and promotion are accepted as transitions', () => {
  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
  const partial = piecesOf(castle); delete partial.e1; partial.g1 = 'K'
  assert.equal(isMoveInProgress(castle, partial), true)
  const ep = new Chess('7k/8/8/3pP3/8/8/8/K7 w - d6 0 1')
  const epPartial = piecesOf(ep); delete epPartial.e5; epPartial.d6 = 'P'
  assert.equal(isMoveInProgress(ep, epPartial), true)
  const promotion = new Chess('7k/P7/8/8/8/8/8/K7 w - - 0 1')
  const promPartial = piecesOf(promotion); delete promPartial.a7; promPartial.a8 = 'P'
  assert.equal(isMoveInProgress(promotion, promPartial), true)
})

test('an illegally placed pawn remains an invalid attempt', () => {
  const chess = new Chess()
  const invalid = piecesOf(chess); delete invalid.e2; invalid.e5 = 'P'
  assert.equal(inferMove(chess, invalid), null)
  assert.equal(isMoveInProgress(chess, invalid), false)
})
