import { spawn } from 'node:child_process'
import process from 'node:process'

const tasks = [
  ['api', 'dev:backend'],
  ['web', 'dev:frontend'],
]

const children = tasks.map(([name, script]) => {
  const child = spawn('npm', ['run', script], {
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  pipe(child.stdout, name)
  pipe(child.stderr, name)
  child.on('exit', (code, signal) => {
    if (signal || shuttingDown) return
    if (code && code !== 0) {
      console.error(`[${name}] завершился с кодом ${code}`)
      stop(code)
    }
  })
  return child
})

let shuttingDown = false

function pipe(stream, name) {
  if (!stream) return
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.length > 0) console.log(`[${name}] ${line}`)
    }
  })
}

function stop(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        shell: true,
        stdio: 'ignore',
      })
    } else {
      child.kill('SIGTERM')
    }
  }
  setTimeout(() => process.exit(code), 300)
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
