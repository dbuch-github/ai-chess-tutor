import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findTactics } from '../src/renderer/src/game/tactics'

test('fork: knight move attacking a rook and a bishop at once', () => {
  const fen = '4k3/2r5/8/8/1N6/4b3/8/4K3 w - - 0 1'
  const findings = findTactics(fen)
  const fork = findings.find((f) => f.type === 'fork' && f.from === 'b4' && f.to === 'd5')
  assert.ok(fork, 'expected a fork finding for Nb4-d5')
  assert.deepEqual(new Set(fork!.targets), new Set(['c7', 'e3']))
})

test('pin: queen move pins a knight to the king along the d-file', () => {
  const fen = '3k4/8/3n4/8/8/8/3Q4/4K3 w - - 0 1'
  const findings = findTactics(fen)
  const pin = findings.find((f) => f.type === 'pin' && f.from === 'd2' && f.to === 'd5')
  assert.ok(pin, 'expected a pin finding for Qd2-d5')
  assert.deepEqual(pin!.targets, ['d6'])
})

test('skewer: bishop move attacks a rook with a bishop behind it on the same diagonal', () => {
  // Turm als vordere Figur (statt einer Dame): Türme schlagen nicht diagonal
  // zurück, der angreifende Läufer steht also wirklich sicher auf c3 – bei
  // einer Dame als vorderer Figur könnte sie den Läufer selbst zurückschlagen.
  const fen = '4k3/6b1/8/4r3/8/8/3B4/7K w - - 0 1'
  const findings = findTactics(fen)
  const skewer = findings.find((f) => f.type === 'skewer' && f.from === 'd2' && f.to === 'c3')
  assert.ok(skewer, 'expected a skewer finding for Bd2-c3')
  assert.deepEqual(skewer!.targets, ['g7'])
})

test('hanging: capturing an undefended knight for free', () => {
  const fen = '4k3/8/8/3n4/8/2N5/8/4K3 w - - 0 1'
  const findings = findTactics(fen)
  const hanging = findings.find((f) => f.type === 'hanging' && f.from === 'c3' && f.to === 'd5')
  assert.ok(hanging, 'expected a hanging-piece finding for Nxd5')
  assert.equal(hanging!.gain, 3)
})

test('check: a safe move that directly checks the king', () => {
  const fen = '4k3/8/8/8/8/8/8/K6R w - - 0 1'
  const findings = findTactics(fen)
  const check = findings.find((f) => f.type === 'check' && f.from === 'h1' && f.to === 'h8')
  assert.ok(check, 'expected a check finding for Rh1-h8')
})

test('discoveredCheck: moving a blocker uncovers a rook check (not a double check)', () => {
  const fen = 'k7/8/8/8/B7/8/8/R3K3 w - - 0 1'
  const findings = findTactics(fen)
  const found = findings.find((f) => f.type === 'discoveredCheck' && f.from === 'a4' && f.to === 'b5')
  assert.ok(found, 'expected a discoveredCheck finding for Ba4-b5')
  assert.ok(!found!.double)
})

test('discoveredCheck: a move that both checks directly and uncovers a rook check counts as double', () => {
  const fen = '4k3/8/8/8/4N3/8/8/K3R3 w - - 0 1'
  const findings = findTactics(fen)
  const found = findings.find((f) => f.type === 'discoveredCheck' && f.from === 'e4' && f.to === 'd6')
  assert.ok(found, 'expected a discoveredCheck finding for Ne4-d6')
  assert.ok(found!.double, 'expected the double flag to be set for a double check')
})

test('discoveredAttack: moving a blocker uncovers a rook attack on the queen (not a check)', () => {
  const fen = '4q2k/8/8/8/4B3/8/8/K3R3 w - - 0 1'
  const findings = findTactics(fen)
  const found = findings.find((f) => f.type === 'discoveredAttack' && f.from === 'e4' && f.to === 'd5')
  assert.ok(found, 'expected a discoveredAttack finding for Be4-d5')
  assert.deepEqual(found!.targets, ['e8'])
})

test('negative case: capturing into an equally defended square is not flagged as hanging', () => {
  const fen = '4k3/1b6/8/3n4/8/2N5/8/4K3 w - - 0 1'
  const findings = findTactics(fen)
  assert.ok(!findings.some((f) => f.to === 'd5'), 'Nxd5 trades knight for knight and should not be surfaced')
})
