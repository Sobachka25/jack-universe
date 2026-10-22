import { useEffect, useState } from 'react'
import { Shell } from '../components/Shell'
import { PartyPhone, PartyScreen } from '../components/PartyStage'
import { GAME_MENU } from '../gameMenu'
import { bootLab, type LabReady } from '../labSession'
import { emitAck, emitOn, socket } from '../socket'
import type { GameId, RoomSnapshot } from '../types'

function livingTargets(snapshot: RoomSnapshot) {
  return snapshot.players
    .filter((player) => player.connected && !player.onHh)
    .map((player) => ({ id: player.id, name: player.name }))
}

export function Lab() {
  const [lab, setLab] = useState<LabReady | null>(null)
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [superSnap, setSuperSnap] = useState<RoomSnapshot | null>(null)
  const [ghostSnap, setGhostSnap] = useState<RoomSnapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const onState = (next: RoomSnapshot) => {
      if (!alive) return
      setSnapshot((current) => (current && next.code !== current.code ? current : next))
    }
    socket.on('room:state', onState)
    void bootLab()
      .then((ready) => {
        if (!alive) return
        setLab(ready)
        setSnapshot(ready.snapshot)
      })
      .catch((cause: unknown) => {
        if (!alive) return
        setError(cause instanceof Error ? cause.message : 'Тестовая комната не поднялась')
      })
    return () => {
      alive = false
      socket.off('room:state', onState)
    }
  }, [])

  useEffect(() => {
    if (!lab) return
    const onSuper = (next: RoomSnapshot) => {
      if (next.code === lab.code) setSuperSnap(next)
    }
    const onGhost = (next: RoomSnapshot) => {
      if (next.code === lab.code) setGhostSnap(next)
    }
    lab.player.on('room:state', onSuper)
    lab.ghost.on('room:state', onGhost)
    return () => {
      lab.player.off('room:state', onSuper)
      lab.ghost.off('room:state', onGhost)
    }
  }, [lab])

  async function arm(gameId: GameId) {
    setBusy(true)
    setError('')
    try {
      const response = await emitAck<{ snapshot: RoomSnapshot }>('room:arm', { gameId })
      if (!response.ok) setError(response.message)
      else setSnapshot(response.snapshot)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось запустить')
    } finally {
      setBusy(false)
    }
  }

  async function replay() {
    setBusy(true)
    setError('')
    try {
      const response = await emitAck<{ snapshot: RoomSnapshot }>('room:replay')
      if (!response.ok) setError(response.message)
      else setSnapshot(response.snapshot)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось перезапустить')
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setBusy(true)
    setError('')
    try {
      const response = await emitAck<{ snapshot: RoomSnapshot }>('room:stop-game')
      if (!response.ok) setError(response.message)
      else setSnapshot(response.snapshot)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось закрыть раунд')
    } finally {
      setBusy(false)
    }
  }

  const activity = snapshot?.activity ?? null

  return (
    <Shell>
      <section className="lab">
        <p className="eyebrow">Суперпользователь</p>
        <h1 className="menu-title">Тестовый пульт</h1>
        <p className="lede">
          {snapshot
            ? `Комната ${snapshot.code}. Супер в штате, Призрак уже на hh. «Ещё раз» возвращает Супера и оставляет Призрака подкладывать.`
            : 'Поднимаем комнату и сажаем в неё Супера.'}
        </p>
        {error ? <p className="banner">{error}</p> : null}
        <div className="lab-bar">
          {GAME_MENU.map((game) => (
            <button
              key={game.id}
              type="button"
              className="btn btn-ghost"
              disabled={!game.ready || busy || !snapshot}
              onClick={() => void arm(game.id)}
            >
              {game.title}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !activity}
            onClick={() => void replay()}
          >
            Ещё раз
          </button>
        </div>
        {activity && snapshot ? (
          <div className="lab-layout">
            <PartyScreen
              activity={activity}
              busy={busy}
              onStart={() => void replay()}
              onStop={() => void stop()}
            />
            <div className="lab-phones">
              <PartyPhone
                activity={superSnap?.activity ?? activity}
                playerId={lab?.playerId ?? ''}
                onHh={false}
                targets={[]}
                onInput={(input) => {
                  if (!lab) return
                  void emitOn(lab.player, 'game:input', input).then((response) => {
                    if (!response.ok) setError(response.message)
                  })
                }}
              />
              <PartyPhone
                activity={ghostSnap?.activity ?? activity}
                playerId={lab?.ghostId ?? ''}
                onHh
                targets={livingTargets(ghostSnap ?? snapshot)}
                onInput={(input) => {
                  if (!lab) return
                  void emitOn(lab.ghost, 'game:input', input).then((response) => {
                    if (!response.ok) setError(response.message)
                  })
                }}
              />
            </div>
          </div>
        ) : null}
      </section>
    </Shell>
  )
}
