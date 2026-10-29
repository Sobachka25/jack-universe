import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shell } from '../components/Shell'
import { PauseMenu } from '../components/PauseMenu'
import { primeRoomMusic, setRoomMusic } from '../roomMusic'
import { saveScreen } from '../session'
import { emitAck } from '../socket'
import type { RoomSnapshot } from '../types'

type Created = {
  role: 'screen'
  code: string
  screenToken: string
  snapshot: RoomSnapshot
}

export function Home() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setRoomMusic('lobby', menuOpen)
    function unlock() {
      setRoomMusic('lobby', menuOpen)
    }
    window.addEventListener('pointerdown', unlock)
    return () => window.removeEventListener('pointerdown', unlock)
  }, [menuOpen])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.repeat) return
      event.preventDefault()
      setMenuOpen((open) => !open)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      setRoomMusic('off', false)
    }
  }, [])

  async function createRoom() {
    primeRoomMusic()
    setBusy(true)
    setError('')
    try {
      const response = await emitAck<Created>('room:create')
      if (!response.ok) {
        setError(response.message)
        setBusy(false)
        return
      }
      saveScreen(response.code, response.screenToken)
      navigate(`/room/${response.code}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать комнату')
      setBusy(false)
    }
  }

  return (
    <Shell>
      <section className="hero">
        <p className="eyebrow">Вечеринка на одном экране</p>
        <h1>
          Комната на всех,
          <br />
          пульты в кармане.
        </h1>
        <p className="lede">
          Телевизор ведёт вечер. Телефоны отвечают. Николай сам читает вопросы и
          сам отправляет промахнувшихся на наказание.
        </p>
        <div className="actions">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void createRoom()}>
            {busy ? 'Создаём…' : 'Экран комнаты'}
          </button>
          <Link className="btn btn-ghost" to="/join">
            Я с телефона
          </Link>
          <Link className="btn btn-ghost" to="/lab">
            Тестовый режим
          </Link>
        </div>
        {error ? <p className="banner">{error}</p> : null}
        {menuOpen ? <PauseMenu onClose={() => setMenuOpen(false)} /> : null}
      </section>
    </Shell>
  )
}
