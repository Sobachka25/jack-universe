import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { playLine, playScream, playVoice, playVoiceLine, stopVoice } from '../roomMusic'
import { PartyPhone, PartyScreen } from './PartyStage'
import { PlayerAvatar } from './PlayerAvatar'
import type { GameInput, ScoreSeat, ShowFail, ShowSnapshot } from '../types'

const HURRY_MS = 5500
const GHOSTS_LINE = 'other_ghosts_can_still_win.mp3'

export function ShowScreen({ show, hold = false }: { show: ShowSnapshot; hold?: boolean }) {
  const stage = show.stage
  const paused = show.paused || hold
  const exitAt = 'exitAt' in stage ? stage.exitAt : null
  const seats = useLaneMarch(show.seats, stage)
  const flying = exitAt !== null
  const voiceFile =
    stage.kind === 'trivia' || stage.kind === 'finale' ? stage.audio : null
  const voiceKey =
    stage.kind === 'trivia' || stage.kind === 'finale' ? `${stage.kind}:${stage.prompt}` : null

  const introFile = stage.kind === 'finale' ? stage.intro : null
  useEffect(() => {
    // the final intro plays first and fully; the question voice queues behind it
    if (introFile && voiceKey) playVoiceLine('other', introFile, `intro:${voiceKey}`, true)
    if (voiceFile && voiceKey) playVoice(voiceFile, voiceKey)
    else if (voiceKey) stopVoice()
  }, [voiceFile, voiceKey, introFile])

  const hurryAt =
    (stage.kind === 'trivia' || stage.kind === 'finale') && !paused
      ? stage.endsAt - stage.serverNow - HURRY_MS
      : null
  useEffect(() => {
    if (hurryAt === null || !voiceKey || hurryAt < 0) return
    const timer = window.setTimeout(() => playLine('countdown', `hurry:${voiceKey}`), hurryAt)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceKey, paused])

  // the server picks the host line and reveals the answer once it has been said
  const answerLine =
    (stage.kind === 'trivia-result' || stage.kind === 'finale-step') && stage.answerLine ? stage.answerLine : null
  const revealKey = answerLine && 'options' in stage ? `answer:${answerLine}:${stage.options.join('|')}` : null
  useEffect(() => {
    if (answerLine && revealKey) playVoiceLine('answer', answerLine, revealKey)
  }, [answerLine, revealKey])

  const briefAudio = stage.kind === 'briefing' ? stage.audio : null
  const briefKey = stage.kind === 'briefing' ? `briefing:${stage.title}:${stage.endsAt}` : null
  useEffect(() => {
    if (briefAudio && briefKey) playVoiceLine('briefing', briefAudio, briefKey)
  }, [briefAudio, briefKey])

  const introAudio = stage.kind === 'intro' ? stage.audio : null
  const introKey = stage.kind === 'intro' ? `quiz-intro:${stage.endsAt}` : null
  useEffect(() => {
    if (introAudio && introKey) playVoiceLine('intro', introAudio, introKey, true)
  }, [introAudio, introKey])

  const deathKey =
    stage.kind === 'punishment-result' && stage.failed.length > 0 && stage.announce
      ? `ghosts:${stage.failed.map((fail) => fail.playerId).join('|')}`
      : null
  useEffect(() => {
    if (deathKey) playLine('other', deathKey, GHOSTS_LINE, true)
  }, [deathKey])

  if (stage.kind === 'done') {
    return (
      <Credits seats={show.seats} winnerId={stage.winnerId} />
    )
  }

  if (stage.kind === 'punishment-result' && stage.failed.length > 0) {
    return <DeathScreen failed={stage.failed} paused={paused} />
  }

  return (
    <section className={`show${stageBackdrop(stage.kind)}${paused ? ' held' : ''}`}>
      {flying ? <Flight seats={seats} exitAt={exitAt} /> : <Cast seats={seats} />}
      {(stage.kind === 'finale' || stage.kind === 'finale-step') && exitAt !== null ? (
        <FinaleCard stage={stage} seats={seats} exitAt={exitAt} paused={paused} />
      ) : (
      <>
      <div className="show-prompt">
        <div className="show-prompt-inner">
          <p className="eyebrow">{roundLabel(show)}</p>
          {stage.kind === 'punishment' ? (
            <PartyScreen activity={stage.activity} bare paused={paused} />
          ) : stage.kind === 'briefing' ? (
            <ExplainBoard
              title={stage.title}
              text={stage.text}
              endsAt={stage.endsAt}
              serverNow={stage.serverNow}
              paused={paused}
              lineId={show.line.id}
              hideClock
            />
          ) : stage.kind === 'countdown' ? (
            <p className="question-copy" data-line={show.line.id}>
              {stage.title}
            </p>
          ) : stage.kind === 'intro' ? null : stage.kind === 'trivia' || stage.kind === 'finale' ? (
            <p key={stage.prompt} className="question-copy arrive" data-line={show.line.id}>
              {stage.prompt}
            </p>
          ) : null /* host comments are voiced only, no captions on the big screen */}
        </div>
      </div>
      <Clock
        endsAt={clockEnds(stage)}
        serverNow={clockNow(stage)}
        startsAt={stage.kind === 'trivia' || stage.kind === 'finale' ? stage.readUntil : null}
        paused={paused}
        keepOne={stage.kind === 'countdown'}
      />
      <div className="show-answers">
        {stage.kind === 'trivia' || stage.kind === 'finale' ? (
          <div key={stage.prompt} className="option-grid arrive">
            {stage.options.map((option, index) => (
              <p key={index} className="option-card">
                {option}
              </p>
            ))}
          </div>
        ) : stage.kind === 'trivia-result' || stage.kind === 'finale-step' ? (
          <div className="option-grid">
            {stage.options.map((option) => (
              <p key={option} className={
                  stage.correct === null ? 'option-card' : option === stage.correct ? 'option-card right' : 'option-card wrong'
                }>
                {option}
              </p>
            ))}
          </div>
        ) : stage.kind === 'punishment-result' ? (
          <ResultChips stage={stage} />
        ) : null}
      </div>
      </>
      )}
    </section>
  )
}

