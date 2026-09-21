import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { build } from 'esbuild'

// Exercise the real handler without accessing a Bluetooth adapter or user session.
const bundle = await build({
  entryPoints: ['src/main/bluetooth.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', packages: 'external'
})
function fixture(platform: string) {
  const ipcMain = new EventEmitter()
  const module = { exports: {} as any }
  const actualRequire = createRequire(import.meta.url)
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    (id: string) => id === 'electron' ? { ipcMain } : actualRequire(id), module, module.exports)
  let handler: any = null
  const messages: any[] = []
  let destroyed = false
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => destroyed,
    webContents: {
      session: { setBluetoothPairingHandler: (callback: any) => { handler = callback } },
      send: (channel: string, request: any) => { messages.push({ channel, request }) }
    }
  })
  module.exports.installBluetoothPairing(window, platform)
  return {
    ipcMain, window, messages,
    request: (kind: string, callback: any) => handler({ deviceId: 'Chessnut-test', pairingKind: kind, pin: '123456' }, callback),
    respond: (id: number, response: any, sender = window.webContents) =>
      ipcMain.emit('bluetooth:pairing-response', { sender }, id, response),
    close: () => { destroyed = true; window.emit('closed') },
    handler: () => handler
  }
}

for (const platform of ['win32', 'linux']) {
  test(`${platform} pairing accepts only the active window and request, then settles once`, () => {
    const f = fixture(platform)
    const replies: any[] = []
    try {
      f.request('providePin', (response: any) => replies.push(response))
      const { id, kind } = f.messages.at(-1).request
      assert.equal(kind, 'providePin')
      f.respond(id + 1, { confirmed: true })
      f.respond(id, { confirmed: true }, {} as any)
      f.respond(id, null)
      assert.deepEqual(replies, [])
      f.respond(id, { confirmed: true, pin: '123456' })
      f.respond(id, { confirmed: false })
      assert.deepEqual(replies, [{ confirmed: true, pin: '123456' }])
      assert.equal(f.messages.at(-1).request, null)
    } finally { f.close() }
    assert.equal(f.ipcMain.listenerCount('bluetooth:pairing-response'), 0)
    assert.equal(f.handler(), null)
  })
}

test('a superseded pairing request and window close cancel pending callbacks', () => {
  const f = fixture('linux')
  const replies: any[] = []
  try {
    f.request('confirm', (response: any) => replies.push(['old', response]))
    const oldId = f.messages.at(-1).request.id
    f.request('confirmPin', (response: any) => replies.push(['new', response]))
    f.respond(oldId, { confirmed: true })
    assert.deepEqual(replies, [['old', { confirmed: false }]])
  } finally { f.close() }
  assert.deepEqual(replies, [['old', { confirmed: false }], ['new', { confirmed: false }]])
})

test('unanswered pairing times out and macOS retains native pairing', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture('win32')
  const replies: any[] = []
  try {
    f.request('confirm', (response: any) => replies.push(response))
    t.mock.timers.tick(120_000)
    assert.deepEqual(replies, [{ confirmed: false }])
    assert.equal(f.messages.at(-1).request, null)
  } finally { f.close() }
  const mac = fixture('darwin')
  assert.equal(mac.handler(), null)
  assert.equal(mac.ipcMain.listenerCount('bluetooth:pairing-response'), 0)
  mac.close()
})
