import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Shell } from '../components/Shell'
import {
  clearPlayer,
  clearRoomSession,
  clearScreen,
  loadPlayer,
  loadScreen,
  savePlayer,
} from '../session'
import { emitAck, socket } from '../socket'
import { GameMenu, PartyPhone, PartyScreen } from '../components/PartyStage'
import type { GameId, GameInput, PublicPlayer, RoomRole, RoomSnapshot } from '../types'

type AttachResult = { role: 'screen'; snapshot: RoomSnapshot }
type PlayerResult = {
  role: 'player'
  playerId: string
  playerToken: string
  name: string
  snapshot: RoomSnapshot
}

export function Room() {
  const params = useParams()
  const code = (params.code ?? '').toUpperCase()
  const [role, setRole] = useState<RoomRole>('guest')
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [closed, setClosed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [entering, setEntering] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function enter() {
      setEntering(true)
      setError('')
      setClosed(false)
      try {
        const screenToken = loadScreen(code)
        if (screenToken) {
          const response = await emitAck<AttachResult>('room:attach-screen', {
            code,
            screenToken,
          })
          if (cancelled) return
          if (response.ok) {
            setRole('screen')
            setSnapshot(response.snapshot)
            return
          }
          clearScreen(code)
        }

        const saved = loadPlayer(code)
        if (saved) {
          const response = await emitAck<PlayerResult>('room:rejoin', {
            code,
            playerToken: saved.token,
          })
          if (cancelled) return
          if (response.ok) {
            savePlayer(code, {
              token: response.playerToken,
              playerId: response.playerId,
              name: response.name,
            })
            setRole('player')
            setPlayerName(response.name)
            setPlayerId(response.playerId)
            setSnapshot(response.snapshot)
            return
          }
          clearPlayer(code)
        }

        const pendingName = new URLSearchParams(window.location.search).get('name')
        if (pendingName) {
          const response = await emitAck<PlayerResult>('room:join', {
            code,
            name: pendingName,
          })
          if (cancelled) return
          if (!response.ok) {
            setRole('guest')
            setError(response.message)
            return
          }
          savePlayer(code, {
            token: response.playerToken,
            playerId: response.playerId,
            name: response.name,
          })
          window.history.replaceState({}, '', `/room/${code}`)
          setRole('player')
          setPlayerName(response.name)
          setPlayerId(response.playerId)
          setSnapshot(response.snapshot)
          return
        }

        if (!cancelled) setRole('guest')
      } catch (cause) {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Нет связи с комнатой')
      } finally {
        if (!cancelled) setEntering(false)
      }
    }

    void enter()

    const onState = (next: RoomSnapshot) => {
      if (next.code !== code) return
      setSnapshot(next)
      setError('')
    }
    const onDisplaced = (payload: { message?: string }) => {
      clearRoomSession(code)
      setRole('guest')
      setSnapshot(null)
      setPlayerName('')
      setPlayerId('')
      setError(payload.message || 'Вас убрали из комнаты')
    }
    const onClosed = (payload: { code?: string }) => {
      if (payload.code !== code) return
      clearRoomSession(code)
      setClosed(true)
    }

    socket.on('room:state', onState)
    socket.on('room:displaced', onDisplaced)
    socket.on('room:closed', onClosed)
    return () => {
      cancelled = true
      socket.off('room:state', onState)
      socket.off('room:displaced', onDisplaced)
      socket.off('room:closed', onClosed)
    }
  }, [code])

  async function runRoom(event: string, payload: object = {}) {
    setBusy(true)
    setError('')
    try {
      const response = await emitAck<{ snapshot: RoomSnapshot }>(event, payload)
      if (!response.ok) setError(response.message)
      else setSnapshot(response.snapshot)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось обновить комнату')
    } finally {
      setBusy(false)
    }
  }

  function sendInput(input: GameInput) {
    void emitAck('game:input', input)
      .then((response) => {
        if (!response.ok) setError(response.message)
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Не удалось нажать кнопку')
      })
  }

  async function kick(playerId: string) {
    setError('')
    try {
      const response = await emitAck<{ snapshot: RoomSnapshot }>('room:kick', {
        playerId,
      })
      if (!response.ok) setError(response.message)
      else setSnapshot(response.snapshot)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось убрать игрока')
    }
  }

  async function joinFromHere(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await emitAck<PlayerResult>('room:join', { code, name })
      if (!response.ok) {
        setError(response.message)
        return
      }
      savePlayer(code, {
        token: response.playerToken,
        playerId: response.playerId,
        name: response.name,
      })
      setRole('player')
      setPlayerName(response.name)
      setPlayerId(response.playerId)
      setSnapshot(response.snapshot)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  const joinUrl = `${window.location.origin}/join/${code}`

  return (
    <Shell>
      {closed ? (
        <section className="panel narrow">
          <p className="eyebrow">Комната {code}</p>
          <h1>Все вышли, комната закрылась.</h1>
          <Link className="btn btn-primary" to="/">
            На главную
          </Link>
        </section>
      ) : entering ? (
        <section className="panel narrow">
          <p className="eyebrow">Комната {code}</p>
          <h1>Подключаемся…</h1>
        </section>
      ) : role === 'screen' && snapshot ? (
        <ScreenView
          snapshot={snapshot}
          joinUrl={joinUrl}
          busy={busy}
          error={error}
          onPick={(gameId) => void runRoom('room:select-game', { gameId })}
          onStart={() => void runRoom('room:start-game')}
          onStop={() => void runRoom('room:stop-game')}
          onKick={(playerIdToKick) => void kick(playerIdToKick)}
        />
      ) : role === 'player' && snapshot ? (
        <PlayerView
          name={playerName}
          playerId={playerId}
          snapshot={snapshot}
          error={error}
          onInput={sendInput}
        />
      ) : (
        <section className="panel narrow">
          <p className="eyebrow">Комната {code}</p>
          <h1>Войти как игрок</h1>
          <form className="form" onSubmit={(event) => void joinFromHere(event)}>
            <label>
              Имя
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={20}
                autoComplete="off"
                placeholder="Аня"
              />
            </label>
            {error ? <p className="banner">{error}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Входим…' : 'Войти'}
            </button>
          </form>
        </section>
      )}
    </Shell>
  )
}

function ScreenView({
  snapshot,
  joinUrl,
  busy,
  error,
  onPick,
  onStart,
  onStop,
  onKick,
}: {
  snapshot: RoomSnapshot
  joinUrl: string
  busy: boolean
  error: string
  onPick: (gameId: GameId) => void
  onStart: () => void
  onStop: () => void
  onKick: (playerId: string) => void
}) {
  const online = snapshot.players.filter((player) => player.connected).length
  const localhost = window.location.hostname === 'localhost'

  return (
    <section className="room">
      <div className="room-head">
        <div>
          <p className="eyebrow">Комната</p>
          <CodeTiles code={snapshot.code} compact />
        </div>
        <p className="count">
          {online} на связи · {snapshot.players.length} / {snapshot.maxPlayers}
        </p>
      </div>
      {error ? <p className="banner">{error}</p> : null}
      {snapshot.activity ? (
        <PartyScreen
          activity={snapshot.activity}
          busy={busy}
          onStart={onStart}
          onStop={onStop}
        />
      ) : (
        <GameMenu busy={busy} onPick={onPick} />
      )}
      <details className="room-more">
        <summary>Код и игроки</summary>
        <label className="join-link">
          Адрес для телефонов
          <input readOnly value={joinUrl} onFocus={(event) => event.target.select()} />
        </label>
        {localhost ? (
          <p className="hint">
            Телефоны не откроют localhost. Зайди на этот сайт по сетевому адресу,
            который Vite пишет как Network.
          </p>
        ) : null}
        <PlayerRoster players={snapshot.players} onKick={onKick} />
      </details>
    </section>
  )
}

function PlayerView({
  name,
  playerId,
  snapshot,
  error,
  onInput,
}: {
  name: string
  playerId: string
  snapshot: RoomSnapshot
  error: string
  onInput: (input: GameInput) => void
}) {
  const onHh = snapshot.players.some((player) => player.id === playerId && player.onHh)
  const targets = snapshot.players
    .filter((player) => player.connected && !player.onHh)
    .map((player) => ({ id: player.id, name: player.name }))

  if (snapshot.activity) {
    return (
      <>
        {error ? <p className="banner">{error}</p> : null}
        <PartyPhone
          activity={snapshot.activity}
          playerId={playerId}
          onHh={onHh}
          targets={targets}
          onInput={onInput}
        />
      </>
    )
  }

  return (
    <section className="panel narrow player-card">
      <p className="eyebrow">Комната {snapshot.code}</p>
      <h1 className="menu-title">{onHh ? `Ты на hh, ${name}` : `Ты в штате, ${name}`}</h1>
      <p className="lede">
        {onHh
          ? 'Мини-игра для тех, кто в штате. Когда Николай запустит раунд, с телефона можно один раз подложить.'
          : 'Николай на экране выбирает мини-игру. Держи телефон открытым: кнопки появятся здесь.'}
      </p>
      {!snapshot.screenConnected ? (
        <p className="banner">Экран комнаты сейчас не подключён.</p>
      ) : null}
      {error ? <p className="banner">{error}</p> : null}
      <p className="count">
        В комнате {snapshot.players.length} / {snapshot.maxPlayers}
        {snapshot.players.some((player) => player.onHh) ? ' · кто-то уже на hh' : ''}
      </p>
    </section>
  )
}

function CodeTiles({ code, compact = false }: { code: string; compact?: boolean }) {
  return (
    <div className={compact ? 'code compact' : 'code'} role="img" aria-label={`Код ${code}`}>
      {code.split('').map((char, index) => (
        <span key={`${char}-${index}`} className="code-tile">
          {char}
        </span>
      ))}
    </div>
  )
}

function PlayerRoster({
  players,
  onKick,
}: {
  players: PublicPlayer[]
  onKick: (playerId: string) => void
}) {
  if (players.length === 0) {
    return <p className="empty">Пока никого. Код выше — его вводят на телефонах.</p>
  }

  return (
    <ul className="roster">
      {players.map((player) => (
        <li key={player.id} className={player.connected ? 'person' : 'person off'}>
          <span>{player.name}</span>
          {player.onHh ? <span className="hh-tag">hh</span> : null}
          <button type="button" className="kick" onClick={() => onKick(player.id)} aria-label={`Убрать ${player.name}`}>
            убрать
          </button>
        </li>
      ))}
    </ul>
  )
}