export function ShowPhone({
  show,
  playerId,
  onInput,
}: {
  show: ShowSnapshot
  playerId: string
  onInput: (input: GameInput) => void
}) {
  const seats = useLaneMarch(show.seats, show.stage)
  const seat = seats.find((item) => item.playerId === playerId)
  const stage = show.stage
  const answering =
    (stage.kind === 'trivia' && (seat?.role === 'living' || seat?.role === 'ghost')) ||
    (stage.kind === 'finale' && seat !== undefined)
  const hit =
    (stage.kind === 'trivia-result' || stage.kind === 'finale-step') &&
    stage.gained.find((item) => item.playerId === playerId)
  const miss = missCaption(stage, playerId, seat?.role)
  const targets = show.seats
    .filter((item) => item.role === 'awaiting')
    .map((item) => ({ id: item.playerId, name: item.name }))
  const minigame =
    stage.kind === 'punishment' &&
    stage.activity.status === 'play' &&
    Boolean(seat && (seat.role === 'awaiting' || seat.role === 'ghost'))

  if (minigame && stage.kind === 'punishment' && seat) {
    return (
      <PartyPhone
        activity={stage.activity}
        playerId={playerId}
        onHh={seat.role === 'ghost'}
        targets={targets}
        paused={show.paused}
        bare
        onInput={onInput}
      />
    )
  }

  return (
    <section className={show.paused ? 'panel player-card held' : 'panel player-card'}>
      {show.paused ? <p className="pause-banner">Пауза</p> : null}
      <div className="me-avatar">
        <PlayerAvatar id={playerId} ghost={Boolean(seat?.ghost)} size={96} />
      </div>
      <p className="eyebrow">{seat ? `${seat.score} очков` : 'Зритель'}</p>
      {stage.kind === 'briefing' ? (
        <ExplainBoard
          title={stage.title}
          text={stage.text}
          endsAt={stage.endsAt}
          serverNow={stage.serverNow}
          paused={show.paused}
          lineId={show.line.id}
        />
      ) : stage.kind === 'countdown' ? (
        <CountdownBoard
          title={stage.title}
          endsAt={stage.endsAt}
          serverNow={stage.serverNow}
          paused={show.paused}
          lineId={show.line.id}
        />
      ) : (
        <>
          {hit ? (
            <p className="phone-hit">
              <b>Верно</b>
              <span>{stage.kind === 'finale-step' ? 'Шаг к выходу' : `+${hit.points}`}</span>
            </p>
          ) : miss ? (
            <p className="phone-miss">
              <b>Мимо</b>
              <span>{miss}</span>
            </p>
          ) : null}
          <blockquote className="host-line" data-line={show.line.id}>
            <span>Николай</span>
            <p>{show.line.text}</p>
          </blockquote>
          {hit || miss ? null : seat ? (
            <p className="lede">{phoneLead(show, seat)}</p>
          ) : (
            <p className="lede">Вечер начался без тебя.</p>
          )}
          {answering && (stage.kind === 'trivia' || stage.kind === 'finale') ? (
            <div className="option-grid">
              {stage.options.map((option, index) => (
                <button
                  key={index}
                  className="btn btn-ghost"
                  type="button"
                  disabled={show.paused || stage.locked.includes(playerId)}
                  onClick={() => onInput({ choice: index })}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function ExplainBoard({
  title,
  text,
  endsAt,
  serverNow,
  paused,
  lineId,
  hideClock = false,
}: {
  title: string
  text: string
  endsAt: number
  serverNow: number
  paused: boolean
  lineId: string
  hideClock?: boolean
}) {
  const now = useSyncedNow(serverNow, paused)
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000))
  return (
    <div className="explain">
      <p className="eyebrow">Как играть</p>
      <h1 className="menu-title">{title}</h1>
      <p className="explain-copy" data-line={lineId}>
        {text}
      </p>
      {hideClock ? null : <p className="count">{left} с на чтение</p>}
    </div>
  )
}

function CountdownBoard({
  title,
  endsAt,
  serverNow,
  paused,
  lineId,
}: {
  title: string
  endsAt: number
  serverNow: number
  paused: boolean
  lineId: string
}) {
  const now = useSyncedNow(serverNow, paused)
  const left = Math.max(1, Math.ceil((endsAt - now) / 1000))
  return (
    <div className="explain" data-line={lineId}>
      <p className="eyebrow">{title}</p>
      <p className="countdown-num">{left}</p>
    </div>
  )
}

function Clock({
  endsAt,
  serverNow,
  paused,
  keepOne,
  startsAt = null,
}: {
  endsAt: number | null
  serverNow: number
  paused: boolean
  keepOne: boolean
  startsAt?: number | null
}) {
  const synced = useSyncedNow(serverNow, paused)
  // while the question is being read the clock stays full
  const now = startsAt !== null && synced < startsAt ? startsAt : synced
  const left = endsAt === null ? null : Math.max(keepOne ? 1 : 0, Math.ceil((endsAt - now) / 1000))
  return (
    <div className="show-clock" aria-label={left === null ? 'Без отсчёта' : `${left} секунд`}>
      <b>{left === null ? '' : left}</b>
    </div>
  )
}

function clockEnds(stage: ShowSnapshot['stage']): number | null {
  if (
    stage.kind === 'trivia' ||
    stage.kind === 'finale' ||
    stage.kind === 'briefing' ||
    stage.kind === 'countdown'
  ) {
    return stage.endsAt
  }
  if (stage.kind === 'punishment' && stage.activity.status === 'play' && 'endsAt' in stage.activity) {
    return stage.activity.endsAt
  }
  return null
}

function clockNow(stage: ShowSnapshot['stage']): number {
  if (
    stage.kind === 'trivia' ||
    stage.kind === 'finale' ||
    stage.kind === 'briefing' ||
    stage.kind === 'countdown'
  ) {
    return stage.serverNow
  }
  if (stage.kind === 'punishment' && stage.activity.status === 'play' && 'serverNow' in stage.activity) {
    return stage.activity.serverNow
  }
  return 0
}

function ResultChips({
  stage,
}: {
  stage: Extract<ShowSnapshot['stage'], { kind: 'trivia-result' | 'finale-step' | 'punishment-result' }>
}) {
  return (
    <ul className="roster">
      {stage.gained.map((item) => (
        <li key={item.playerId} className="person">
          <PlayerAvatar id={item.playerId} />
          <span>
            {item.name} {stage.kind === 'finale-step' ? 'шаг' : `+${item.points}`}
          </span>
        </li>
      ))}
      {stage.failed.map((item) => (
        <li key={item.playerId} className="person">
          <PlayerAvatar id={item.playerId} ghost={stage.kind === 'punishment-result'} />
          <span>{item.name}</span>
          <span className="hh-tag">
            {stage.kind === 'finale-step' ? 'стоит' : stage.kind === 'trivia-result' ? 'наказание' : 'hh'}
          </span>
        </li>
      ))}
    </ul>
  )
}

function useLaneMarch(seats: ScoreSeat[], stage: ShowSnapshot['stage']) {
  const previous = useRef(seats)
  const latest = useRef({ seats, stage })
  const [shown, setShown] = useState(seats)
  const key = marchKey(seats, stage)
  latest.current = { seats, stage }

  useEffect(() => {
    const current = latest.current
    const before = previous.current
    if (current.stage.kind !== 'finale-step') {
      previous.current = current.seats
      setShown(current.seats)
      return
    }
    const moved = new Set(current.stage.gained.map((item) => item.playerId))
    const leaderId = before.find((seat) => !seat.ghost)?.playerId
    const laneOf = (id: string) => current.seats.find((seat) => seat.playerId === id)?.lane ?? 0
    const holding = current.seats.map((seat) => {
      const prior = before.find((item) => item.playerId === seat.playerId)
      return {
        ...seat,
        lane: prior?.lane ?? seat.lane,
        ghost: prior?.ghost ?? seat.ghost,
        role: prior?.role ?? seat.role,
      }
    })
    setShown(holding)
    const leaderMoves = leaderId !== undefined && moved.has(leaderId)
    const restAt = leaderMoves ? 900 : 220
    const leaderTimer = window.setTimeout(() => {
      if (!leaderId || !moved.has(leaderId)) return
      setShown((items) =>
        items.map((seat) => (seat.playerId === leaderId ? { ...seat, lane: laneOf(leaderId) } : seat)),
      )
    }, 80)
    const restTimer = window.setTimeout(() => {
      setShown((items) =>
        items.map((seat) =>
          moved.has(seat.playerId) && seat.playerId !== leaderId
            ? { ...seat, lane: laneOf(seat.playerId) }
            : seat,
        ),
      )
    }, restAt)
    const crownTimer = window.setTimeout(() => {
      previous.current = current.seats
      setShown(current.seats)
    }, restAt + 760)
    return () => {
      window.clearTimeout(leaderTimer)
      window.clearTimeout(restTimer)
      window.clearTimeout(crownTimer)
    }
  }, [key])

  if (stage.kind !== 'finale-step') {
    previous.current = seats
    return seats
  }
  return shown
}

function marchKey(seats: ScoreSeat[], stage: ShowSnapshot['stage']) {
  const lanes = seats.map((seat) => `${seat.playerId}:${seat.lane}:${seat.ghost ? 1 : 0}`).join('|')
  if (stage.kind === 'finale-step') {
    return `step:${stage.correct}:${stage.gained.map((item) => item.playerId).join(',')}:${lanes}`
  }
  return `${stage.kind}:${lanes}`
}

function Cast({ seats }: { seats: ScoreSeat[] }) {
  const ranked = [...seats].sort(
    (left, right) => right.score - left.score || left.name.localeCompare(right.name, 'ru'),
  )
  const columns = ranked.length <= 8 ? Math.max(ranked.length, 1) : Math.ceil(Math.sqrt(ranked.length))
  return (
    <ol className="show-cast" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {ranked.map((seat) => (
        <li key={seat.playerId} className="show-person">
          <PlayerAvatar id={seat.playerId} ghost={seat.ghost} fit />
          <span className="show-person-name">{seat.name}</span>
          <b>{seat.score}</b>
        </li>
      ))}
    </ol>
  )
}

function Flight({ seats, exitAt }: { seats: ScoreSeat[]; exitAt: number }) {
  const rows = flightRows(seats)
  return (
    <div className="show-flight" style={{ '--rows': Math.max(rows.length, 1) } as CSSProperties}>
      <p className="show-exit">ВЫХОД</p>
      {rows.map((seat, index) => (
        <div
          key={seat.playerId}
          className="show-flyer"
          style={{
            top: `${flyerTop(index, rows.length)}%`,
            left: `${flyerLeft(seat.lane, exitAt)}%`,
          }}
        >
          <PlayerAvatar id={seat.playerId} ghost={seat.ghost} fit />
          <span>{seat.name}</span>
        </div>
      ))}
    </div>
  )
}

function DeathScreen({ failed, paused }: { failed: ShowFail[]; paused: boolean }) {
  const key = failed.map((item) => item.playerId).join('|')
  useEffect(() => {
    if (paused) return
    playScream(key)
  }, [key, paused])
  return (
    <section className={paused ? 'show death-screen held' : 'show death-screen'}>
      <div className="death-copy">
        <p className="eyebrow">На hh</p>
        <ul className="death-row">
          {failed.map((person) => (
            <li key={person.playerId} className="death-card">
              {deathPose(person.playerId) === 'split' ? (
                <SplitPortrait id={person.playerId} />
              ) : (
                <NailPortrait id={person.playerId} />
              )}
              <span>{person.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function SplitPortrait({ id }: { id: string }) {
  return (
    <span className="death-split" aria-hidden="true">
      <span className="death-half top">
        <PlayerAvatar id={id} fit />
      </span>
      <span className="death-half bottom">
        <PlayerAvatar id={id} fit />
      </span>
    </span>
  )
}

function NailPortrait({ id }: { id: string }) {
  return (
    <span className="death-nail" aria-hidden="true">
      <PlayerAvatar id={id} fit />
      <i className="death-pin" />
    </span>
  )
}

function deathPose(id: string): 'split' | 'nail' {
  let hash = 0
  for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  return hash % 2 === 0 ? 'split' : 'nail'
}

function roundLabel(show: ShowSnapshot) {
  const kind = show.stage.kind
  if (kind === 'finale' || kind === 'finale-step' || kind === 'done') return 'Финал'
  if (kind === 'briefing' || kind === 'countdown' || kind === 'punishment' || kind === 'punishment-result') {
    return `Тур ${show.round} из ${show.roundCount} · наказание`
  }
  return `Тур ${show.round} из ${show.roundCount} · вопрос`
}

function missCaption(
  stage: ShowSnapshot['stage'],
  playerId: string,
  role: ScoreSeat['role'] | undefined,
): string | null {
  if (!role || (stage.kind !== 'trivia-result' && stage.kind !== 'finale-step')) return null
  if (stage.gained.some((item) => item.playerId === playerId)) return null
  if (stage.kind === 'finale-step') {
    return stage.failed.some((item) => item.playerId === playerId) ? 'Стоишь' : null
  }
  if (stage.failed.some((item) => item.playerId === playerId)) return 'Наказание'
  return role === 'ghost' ? 'Без очков' : null
}

function phoneLead(show: ShowSnapshot, seat: ScoreSeat) {
  const kind = show.stage.kind
  if (seat.role === 'ghost' && kind === 'briefing') {
    return 'Наказание сейчас. Подложить можно, как только оно начнётся.'
  }
  if (seat.role === 'ghost' && kind === 'trivia') {
    return 'Ты на hh. Верный ответ всё равно приносит очки.'
  }
  if (seat.role === 'ghost' && kind === 'trivia-result') {
    return 'Мимо. На наказание ты уже не идёшь.'
  }
  if (seat.role === 'safe') return 'Этот вопрос ты закрыл. Наказание смотри на экране.'
  if (seat.role === 'awaiting' && kind === 'briefing') return 'Вопрос мимо. Сейчас твоё наказание.'
  if (seat.role === 'awaiting' && kind === 'trivia-result') return 'Мимо. Сейчас наказание.'
  if (kind === 'done' && show.stage.kind === 'done') {
    return show.stage.winnerId === seat.playerId ? 'Ты дошёл до выхода.' : `${show.stage.winnerName} доходит до выхода.`
  }
  if (seat.role === 'ghost' && (kind === 'finale' || kind === 'finale-step')) {
    return 'Ты на hh, но к выходу идёшь вместе со всеми.'
  }
  if (kind === 'finale') return 'Верный ответ двигает на шаг. Мимо — стоишь.'
  if (kind === 'trivia') return 'Один верный. Успей выбрать.'
  return 'Смотри на экран.'
}

function useSyncedNow(serverNow: number, paused: boolean) {
  const skew = useRef(0)
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    skew.current = serverNow - Date.now()
  }, [serverNow])
  useEffect(() => {
    let frame = 0
    const loop = () => {
      setNow(Date.now() + skew.current)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])
  return paused ? serverNow : now
}

function stageBackdrop(kind: ShowSnapshot['stage']['kind']) {
  if (kind === 'trivia' || kind === 'intro' || kind === 'trivia-result') return ' show-trivia'
  if (kind === 'finale' || kind === 'finale-step') return ' show-final'
  return ''
}

/* End credits: a slow diagonal camera pass over a detective board of the dead. */
const BOARD = 300

function Credits({ seats, winnerId }: { seats: ScoreSeat[]; winnerId: string }) {
  const dead = [...seats]
    .filter((seat) => seat.ghost)
    .sort((left, right) => left.playerId.localeCompare(right.playerId))
  const alive = seats
    .filter((seat) => !seat.ghost)
    .sort((left, right) => Number(right.playerId === winnerId) - Number(left.playerId === winnerId))
  const pins = dead.map((seat, index) => {
    const t = (index + 0.5) / dead.length
    const base = 30 + t * (BOARD - 60)
    return {
      seat,
      x: clampBoard(base + jitter(seat.playerId, 1) * 34),
      y: clampBoard(base + jitter(seat.playerId, 2) * 34),
      tilt: jitter(seat.playerId, 3) * 7,
    }
  })
  const links: [number, number][] = []
  pins.forEach((_, index) => {
    if (index > 0) links.push([index - 1, index])
    if (index > 1 && index % 2 === 0) links.push([index - 2, index])
  })
  return (
    <section className="show credits">
      <div className="credits-camera">
        <div className="credits-board">
          <svg className="credits-strings" viewBox={`0 0 ${BOARD} ${BOARD}`} preserveAspectRatio="none" aria-hidden="true">
            {links.map(([from, to]) => {
              const a = pins[from]
              const b = pins[to]
              if (!a || !b) return null
              const sag = 6 + Math.hypot(b.x - a.x, b.y - a.y) * 0.12
              return (
                <path
                  key={`${from}-${to}`}
                  d={`M ${a.x} ${a.y - 9} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - 9 + sag} ${b.x} ${b.y - 9}`}
                />
              )
            })}
          </svg>
          {pins.map(({ seat, x, y, tilt }) => (
            <figure
              key={seat.playerId}
              className="credits-pin"
              style={{ left: `${(x / BOARD) * 100}%`, top: `${(y / BOARD) * 100}%`, '--tilt': `${tilt}deg` } as CSSProperties}
            >
              <span className="credits-tack" />
              <div className="credits-photo">
                <SplitPortrait id={seat.playerId} />
              </div>
              <figcaption>{seat.name}</figcaption>
            </figure>
          ))}
          {pins.length === 0 ? <p className="credits-empty">Никто не погиб</p> : null}
        </div>
      </div>
      <div className="credits-survivor">
        <p className="credits-survivor-label">{alive.length > 0 ? 'Выжил:' : 'Выживших нет'}</p>
        {alive.map((seat) => (
          <div key={seat.playerId} className="credits-survivor-row">
            <span className="credits-survivor-face">
              <PlayerAvatar id={seat.playerId} fit />
            </span>
            <span>{seat.name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function jitter(id: string, salt: number) {
  let hash = salt * 2654435761
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 2246822519)
    hash ^= hash >>> 13
  }
  return ((hash >>> 0) % 2001) / 1000 - 1
}

function clampBoard(value: number) {
  return Math.min(BOARD - 25, Math.max(25, value))
}

function flightRows(seats: ScoreSeat[]) {
  return [...seats].sort(
    (left, right) => left.name.localeCompare(right.name, 'ru') || left.playerId.localeCompare(right.playerId),
  )
}

function flyerTop(index: number, count: number) {
  return ((index + 0.5) / Math.max(count, 1)) * 100
}

function flyerLeft(lane: number, exitAt: number) {
  return 6 + Math.min(1, lane / exitAt) * 80
}

/* Finale: a small parchment card that hangs beside the leader instead of covering the track. */
const CARD_WIDTH = 30
const CARD_GAP = 5

function FinaleCard({
  stage,
  seats,
  exitAt,
  paused,
}: {
  stage: Extract<ShowSnapshot['stage'], { prompt: string }> | Extract<ShowSnapshot['stage'], { correct: string | null }>
  seats: ScoreSeat[]
  exitAt: number
  paused: boolean
}) {
  const rows = flightRows(seats)
  let lead = 0
  rows.forEach((seat, index) => {
    if ((rows[index]?.lane ?? 0) > (rows[lead]?.lane ?? 0)) lead = index
    void seat
  })
  const leader = rows[lead]
  const x = leader ? flyerLeft(leader.lane, exitAt) : 50
  const y = leader ? flyerTop(lead, rows.length) : 50
  const left = x > 50 ? x - CARD_GAP - CARD_WIDTH : x + CARD_GAP
  const style = {
    left: `${Math.min(100 - CARD_WIDTH - 2, Math.max(2, left))}%`,
    top: `${Math.min(76, Math.max(24, y))}%`,
    width: `${CARD_WIDTH}%`,
  } as CSSProperties
  const asking = 'prompt' in stage ? stage : null
  return (
    <div className="finale-card" style={style}>
      <div className="finale-card-head">
        <p className="finale-card-prompt">{asking ? asking.prompt : 'Ответ'}</p>
        {asking ? (
          <Clock endsAt={asking.endsAt} serverNow={asking.serverNow} startsAt={asking.readUntil} paused={paused} keepOne={false} />
        ) : null}
      </div>
      <div key={asking ? asking.prompt : 'reveal'} className="finale-card-options arrive">
        {stage.options.map((option, index) => (
          <p
            key={index}
            className={
              !('correct' in stage) || stage.correct === null
                ? 'finale-option'
                : option === stage.correct
                  ? 'finale-option right'
                  : 'finale-option wrong'
            }
          >
            {option}
          </p>
        ))}
      </div>
    </div>
  )
}
