#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { platformInfo } from '../src/shared/platform.mjs'
import { run, runNpm } from './process.mjs'

const target = platformInfo()
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 12)) throw new Error('Node.js 22.12 or newer is required.')
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
console.log(`Setting up AI Chess Tutor (${target.id})`)
if (target.platform === 'win32') {
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'setup-windows.ps1', '-RuntimeOnly'])
}
runNpm(['ci'])
const { fetchEngines } = await import('./fetch-engines.mjs')
await fetchEngines()
const { verifyEngines } = await import('./verify-engines.mjs')
await verifyEngines()
console.log('Setup complete. Start with: npm run dev')
