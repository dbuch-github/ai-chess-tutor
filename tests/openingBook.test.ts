import assert from 'node:assert/strict'
import { test } from 'node:test'
import { previewContinuation } from '../src/renderer/src/game/openingBook'

test('previewContinuation is deterministic (same input -> same output, unlike pickBookMove)', () => {
  const a = previewContinuation(['e4'])
  const b = previewContinuation(['e4'])
  assert.deepEqual(a, b)
  assert.ok(a.length > 0 && a.length <= 3)
})

test('previewContinuation returns nothing once the position has left the opening book', () => {
  const oddSequence = ['a4', 'a5', 'a3', 'a6', 'h4', 'h5', 'h3', 'h6', 'b4', 'b5', 'b3', 'b6', 'g4']
  assert.deepEqual(previewContinuation(oddSequence), [])
})
