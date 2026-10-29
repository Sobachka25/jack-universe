// Боты-игроки: node scripts/bot.mjs <КОД_КОМНАТЫ> [кол-во=1] [url=http://localhost:3000]
import { createRequire } from 'module'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { io } = require('socket.io-client')

const [code, countArg = '1', url = 'http://localhost:3000'] = process.argv.slice(2)
if (!code) {
  console.log('usage: node scripts/bot.mjs <ROOM_CODE> [count] [url]')
  process.exit(1)
}
const NAMES = ['Бот Валера', 'Бот Зинаида', 'Бот Геннадий', 'Бот Клава', 'Бот Аркадий', 'Бот Люся']
const rand = (n) => Math.floor(Math.random() * n)
const later = (min, max, fn) => setTimeout(fn, min + Math.random() * (max - min))

function bot(index) {
  const name = NAMES[index % NAMES.length] + (index >= NAMES.length ? ` ${index}` : '')
  const socket = io(url, { transports: ['websocket'] })
  const done = new Set()
  let me = null
  const log = (...a) => console.log(`[${name}]`, ...a)
  const send = (key, input) => {
    if (done.has(key)) return
    done.add(key)
    socket.emit('game:input', input, (ack) => log('ход', JSON.stringify(input), ack?.ok ? 'ok' : ack?.message))
  }

  socket.on('connect', () => {
    socket.emit('room:join', { code, name }, (ack) => {
      if (!ack?.ok) return log('не зашёл:', ack?.message)
      me = ack.playerId
      log('зашёл в комнату', code)
    })
  })
  socket.on('room:state', (snap) => {
    const stage = snap.show?.stage
    if (stage && (stage.kind === 'trivia' || stage.kind === 'finale') && !stage.locked?.includes(me)) {
      const key = `q:${stage.prompt}`
      if (!done.has(key)) later(1500, 5000, () => send(key, { choice: rand(stage.options.length) }))
    }
    const act = stage?.kind === 'punishment' ? stage.activity : snap.activity
    if (act?.status === 'play' && !act.locked?.includes(me)) {
      const key = `a:${act.gameId}:${act.endsAt}`
      if (act.options) later(1000, 4000, () => send(key, { choice: rand(act.options.length) }))
      else if (act.gameId === 'alert-repeat') {
        const wait = Math.max(0, act.revealUntil - act.serverNow) + 800
        setTimeout(() => send(key, { sequence: act.sequence?.length ? act.sequence : [] }), wait)
      } else if (act.gameId === 'server-balance') {
        const tick = `${key}:${Math.floor(Date.now() / 700)}`
        send(tick, { hold: ['left', 'right', 'none'][rand(3)] })
      } else later(800, 3000, () => send(key, {}))
    }
  })
  socket.on('room:closed', () => { log('комната закрыта'); socket.close() })
  socket.on('room:displaced', (m) => log('выкинули:', m?.message))
  socket.on('connect_error', (e) => log('нет связи:', e.message))
}

for (let i = 0; i < Number(countArg); i++) bot(i)