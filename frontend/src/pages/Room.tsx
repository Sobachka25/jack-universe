import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { JoinQr } from '../components/JoinQr'
import { PauseMenu } from '../components/PauseMenu'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { PlayerShelf } from '../components/PlayerShelf'
import { setRoomMusic, type MusicScene } from '../roomMusic'
import { ShowPhone, ShowScreen } from '../components/ShowStage'
import { Shell } from '../components/Shell'
import {
  clearPlayer,
  clearRoomSession,
  clearScreen,
  loadPlayer,
  loadScreen,
  savePlayer,
  saveScreen,
} from '../session'
import { emitAck, socket } from '../socket'
import type { GameInput, RoomRole, RoomSnapshot } from '../types'

function presentRoom(next: RoomSnapshot): RoomSnapshot {
  if (next.phase !== 'lobby' || next.show) return next
  if (next.players.every((player) => !player.onHh)) return next
  return {
    ...next,
    players: next.players.map((player) => ({ ...player, onHh: false })),
  }
}

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
  const navigate = useNavigate()
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
            setSnapshot(presentRoom(response.snapshot))
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
            setSnapshot(presentRoom(response.snapshot))
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
          setSnapshot(presentRoom(response.snapshot))
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
      setSnapshot(presentRoom(next))
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
      if (!response.ok) {
        setError(response.message)
        return false
      }
      setSnapshot(presentRoom(response.snapshot))
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось обновить комнату')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function startFresh() {
    setBusy(true)
    setError('')
    try {
      const response = await emitAck<{
        role: 'screen'
        code: string
        screenToken: string
        snapshot: RoomSnapshot
      }>('room:fresh')
      if (!response.ok) {
        setError(response.message)
        return
      }
      saveScreen(response.code, response.screenToken)
      navigate(`/room/${response.code}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось открыть новую комнату')
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
      setSnapshot(presentRoom(response.snapshot))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell home={role !== 'screen'}>
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
          busy={busy}
          error={error}
          onStart={() => void runRoom('room:start-game')}
          onPause={() => void runRoom('room:pause')}
          onRestart={() => runRoom('room:restart')}
          onFresh={() => startFresh()}
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
  busy,
  error,
  onStart,
  onPause,
  onRestart,
  onFresh,
}: {
  snapshot: RoomSnapshot
  busy: boolean
  error: string
  onStart: () => void
  onPause: () => void
  onRestart: () => Promise<boolean>
  onFresh: () => Promise<void>
}) {
  const online = snapshot.players.filter((player) => player.connected).length
  const show = snapshot.show
  const [menuOpen, setMenuOpen] = useState(false)
  const askedPause = useRef(false)
  const kind = show?.stage.kind
  const scene: MusicScene =
    kind === 'done'
      ? 'credits'
      : kind === 'finale' || kind === 'finale-step'
        ? 'finale'
        : kind === 'trivia'
          ? 'question'
          : 'lobby'

  useEffect(() => {
    setRoomMusic(scene, menuOpen)
    function unlock() {
      setRoomMusic(scene, menuOpen)
    }
    window.addEventListener('pointerdown', unlock)
    return () => window.removeEventListener('pointerdown', unlock)
  }, [scene, menuOpen])

  useEffect(() => () => setRoomMusic('off', false), [])

  const openMenu = useCallback(() => {
    setMenuOpen(true)
    if (show && !show.paused) {
      askedPause.current = true
      onPause()
    }
  }, [show, onPause])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    const resume = Boolean(show?.paused) || askedPause.current
    askedPause.current = false
    if (show && resume) onPause()
  }, [show, onPause])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.repeat) return
      event.preventDefault()
      if (menuOpen) closeMenu()
      else openMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, openMenu, closeMenu])

  async function restart() {
    const ok = await onRestart()
    if (!ok) return
    askedPause.current = false
    setMenuOpen(false)
  }

  return (
    <section className="room">
      <Field>
        {error ? <p className="banner field-banner">{error}</p> : null}
          {show ? (
            <ShowScreen show={show} hold={menuOpen} />
          ) : (
            <div className={menuOpen ? 'lobby held' : 'lobby'}>
              <div className="lobby-code">
                <p className="eyebrow">Комната</p>
                <CodeTiles code={snapshot.code} compact />
              </div>
              <p className="count lobby-count">
                {online} на связи · {snapshot.players.length} / {snapshot.maxPlayers}
              </p>
              <JoinQr code={snapshot.code} />
              <p className="lede lobby-hint">
                Наведите камеру. Откроется вход, код уже стоит. Останется имя.
              </p>
              {online < 2 ? (
                <p className="lede lobby-need">Нужны хотя бы двое с телефонов.</p>
              ) : null}
              <button
                className="btn btn-primary start-night lobby-start"
                type="button"
                disabled={busy || online < 2}
                onClick={onStart}
              >
                Старт
              </button>
              <PlayerShelf code={snapshot.code} players={snapshot.players} />
            </div>
          )}
          {show?.stage.kind === 'done' ? (
            <div className="credits-actions">
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void restart()}>
                Реванш
              </button>
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void onFresh()}>
                С начала
              </button>
            </div>
          ) : null}
          {menuOpen ? <PauseMenu onClose={closeMenu} onRestart={() => void restart()} /> : null}
      </Field>
    </section>
  )
}

function Field({ children }: { children: ReactNode }) {
  const fitRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const fit = fitRef.current
    if (!fit) return
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0
      const height = entry?.contentRect.height ?? 0
      if (width <= 0 || height <= 0) return
      const next =
        width / height > 16 / 9
          ? { width: height * (16 / 9), height }
          : { width, height: width * (9 / 16) }
      setSize((current) =>
        Math.abs(current.width - next.width) < 0.5 && Math.abs(current.height - next.height) < 0.5
          ? current
          : next,
      )
    })
    observer.observe(fit)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="field-fit" ref={fitRef}>
      <div
        className="field"
        style={size.width > 0 ? { width: size.width, height: size.height } : undefined}
      >
        {children}
      </div>
    </div>
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
  if (snapshot.show) {
    return (
      <>
        {error ? <p className="banner">{error}</p> : null}
        <ShowPhone show={snapshot.show} playerId={playerId} onInput={onInput} />
      </>
    )
  }

  return (
    <section className="panel narrow player-card">
      <p className="eyebrow">Комната {snapshot.code}</p>
      <div className="me-avatar">
        <PlayerAvatar
          id={playerId}
          ghost={snapshot.players.some((player) => player.id === playerId && player.onHh)}
          size={112}
        />
      </div>
      <h1 className="menu-title">{`Ты в штате, ${name}`}</h1>
      <p className="lede">Николай на экране. Когда нажмут Старт, вопрос придёт сюда.</p>
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

