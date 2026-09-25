import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { platformInfo } from '../src/shared/platform.mjs'
import { dirnameOf } from '../src/shared/paths'
import { engineCandidates, engineResourceDir, findEngine } from '../src/main/platform'
import { canPersistSecrets } from '../src/main/tutor/keyStorage'
import { download, sha256 } from '../scripts/fetch-engines.mjs'

test('the three native resource layouts match electron-builder packaging', () => {
  const config = JSON.parse(readFileSync('package.json', 'utf8')).build
  for (const [os, arch, builderOs] of [['darwin', 'arm64', 'mac'], ['win32', 'x64', 'win'], ['linux', 'x64', 'linux']]) {
    const target = platformInfo(os, arch)
    assert.equal(config.extraResources[0].from.replace('${os}', builderOs).replace('${arch}', arch), `resources/engines/${target.id}`)
    assert.ok(config[builderOs].target.every((entry: any) => entry.arch.includes(arch)))
  }
  assert.throws(() => platformInfo('win32', 'arm64'), /Unsupported platform/)
  assert.throws(() => platformInfo('linux', 'ia32'), /Unsupported platform/)
})

test('Windows engine discovery handles spaces, quoted PATH entries and executable extensions', () => {
  const candidates = engineCandidates('stockfish', 'C:\\Program Files\\Chess\\resources\\engines', 'win32', '"D:\\Chess Engines";C:\\Windows')
  assert.deepEqual(candidates, [
    'C:\\Program Files\\Chess\\resources\\engines\\stockfish.exe',
    'D:\\Chess Engines\\stockfish.exe', 'C:\\Windows\\stockfish.exe'
  ])
  assert.ok(engineCandidates('lc0', '/app/engines', 'linux', '').includes('/usr/games/lc0'))
  assert.deepEqual(engineCandidates('../unexpected', '/app/engines'), [])
})

test('development resources take precedence and packaged lookup stays outside app.asar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chess engine paths '))
  try {
    const binary = join(dir, 'stockfish' + platformInfo().suffix)
    writeFileSync(binary, 'fixture')
    assert.equal(findEngine('stockfish', dir), binary)
    assert.equal(engineResourceDir(false, '/unused', dir), join(dir, 'resources', 'engines', platformInfo().id))
    assert.equal(engineResourceDir(true, dir, '/unused'), join(dir, 'engines'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('directory selection preserves Windows drive roots, UNC paths and POSIX roots', () => {
  assert.equal(dirnameOf('C:\\lc0.exe'), 'C:\\')
  assert.equal(dirnameOf('C:\\Chess Engines\\lc0.exe'), 'C:\\Chess Engines')
  assert.equal(dirnameOf('\\\\server\\share\\lc0.exe'), '\\\\server\\share')
  assert.equal(dirnameOf('/lc0'), '/')
  assert.equal(dirnameOf('/opt/homebrew/bin/lc0'), '/opt/homebrew/bin')
  assert.equal(dirnameOf('lc0'), undefined)
})

test('Linux rejects plaintext key storage while retaining GNOME and KDE support', () => {
  for (const backend of ['basic_text', 'unknown']) {
    assert.equal(canPersistSecrets({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => backend }, 'linux'), false)
  }
  for (const backend of ['gnome_libsecret', 'kwallet5', 'kwallet6']) {
    assert.equal(canPersistSecrets({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => backend }, 'linux'), true)
  }
  assert.equal(canPersistSecrets({ isEncryptionAvailable: () => false, getSelectedStorageBackend: () => 'gnome_libsecret' }, 'linux'), false)
  for (const platform of ['darwin', 'win32'] as const) {
    assert.equal(canPersistSecrets({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => { throw new Error('Linux only') } }, platform), true)
  }
})

test('CHESS_TUTOR_NO_SAFE_STORAGE opts out before the OS key store is touched', () => {
  const exploding = {
    isEncryptionAvailable: (): boolean => { throw new Error('keychain prompt') },
    getSelectedStorageBackend: (): string => { throw new Error('keychain prompt') }
  }
  for (const platform of ['darwin', 'win32', 'linux'] as const) {
    assert.equal(canPersistSecrets(exploding, platform, { CHESS_TUTOR_NO_SAFE_STORAGE: '1' }), false)
  }
  const working = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'gnome_libsecret' }
  for (const env of [{}, { CHESS_TUTOR_NO_SAFE_STORAGE: '' }, { CHESS_TUTOR_NO_SAFE_STORAGE: '0' }]) {
    assert.equal(canPersistSecrets(working, 'darwin', env), true)
  }
})

test('an invalid download never replaces a previously working file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chess-download-'))
  const dest = join(dir, 'engine')
  try {
    writeFileSync(dest, 'working')
    await assert.rejects(download('data:text/plain,broken', dest, sha256('expected')), /SHA-256 mismatch/)
    assert.equal(readFileSync(dest, 'utf8'), 'working')
    assert.equal(existsSync(dest + '.part'), false)
    await download('data:text/plain,new', dest, sha256('new'))
    assert.equal(readFileSync(dest, 'utf8'), 'new')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
