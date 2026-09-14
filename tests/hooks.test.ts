import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

test('React hook regressions in a real browser', { timeout: 30_000 }, async t => {
  const executablePath = process.env.CHROME_PATH ?? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'
  ].find(existsSync)
  if (!executablePath) { t.skip('Set CHROME_PATH to run the browser hook tests'); return }
  const bundle = await build({
    entryPoints: ['tests/hooks.browser.tsx'], bundle: true, write: false,
    format: 'iife', globalName: 'HookTests', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' }
  })
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setContent('<html><body></body></html>')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const passed = await page.evaluate(() => (window as any).HookTests.runHookTests())
    passed.forEach((name: string) => t.diagnostic(name))
    assert.deepEqual(errors, [])
    assert.equal(passed.length, 3)
  } finally { await browser.close() }
})
