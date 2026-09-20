import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampElo, expectedScore, kFactor, nearestLevel, updateElo } from '../src/renderer/src/game/rating'

test('expectedScore is 0.5 for equal ratings and favors the stronger side', () => {
  assert.equal(expectedScore(1500, 1500), 0.5)
  assert.ok(expectedScore(1600, 1400) > 0.5)
  assert.ok(expectedScore(1400, 1600) < 0.5)
})

test('a win against a much stronger opponent raises Elo more than a loss lowers it', () => {
  const afterWin = updateElo(1500, 0, 1900, 1)
  const afterLoss = updateElo(1500, 0, 1900, 0)
  assert.ok(afterWin > 1500)
  assert.ok(afterLoss < 1500)
  assert.ok(afterWin - 1500 > 1500 - afterLoss)
})

test('a draw against a weaker opponent lowers Elo, against a stronger opponent raises it', () => {
  assert.ok(updateElo(1500, 0, 1300, 0.5) < 1500)
  assert.ok(updateElo(1500, 0, 1700, 0.5) > 1500)
})

test('kFactor tapers from provisional to standard after 10 rated games', () => {
  assert.equal(kFactor(0), 40)
  assert.equal(kFactor(9), 40)
  assert.equal(kFactor(10), 20)
  assert.equal(kFactor(100), 20)
})

test('nearestLevel picks the closest value from a discrete list', () => {
  const levels = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]
  assert.equal(nearestLevel(1150, levels), 1100)
  assert.equal(nearestLevel(1160, levels), 1200)
  assert.equal(nearestLevel(2200, levels), 1900)
  assert.equal(nearestLevel(800, levels), 1100)
})

test('clampElo keeps a value within bounds', () => {
  assert.equal(clampElo(1000, 1320, 3190), 1320)
  assert.equal(clampElo(5000, 1320, 3190), 3190)
  assert.equal(clampElo(1800, 1320, 3190), 1800)
})
