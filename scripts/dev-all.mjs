// `npm run dev:all` — start the API server and the Vite dev server together.
//
// The site needs both: Vite serves frontend/ on 5173 and proxies /api to the
// Express server in backend/server on 8787 (see vite.config.js), so running
// Vite alone leaves every payment, chat and tracking call answering
// ECONNREFUSED.
//
// Deliberately dependency-free — no concurrently/npm-run-all — because this is
// a two-process convenience, not worth a package. Output is prefixed per
// process, and either one exiting takes the other down so you are never left
// with a half-running stack that looks fine until a request fails.
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const PROCESSES = [
  { name: 'api ', color: '\x1b[36m', cwd: join(root, 'backend', 'server'), args: ['index.js'] },
  { name: 'site', color: '\x1b[35m', cwd: root, args: [join(root, 'node_modules', 'vite', 'bin', 'vite.js')] },
]

const RESET = '\x1b[0m'
const children = []
let shuttingDown = false

function shutdown(reason) {
  if (shuttingDown) return
  shuttingDown = true
  if (reason) console.log('\n' + reason + ' — stopping both.')
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

for (const { name, color, cwd, args } of PROCESSES) {
  // Same Node that runs this script, so there is no dependence on npm or a
  // shell being on PATH — and no shell:true, which would leave the child
  // running detached when we try to kill it on Windows.
  const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)

  const prefix = color + '[' + name + ']' + RESET + ' '
  const write = (stream) => (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.trim()) stream.write(prefix + line + '\n')
    }
  }
  child.stdout.on('data', write(process.stdout))
  child.stderr.on('data', write(process.stderr))

  child.on('exit', (code) => shutdown('[' + name.trim() + '] exited with code ' + code))
  child.on('error', (err) => shutdown('[' + name.trim() + '] failed to start: ' + err.message))
}

process.on('SIGINT', () => shutdown())
process.on('SIGTERM', () => shutdown())
