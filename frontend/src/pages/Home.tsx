import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shell } from '../components/Shell'
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

  async function createRoom() {
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
          Телевизор держит комнату. Телефоны заходят по короткому коду. Сотня
          человек в одном лобби — мини-игры подключим следом, на эту же сцену.
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
      </section>
    </Shell>
  )
}
