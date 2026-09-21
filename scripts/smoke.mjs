import { _electron } from 'playwright-core'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { platformInfo } from '../src/shared/platform.mjs'
const root = fileURLToPath(new URL('..', import.meta.url))
const target = platformInfo()
const packaged = process.argv.includes('--packaged')
const executable = {
  'mac-arm64': 'dist/mac-arm64/AI Chess Tutor.app/Contents/MacOS/AI Chess Tutor',
  'win-x64': 'dist/win-unpacked/AI Chess Tutor.exe',
  'linux-x64': 'dist/linux-unpacked/ai-chess-tutor'
}[target.id]
const profile = mkdtempSync(join(tmpdir(), 'chess-smoke-'))
const errors = []
let app
try {
  app = await _electron.launch({
    executablePath: packaged ? (process.env.CHESS_SMOKE_EXECUTABLE || join(root, executable)) : createRequire(import.meta.url)('electron'),
    args: packaged ? [] : [join(root, 'out/main/index.js')],
    env: { ...process.env, AI_CHESS_TUTOR_USER_DATA: profile, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '' },
    timeout: 30_000
  })
  // Attach the pageerror listener via the 'window' event (fired the moment the
  // window is available) rather than only after `await app.firstWindow()`
  // resolves and returns control here – that extra tick left a gap where a
  // renderer error thrown right at startup could be missed. `once` + the
  // idempotent guard means whichever path resolves first (the event or the
  // promise) wins; the other becomes a no-op.
  let page
  let listenerAttached = false
  const attachErrorListener = p => {
    if (listenerAttached) return
    listenerAttached = true
    page = p
    p.on('pageerror', error => errors.push(error.message))
  }
  app.once('window', attachErrorListener)
  attachErrorListener(await app.firstWindow())
  await page.waitForSelector('.app')
  await page.waitForSelector('.engine-dot.ok', { timeout: 30_000 })
  const welcome = page.locator('.info-dialog')
  if (await welcome.isVisible()) await welcome.locator('.dialog-actions button').last().click()
  const paths = await page.evaluate(async () => ({
    stockfish: await window.api.getDefaultEnginePath('stockfish'),
    lc0: await window.api.getDefaultEnginePath('lc0'),
    weights: await window.api.getDefaultMaiaWeightsPath(1200)
  }))
  for (const path of Object.values(paths)) assert.ok(path && existsSync(path), `Engine resource missing: ${path}`)
  assert.equal(await page.locator('cg-board piece').count(), 32)
  if (process.env.CHESS_SMOKE_SCREENSHOT) await page.screenshot({ path: process.env.CHESS_SMOKE_SCREENSHOT })
  // Verify renderer/preload pairing flows on every host without radio hardware.
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    globalThis.smokePairingResponses = []
    ipcMain.on('bluetooth:pairing-response', (_event, id, response) => {
      globalThis.smokePairingResponses.push({ id, response })
    })
    BrowserWindow.getAllWindows()[0].webContents.send('bluetooth:pairing-request', {
      id: -1, kind: 'confirmPin', deviceId: 'Chessnut smoke test', pin: '123456'
    })
  })
  const pairing = page.locator('form.dialog')
  await pairing.waitFor()
  assert.match(await pairing.innerText(), /123456/)
  if (process.env.CHESS_SMOKE_SCREENSHOT) await page.screenshot({ path: process.env.CHESS_SMOKE_SCREENSHOT.replace(/\.png$/, '-pairing.png') })
  await pairing.locator('button[type="button"]').click()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('bluetooth:pairing-request', {
      id: -2, kind: 'providePin', deviceId: 'Chessnut smoke test'
    })
  })
  await pairing.waitFor()
  assert.equal(await pairing.locator('button[type="submit"]').isDisabled(), true)
  await pairing.locator('input').fill('654321')
  if (process.env.CHESS_SMOKE_SCREENSHOT) await page.screenshot({ path: process.env.CHESS_SMOKE_SCREENSHOT.replace(/\.png$/, '-pin.png') })
  await pairing.locator('button[type="submit"]').click()
  await pairing.waitFor({ state: 'detached' })
  assert.deepEqual(await app.evaluate(() => globalThis.smokePairingResponses), [
    { id: -1, response: { confirmed: false } },
    { id: -2, response: { confirmed: true, pin: '654321' } }
  ])
  assert.deepEqual(errors, [])
  console.log(`Electron ${packaged ? 'packaged' : 'build'} smoke test passed (${target.id}).`)
} finally {
  if (app) await app.close()
  rmSync(profile, { recursive: true, force: true })
}
