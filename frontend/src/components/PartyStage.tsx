import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { GAME_MENU } from '../gameMenu'
import type { ActivitySnapshot, GameId, GameInput, HauntView } from '../types'
import { PlayerAvatar } from './PlayerAvatar'

export function GameMenu({
  busy,
  onPick,
}: {
  busy: boolean
  onPick: (gameId: GameId) => void
}) {
  return (
    <section className="game-board">
      <p className="eyebrow">Николай</p>
      <h1 className="menu-title">Что запускаем?</h1>
      <p className="lede">
        Добрый вечер. Я Николай. Выбирай мини-игру — кого-нибудь сегодня всё равно
        отправят на hh.
      </p>
      <div className="game-grid">
        {GAME_MENU.map((game) => (
          <button
            key={game.id}
            type="button"
            className={game.ready ? 'game-card' : 'game-card locked'}
            disabled={!game.ready || busy}
            onClick={() => onPick(game.id)}
          >
            <h2>{game.title}</h2>
            <p>{game.blurb}</p>
          </button>
        ))}
      </div>
    </section>
  )
}

export function PartyScreen({
  activity,
  busy = false,
  onStart,
  onStop,
  bare = false,
  paused = false,
}: {
  activity: ActivitySnapshot
  busy?: boolean
  onStart?: () => void
  onStop?: () => void
  bare?: boolean
  paused?: boolean
}) {
  const quiet = bare && activity.status === 'play'
  return (
    <section className="party">
      {bare ? null : <HostLine lineId={activity.line.id} text={activity.line.text} />}
      {quiet ? null : (
        <div className="party-head">
          <div>
            <p className="eyebrow">{statusLabel(activity.status)}</p>
            <h1 className="menu-title">{activity.title}</h1>
          </div>
          {bare ? null : (
            <div className="room-actions">
              {activity.status === 'briefing' ? (
                <button className="btn btn-primary" type="button" disabled={busy} onClick={onStart}>
                  Запустить
                </button>
              ) : null}
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={onStop}>
                {activity.status === 'result' ? 'К выбору игр' : 'Закрыть раунд'}
              </button>
            </div>
          )}
        </div>
      )}
      {activity.status === 'briefing' ? <p className="lede">{activity.blurb}</p> : null}
      {activity.status === 'play' && !quiet ? <HauntNotes haunts={activity.haunts} /> : null}
      {activity.status === 'play' ? <PlayStage activity={activity} paused={paused} /> : null}
      {activity.status === 'result' ? (
        <HhList names={activity.sentToHh.map((player) => player.name)} />
      ) : null}
    </section>
  )
}

export function PartyPhone({
  activity,
  playerId,
  onHh,
  targets,
  onInput,
  paused = false,
  bare = false,
}: {
  activity: ActivitySnapshot
  playerId: string
  onHh: boolean
  targets: { id: string; name: string }[]
  onInput: (input: GameInput) => void
  paused?: boolean
  bare?: boolean
}) {
  const sent = activity.status === 'result' && activity.sentToHh.some((player) => player.playerId === playerId)
  const ghost = onHh || sent
  const quiet = bare && activity.status === 'play'

  return (
    <section className={quiet ? 'play-phone' : 'panel player-card'}>
      {paused && quiet ? <p className="pause-banner">Пауза</p> : null}
      {quiet ? null : <HostLine lineId={activity.line.id} text={activity.line.text} />}
      {quiet ? null : <p className="eyebrow">{activity.title}</p>}
      {activity.status === 'briefing' ? (
        <h1 className="menu-title">{ghost ? 'С hh подложишь в раунде' : 'Николай ещё не запустил раунд'}</h1>
      ) : null}
      {activity.status === 'play' && ghost ? (
        <HauntPad
          activity={activity}
          playerId={playerId}
          targets={targets}
          paused={paused}
          quiet={quiet}
          onInput={onInput}
        />
      ) : null}
      {activity.status === 'play' && !ghost ? (
        <PhonePlay activity={activity} playerId={playerId} paused={paused} quiet={quiet} onInput={onInput} />
      ) : null}
      {activity.status === 'result' ? (
        <h1 className="menu-title">{ghost ? 'Ты на hh' : 'Ты ещё в штате'}</h1>
      ) : null}
    </section>
  )
}

