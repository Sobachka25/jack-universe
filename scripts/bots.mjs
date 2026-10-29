import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { inflateRawSync } from 'node:zlib'

const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { io } = require('socket.io-client')

const code = (process.argv[2] ?? '').trim().toUpperCase()
if (code.length !== 4) {
  console.error('Нужен код комнаты: node scripts/bots.mjs ABCD')
  process.exit(1)
}

const bank = loadQuestions()
const profiles = [
  { name: 'Марк', trivia: 0.9, pager: 2, slop: 2, lag: 0 },
  { name: 'Соня', trivia: 0.55, pager: 98, slop: 8, lag: 90 },
]

for (const profile of profiles) connectBot(profile)

function connectBot(profile) {
  const socket = io('http://localhost:3000', { transports: ['websocket'] })
  const bot = {
    ...profile,
    socket,
    playerId: '',
    triviaKey: '',
    finaleKey: '',
    punishKey: '',
    hauntKey: '',
    hold: '',
    timers: [],
  }

  socket.on('connect', () => {
    socket.emit('room:join', { code, name: profile.name }, (response) => {
      if (!response?.ok) {
        console.error(`[${profile.name}] ${response?.message ?? 'не зашёл'}`)
        return
      }
      bot.playerId = response.playerId
      console.log(`[${profile.name}] в комнате ${code}`)
      play(bot, response.snapshot)
    })
  })

  socket.on('room:state', (snapshot) => {
    if (snapshot?.code === code) play(bot, snapshot)
  })

  socket.on('disconnect', () => {
    console.log(`[${profile.name}] связь пропала`)
  })
}

function play(bot, snapshot) {
  const show = snapshot?.show
  if (!show || show.paused) return
  const seat = show.seats?.find((item) => item.playerId === bot.playerId)
  if (!seat) return
  const stage = show.stage

  if (stage.kind === 'trivia' && seat.role === 'living') {
    answerQuestion(bot, stage, 'triviaKey')
    return
  }
  if (stage.kind === 'finale') {
    answerQuestion(bot, stage, 'finaleKey')
    return
  }
  if (stage.kind !== 'punishment' || stage.activity?.status !== 'play') {
    stopBalance(bot)
    return
  }

  const activity = stage.activity
  const key = `${activity.gameId}:${activity.endsAt ?? activity.revealUntil ?? 0}`
  if (seat.role === 'ghost') {
    stopBalance(bot)
    haunt(bot, show, key)
    return
  }
  if (seat.role !== 'awaiting') {
    stopBalance(bot)
    return
  }
  if (activity.gameId === 'server-balance') {
    balance(bot, activity)
    return
  }
  stopBalance(bot)
  if (bot.punishKey === key) return
  bot.punishKey = key
  clearTimers(bot)

  if (activity.gameId === 'friday-release') tapRelease(bot, activity)
  else if (activity.gameId === 'night-pager') later(bot, 700, () => send(bot, { choice: bot.pager }))
  else if (activity.gameId === 'red-button') pressRed(bot, activity)
  else if (activity.gameId === 'alert-repeat') repeatAlerts(bot, activity)
}

function answerQuestion(bot, stage, field) {
  const key = `${stage.kind}:${stage.prompt}`
  if (bot[field] === key) return
  if (stage.locked?.includes(bot.playerId)) {
    bot[field] = key
    return
  }
  const known = bank.find((question) => question.prompt === stage.prompt)
  const correctIndex = known ? stage.options.indexOf(known.correct) : -1
  const miss = correctIndex < 0 || Math.random() > bot.trivia
  const wrong = stage.options.map((_, index) => index).filter((index) => index !== correctIndex)
  const choice = miss ? wrong[Math.floor(Math.random() * wrong.length)] : correctIndex
  if (choice === undefined) return
  bot[field] = key
  const wait = 1200 + Math.floor(Math.random() * 3500)
  later(bot, wait, () => {
    send(bot, { choice })
    console.log(`[${bot.name}] ответ ${stage.options[choice] ?? choice}`)
  })
}

function balance(bot, activity) {
  const rack = activity.racks?.find((item) => item.playerId === bot.playerId)
  if (!rack?.alive) {
    if (bot.hold !== 'none') {
      bot.hold = 'none'
      send(bot, { hold: 'none' })
    }
    return
  }
  const lean = rack.angle + (activity.wind ?? 0) * (rack.heavy ? 14 : 8)
  const hold = lean > bot.slop ? 'left' : lean < -bot.slop ? 'right' : 'none'
  if (hold === bot.hold) return
  bot.hold = hold
  send(bot, { hold })
}

