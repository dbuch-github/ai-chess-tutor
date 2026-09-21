import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: 'inherit', windowsHide: true, ...options })
}

/** Run npm through node, avoiding Windows .cmd shell quoting. */
export function runNpm(args, options = {}) {
  let cli = process.env.npm_execpath
  if (!cli || !existsSync(cli)) {
    const npmPath = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['npm'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]
    cli = process.platform === 'win32' ? join(dirname(npmPath), 'node_modules', 'npm', 'bin', 'npm-cli.js') : realpathSync(npmPath)
  }
  run(process.execPath, [cli, ...args], options)
}