function HostLine({ lineId, text }: { lineId: string; text: string }) {
  return (
    <blockquote className="host-line" data-line={lineId}>
      <span>Николай</span>
      <p>{text}</p>
    </blockquote>
  )
}

function HauntNotes({ haunts }: { haunts: HauntView[] }) {
  if (haunts.length === 0) return null
  return (
    <ul className="haunt-list">
      {haunts.map((haunt) => (
        <li key={haunt.ghostId} data-line={`haunt.${haunt.kind}.${haunt.targetId}`}>
          {haunt.text}
        </li>
      ))}
    </ul>
  )
}

function HauntPad({
  activity,
  playerId,
  targets,
  paused,
  quiet = false,
  onInput,
}: {
  activity: Extract<ActivitySnapshot, { status: 'play' }>
  playerId: string
  targets: { id: string; name: string }[]
  paused: boolean
  quiet?: boolean
  onInput: (input: GameInput) => void
}) {
  const done = activity.haunts.some((haunt) => haunt.ghostId === playerId)
  return (
    <div className="play-block">
      {quiet ? null : <p className="lede">Ты на hh. Один раз за раунд можно подложить кому-то в штате.</p>}
      {quiet ? null : <HauntNotes haunts={activity.haunts} />}
      {targets.length === 0 ? <p className="lede">В штате уже никого.</p> : null}
      <div className="option-grid">
        {targets.map((target) => {
          const taken = activity.haunts.some((haunt) => haunt.targetId === target.id)
          return (
            <button
              key={target.id}
              type="button"
              className="btn btn-ghost"
              disabled={paused || done || taken}
              onClick={() => onInput({ hauntTargetId: target.id })}
            >
              {hauntLabel(activity.gameId)}: {target.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function hauntLabel(gameId: GameId) {
  if (gameId === 'server-balance') return 'Повесить гирю'
  if (gameId === 'friday-release') return 'Сузить окно'
  if (gameId === 'night-pager') return 'Расширить зону'
  if (gameId === 'red-button') return 'Заклеить кнопку'
  if (gameId === 'alert-repeat') return 'Подменить алерт'
  if (gameId === 'code-review') return 'Подменить вариант'
  return 'Подложить'
}

function PlayStage({
  activity,
  paused,
}: {
  activity: Extract<ActivitySnapshot, { status: 'play' }>
  paused: boolean
}) {
  if (activity.gameId === 'server-balance') {
    const left = Math.max(0, Math.ceil((activity.endsAt - activity.serverNow) / 1000))
    return (
      <div className="play-block">
        <p className="count">
          {windLabel(activity.wind)} · {left} с
        </p>
        <ul className="rack-list">
          {activity.racks.map((rack) => (
            <li key={rack.playerId}>
              <PlayerAvatar id={rack.playerId} size={40} />
              <div
                className={rack.heavy ? 'mini-rack heavy' : 'mini-rack'}
                style={{ transform: `rotate(${rack.angle}deg)` }}
              />
              <span>
                {rack.name} · {rack.alive ? `${rack.score}` : 'лёг'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (activity.gameId === 'friday-release') {
    return (
      <div className="play-block">
        <ReleaseTrack activity={activity} paused={paused} />
        <p className="count">Нажали {activity.tapped.length}</p>
      </div>
    )
  }
  if (activity.gameId === 'red-button') {
    return (
      <div className="play-block">
        <p className="count">{secondsLeft(activity.endsAt, activity.serverNow)} с</p>
        <div className="option-grid">
          {activity.options.map((option) => (
            <p key={option} className="option-card">
              {option}
            </p>
          ))}
        </div>
      </div>
    )
  }
  if (activity.gameId === 'code-review') {
    return (
      <div className="play-block">
        <p className="count">{secondsLeft(activity.endsAt, activity.serverNow)} с</p>
        <div className="option-grid">
          {activity.options.map((option, index) => (
            <p key={index} className="option-card">
              {option}
            </p>
          ))}
        </div>
      </div>
    )
  }
  if (activity.gameId === 'alert-repeat') {
    return (
      <div className="play-block">
        <p className="count">{secondsLeft(activity.endsAt, activity.serverNow)} с</p>
        {activity.sequence.length > 0 ? (
          <ol className="alert-row">
            {activity.sequence.map((icon, index) => (
              <li key={`${icon}-${index}`}>{icon}</li>
            ))}
          </ol>
        ) : null}
      </div>
    )
  }
  return <p className="count">{secondsLeft(activity.endsAt, activity.serverNow)} с</p>
}

function PhonePlay({
  activity,
  playerId,
  paused,
  quiet = false,
  onInput,
}: {
  activity: Extract<ActivitySnapshot, { status: 'play' }>
  playerId: string
  paused: boolean
  quiet?: boolean
  onInput: (input: GameInput) => void
}) {
  if (activity.gameId === 'server-balance') {
    const rack = activity.racks.find((item) => item.playerId === playerId)
    if (!rack) return <p className="lede">Этот раунд уже начался без тебя.</p>
    return (
      <BalancePad
        angle={rack.angle}
        score={rack.score}
        alive={rack.alive}
        heavy={rack.heavy}
        paused={paused}
        quiet={quiet}
        onInput={onInput}
      />
    )
  }
  if (activity.gameId === 'friday-release') {
    const tapped = activity.tapped.includes(playerId)
    return (
      <div className="play-block">
        <ReleaseTrack activity={activity} paused={paused} />
        <button className="btn btn-primary" type="button" disabled={paused || tapped} onClick={() => onInput({})}>
          {tapped ? 'Релиз ушёл' : 'Выкатить'}
        </button>
      </div>
    )
  }
  if (activity.gameId === 'night-pager') {
    return (
      <PagerPad
        locked={paused || activity.locked.includes(playerId)}
        wide={activity.wideZone}
        quiet={quiet}
        onInput={onInput}
      />
    )
  }
  if (activity.gameId === 'code-review') {
    const locked = activity.locked.includes(playerId)
    return (
      <div className="option-grid">
        {activity.options.map((option, index) => (
          <button
            key={index}
            className="btn btn-ghost"
            type="button"
            disabled={paused || locked}
            onClick={() => onInput({ choice: index })}
          >
            {option}
          </button>
        ))}
      </div>
    )
  }
  if (activity.gameId === 'red-button') {
    const locked = activity.locked.includes(playerId)
    return (
      <div className="option-grid">
        {activity.options.map((option, index) => {
          const sealed = index === activity.sealedIndex
          return (
            <button
              key={option}
              className="btn btn-ghost"
              type="button"
              disabled={paused || locked || sealed}
              onClick={() => onInput({ choice: index })}
            >
              {sealed ? `${option} · заклеено` : option}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <AlertPad
      key={`${activity.revealUntil}-${activity.sequence.join('|')}`}
      activity={activity}
      locked={paused || activity.locked.includes(playerId)}
      quiet={quiet}
      onInput={onInput}
    />
  )
}

function BalancePad({
  angle,
  score,
  alive,
  heavy,
  paused,
  quiet = false,
  onInput,
}: {
  angle: number
  score: number
  alive: boolean
  heavy: boolean
  paused: boolean
  quiet?: boolean
  onInput: (input: GameInput) => void
}) {
  function down(event: PointerEvent<HTMLButtonElement>, hold: 'left' | 'right') {
    event.currentTarget.setPointerCapture(event.pointerId)
    onInput({ hold })
  }
  function up(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onInput({ hold: 'none' })
  }

  return (
    <div className="play-block">
      <div className="rack-stage">
        <div className={heavy ? 'rack-body heavy' : 'rack-body'} style={{ transform: `rotate(${angle}deg)` }}>
          <i />
          <i />
          <i />
        </div>
      </div>
      {quiet ? null : (
        <p className="count">
          {alive ? `${score} очков${heavy ? ' · гиря' : ''}` : 'Сервер лег. Николай уже открыл hh.'}
        </p>
      )}
      <div className="hold-row">
        <button type="button" disabled={paused || !alive} onPointerDown={(event) => down(event, 'left')} onPointerUp={up} onPointerCancel={up}>
          Влево
        </button>
        <button type="button" disabled={paused || !alive} onPointerDown={(event) => down(event, 'right')} onPointerUp={up} onPointerCancel={up}>
          Вправо
        </button>
      </div>
    </div>
  )
}

function ReleaseTrack({
  activity,
  paused,
}: {
  activity: Extract<ActivitySnapshot, { status: 'play'; gameId: 'friday-release' }>
  paused: boolean
}) {
  const now = useSyncedNow(activity.serverNow, paused)
  const elapsed = Math.max(0, now - activity.startedAt)
  const pos = (elapsed % activity.periodMs) / activity.periodMs
  const greenLeft = (activity.greenCenter - activity.greenHalf) * 100
  const greenWidth = activity.greenHalf * 2 * 100

  return (
    <div className="track" aria-hidden="true">
      <span className="track-green" style={{ left: `${greenLeft}%`, width: `${greenWidth}%` }} />
      <span className="track-marker" style={{ left: `${pos * 100}%` }} />
    </div>
  )
}

function PagerPad({
  locked,
  wide,
  quiet = false,
  onInput,
}: {
  locked: boolean
  wide: boolean
  quiet?: boolean
  onInput: (input: GameInput) => void
}) {
  const [minute, setMinute] = useState(30)
  return (
    <div className="play-block">
      {wide && !quiet ? <p className="lede">Мёртвая зона для тебя шире.</p> : null}
      <p className="menu-title minute">{minute}</p>
      <input
        type="range"
        min={0}
        max={100}
        value={minute}
        disabled={locked}
        onChange={(event) => setMinute(Number(event.target.value))}
      />
      <button className="btn btn-primary" type="button" disabled={locked} onClick={() => onInput({ choice: minute })}>
        {locked ? 'Минута принята' : 'Поставить минуту'}
      </button>
    </div>
  )
}

function AlertPad({
  activity,
  locked,
  quiet = false,
  onInput,
}: {
  activity: Extract<ActivitySnapshot, { status: 'play'; gameId: 'alert-repeat' }>
  locked: boolean
  quiet?: boolean
  onInput: (input: GameInput) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  if (activity.sequence.length > 0) {
    return (
      <ol className="alert-row">
        {activity.sequence.map((icon, index) => (
          <li key={`${icon}-${index}`}>{icon}</li>
        ))}
      </ol>
    )
  }
  return (
    <div className="play-block">
      {quiet ? (
        picked.length > 0 ? <p className="count">{picked.join(' → ')}</p> : null
      ) : (
        <p className="count">{picked.join(' → ') || 'Набери порядок'}</p>
      )}
      <div className="option-grid">
        {activity.icons.map((icon) => (
          <button
            key={icon}
            type="button"
            className="btn btn-ghost"
            disabled={locked || picked.length >= ALERT_LENGTH}
            onClick={() => setPicked((current) => [...current, icon].slice(0, ALERT_LENGTH))}
          >
            {icon}
          </button>
        ))}
      </div>
      <button
        className="btn btn-primary"
        type="button"
        disabled={locked || picked.length !== ALERT_LENGTH}
        onClick={() => onInput({ sequence: picked })}
      >
        {locked ? 'Порядок принят' : 'Отправить'}
      </button>
    </div>
  )
}

const ALERT_LENGTH = 8

function HhList({ names }: { names: string[] }) {
  if (names.length === 0) return <p className="lede">Николай никого не тронул.</p>
  return (
    <ul className="roster">
      {names.map((name) => (
        <li key={name} className="person">
          <span>{name}</span>
          <span className="hh-tag">hh</span>
        </li>
      ))}
    </ul>
  )
}

function windLabel(wind: number) {
  if (wind > 0.2) return 'Сносит вправо'
  if (wind < -0.2) return 'Сносит влево'
  return 'Почти ровно'
}

function statusLabel(status: ActivitySnapshot['status']) {
  if (status === 'briefing') return 'Николай объясняет'
  if (status === 'play') return 'Раунд идёт'
  return 'Итог'
}

function secondsLeft(endsAt: number, serverNow: number) {
  return Math.max(0, Math.ceil((endsAt - serverNow) / 1000))
}

function useSyncedNow(serverNow: number, paused = false) {
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
