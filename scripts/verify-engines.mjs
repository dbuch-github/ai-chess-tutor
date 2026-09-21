import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platformInfo } from '../src/shared/platform.mjs'

export function probeEngine(binary, weights) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let buffer = '', errors = '', finished = false
    const finish = error => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      child.kill()
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => finish(new Error(`Engine probe timeout: ${binary}\n${errors}`)), 60_000)
    child.on('error', finish)
    child.on('exit', code => { if (!finished) finish(new Error(`Engine exited (${code}): ${binary}\n${errors}`)) })
    child.stdin.on('error', finish)
    child.stderr.on('data', data => { errors = (errors + data).slice(-4000) })
    child.stdout.on('data', data => {
      buffer += data.toString()
      let newline
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line === 'uciok') {
          if (weights) child.stdin.write(`setoption name WeightsFile value ${weights}\n`)
          child.stdin.write('isready\n')
        } else if (line === 'readyok') {
          child.stdin.write(`position startpos\n${weights ? 'go nodes 1' : 'go movetime 20'}\n`)
        } else if (/^bestmove [a-h][1-8][a-h][1-8][qrbn]?\b/.test(line)) finish()
      }
    })
    child.stdin.write('uci\n')
  })
}

export async function verifyEngines(resourceDir) {
  const target = platformInfo()
  const dir = resourceDir ?? fileURLToPath(new URL(`../resources/engines/${target.id}/`, import.meta.url))
  await probeEngine(join(dir, 'stockfish' + target.suffix))
  await probeEngine(join(dir, 'lc0' + target.suffix), join(dir, 'maia', 'maia-1200.pb.gz'))
  console.log('Stockfish and Maia/lc0 returned legal-format moves.')
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyEngines(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1 })
}