function stopBalance(bot) {
  if (!bot.hold) return
  bot.hold = ''
  send(bot, { hold: 'none' })
}

function tapRelease(bot, activity) {
  const skew = activity.serverNow - Date.now()
  const period = activity.periodMs
  const position = () => {
    const elapsed = Math.max(0, Date.now() + skew - activity.startedAt)
    return (elapsed % period) / period
  }
  const waitFraction = () => {
    const delta = activity.greenCenter - position()
    return delta > 0.04 ? delta : delta + 1
  }
  later(bot, waitFraction() * period + bot.lag, () => send(bot, {}))
}

function pressRed(bot, activity) {
  const open = activity.options
    .map((_, index) => index)
    .filter((index) => index !== activity.sealedIndex)
  const choice = open[Math.floor(Math.random() * open.length)]
  if (choice === undefined) return
  later(bot, 600 + Math.floor(Math.random() * 2000), () => send(bot, { choice }))
}

function repeatAlerts(bot, activity) {
  if (activity.sequence?.length === 4) bot.alertMemory = activity.sequence.slice()
  const skew = activity.serverNow - Date.now()
  const wait = Math.max(300, activity.revealUntil - (Date.now() + skew) + 400)
  later(bot, wait, () => {
    if (bot.alertMemory?.length === 4) send(bot, { sequence: bot.alertMemory })
  })
}

function haunt(bot, show, key) {
  if (bot.hauntKey === key) return
  const targets = show.seats.filter((seat) => seat.role === 'awaiting')
  const target = targets[Math.floor(Math.random() * targets.length)]
  if (!target) return
  bot.hauntKey = key
  later(bot, 900, () => {
    send(bot, { hauntTargetId: target.playerId })
    console.log(`[${bot.name}] подложил ${target.name}`)
  })
}

function later(bot, ms, action) {
  const timer = setTimeout(action, ms)
  bot.timers.push(timer)
}

function clearTimers(bot) {
  for (const timer of bot.timers) clearTimeout(timer)
  bot.timers = []
}

function send(bot, input) {
  bot.socket.emit('game:input', input, (response) => {
    if (response && response.ok === false) {
      console.log(`[${bot.name}] ${response.message}`)
    }
  })
}

function loadQuestions() {
  const file = [resolve('вопросы.xlsx'), resolve('..', 'вопросы.xlsx')].find((path) =>
    existsSync(path),
  )
  if (!file) return []
  const parts = unzip(readFileSync(file))
  const shared = parts.get('xl/sharedStrings.xml')
  const sheet = parts.get('xl/worksheets/sheet1.xml')
  if (!shared || !sheet) return []
  const strings = [...shared.toString('utf8').matchAll(/<si\b[\s\S]*?<\/si>/g)].map((item) =>
    [...item[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((match) => decodeXml(match[1] ?? ''))
      .join(''),
  )
  const rows = new Map()
  const cells = sheet.toString('utf8').match(/<c\b[^>]*r="([A-Z]+)(\d+)"[^>]*>[\s\S]*?<\/c>/g) ?? []
  for (const cell of cells) {
    const ref = /r="([A-Z]+)(\d+)"/.exec(cell)
    if (!ref) continue
    const type = /t="([^"]+)"/.exec(cell)?.[1]
    const raw = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] ?? ''
    const value = type === 's' ? (strings[Number(raw)] ?? '') : decodeXml(raw)
    const row = rows.get(Number(ref[2])) ?? {}
    row[ref[1]] = value
    rows.set(Number(ref[2]), row)
  }
  return [...rows.values()]
    .slice(1)
    .flatMap((row) => {
      const prompt = row.A?.trim() ?? ''
      const correct = row.B?.trim() ?? ''
      if (!prompt || !correct) return []
      return [{ prompt, correct }]
    })
}

function decodeXml(value) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function unzip(file) {
  const parts = new Map()
  let offset = 0
  while (offset + 30 <= file.length) {
    if (file.readUInt32LE(offset) !== 0x04034b50) break
    const method = file.readUInt16LE(offset + 8)
    const compressedSize = file.readUInt32LE(offset + 18)
    const nameLength = file.readUInt16LE(offset + 26)
    const extraLength = file.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const name = file.subarray(nameStart, nameStart + nameLength).toString('utf8')
    const dataStart = nameStart + nameLength + extraLength
    const data = file.subarray(dataStart, dataStart + compressedSize)
    parts.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data))
    offset = dataStart + compressedSize
  }
  return parts
}
