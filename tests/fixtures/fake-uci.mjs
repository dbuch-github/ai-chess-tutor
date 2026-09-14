#!/usr/bin/env node
import readline from 'node:readline'
let timer
let ignoreStop = false
const answer = () => { clearTimeout(timer); timer = undefined; console.log('bestmove e2e4') }
readline.createInterface({ input: process.stdin }).on('line', line => {
  if (line === 'uci') console.log('id name Test Engine\nuciok')
  if (line === 'isready') console.log('readyok')
  if (line === 'setoption name IgnoreStop value true') ignoreStop = true
  if (line.startsWith('go movetime ')) timer = setTimeout(answer, Number(line.split(' ')[2]))
  if (line.startsWith('go nodes ')) timer = setTimeout(answer, 5)
  if (line === 'stop' && !ignoreStop) answer()
  if (line === 'quit') process.exit(0)
})
