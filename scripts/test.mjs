import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
const files = readdirSync('tests').filter(file => file.endsWith('.test.ts')).sort().map(file => `tests/${file}`)
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files, ...process.argv.slice(2)], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
