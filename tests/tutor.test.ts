import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import type { SendParams } from '../src/main/tutor/providers/types'

// Load the real service without an Electron process or access to user config.
const bundle = await build({
  entryPoints: ['src/main/tutor/TutorService.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'test-electron', setup(b) {
    b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test' }))
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents:
      'export const app = {getPath: () => "/nonexistent-chess-tutor-test"}; export const safeStorage = testStorage;'
    }))
  } }]
})
const module = { exports: {} as any }
const testStorage = {
  enabled: true,
  isEncryptionAvailable: () => testStorage.enabled,
  getSelectedStorageBackend: () => 'gnome_libsecret',
  encryptString: (value: string) => Buffer.from('encrypted:' + value),
  decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, '')
}
let storedConfig: string | undefined
const actualRequire = createRequire(import.meta.url)
const mockRequire = (id: string) => id === 'node:fs' ? {
  readFileSync: () => { if (!storedConfig) throw new Error('No config'); return storedConfig },
  writeFileSync: (_path: string, data: string) => { storedConfig = data }
} : actualRequire(id)
new Function('require', 'module', 'exports', 'testStorage', bundle.outputFiles[0].text)(mockRequire, module, module.exports, testStorage)

for (const fails of [false, true]) {
  test(`reset isolates a new game from a late tutor ${fails ? 'failure' : 'answer'}`, async () => {
    const service = new module.exports.TutorService()
    const calls: SendParams[] = []
    let resolve!: (text: string) => void
    let reject!: (error: Error) => void
    service.providers = { anthropic: {
      isConfigured: () => true,
      send: (params: SendParams) => {
        calls.push({ ...params, history: [...params.history] })
        if (calls.length > 1) return Promise.resolve('Fresh answer')
        return new Promise<string>((yes, no) => { resolve = yes; reject = no })
      },
      describeError: (error: Error) => error.message
    } }
    service.activeProvider = 'anthropic'
    const request = { kind: 'question', locale: 'de', question: 'Old question',
      fen: 'old', turn: 'w', playerColor: 'w', evalNow: '0', linesSan: [], historySan: '' }
    const deltas: string[] = []
    const pending = service.send(request, (delta: string) => deltas.push(delta))
    service.reset()
    calls[0].onDelta('Stale delta')
    if (fails) reject(new Error('Old request failed'))
    else resolve('Old answer')
    await pending
    await service.send({ ...request, question: 'New question', fen: 'new' }, () => {})
    assert.deepEqual(deltas, [])
    assert.equal(calls[1].history.length, 1)
    assert.equal(calls[1].history[0].role, 'user')
    assert.match(calls[1].history[0].text, /New question/)
    assert.doesNotMatch(calls[1].history[0].text, /Old question|Old answer/)
  })
}


test('session-only keys work in memory but replace stale persisted keys without storing plaintext', () => {
  testStorage.enabled = false
  storedConfig = JSON.stringify({ provider: 'anthropic', models: {}, encryptedKeys: { anthropic: 'old' } })
  const service = new module.exports.TutorService()
  let currentKey = ''
  service.providers.anthropic = {
    configure: (key: string) => { currentKey = key },
    clearClient: () => { currentKey = '' },
    isConfigured: () => !!currentKey
  }
  const status = service.configure('anthropic', 'test-model', 'session-secret')
  assert.equal(status.keyPersistence, 'session-only')
  assert.equal(status.hasApiKey, true)
  assert.equal(currentKey, 'session-secret')
  assert.doesNotMatch(storedConfig!, /session-secret/)
  assert.equal(JSON.parse(storedConfig!).encryptedKeys.anthropic, undefined)
  service.configure('anthropic', 'test-model', '')
  assert.equal(currentKey, '')
  testStorage.enabled = true
  storedConfig = undefined
})
