import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { platformInfo } from '../src/shared/platform.mjs'
import { run, runNpm } from './process.mjs'
import { fetchEngines } from './fetch-engines.mjs'
import { verifyEngines } from './verify-engines.mjs'
const require = createRequire(import.meta.url)
const target = platformInfo()
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
await fetchEngines()
await verifyEngines()
runNpm(['run', 'build'])
const args = process.argv.slice(2)
if (args.some(arg => arg !== '--dir')) throw new Error('Supported option: --dir (unpacked native build). Cross builds are not supported by this setup.')
run(process.execPath, [require.resolve('electron-builder/cli.js'), target.builderFlag, `--${target.arch}`, '--publish', 'never', ...args])
