import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Shell } from '../components/Shell'

export function Join() {
  const navigate = useNavigate()
  const params = useParams()
  const paramCode = params.code?.toUpperCase() ?? ''
  const [code, setCode] = useState(paramCode)
  const [seenCode, setSeenCode] = useState(paramCode)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  if (paramCode !== seenCode) {
    setSeenCode(paramCode)
    setCode(paramCode)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const nextCode = code.trim().toUpperCase().replace(/\s+/g, '')
    const nextName = name.trim().replace(/\s+/g, ' ')
    if (nextCode.length !== 4) {
      setError('Код комнаты — 4 символа')
      return
    }
    if ([...nextName].length === 0) {
      setError('Введите имя')
      return
    }
    if ([...nextName].length > 20) {
      setError('Имя длиннее 20 символов')
      return
    }
    navigate(`/room/${nextCode}?name=${encodeURIComponent(nextName)}`)
  }

  return (
    <Shell>
      <section className="panel narrow">
        <p className="eyebrow">Вход с телефона</p>
        <h1>Как тебя показать на экране?</h1>
        <form className="form" onSubmit={submit}>
          <label>
            Код комнаты
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={4}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="A7KQ"
            />
          </label>
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
          <button className="btn btn-primary" type="submit">
            Войти в комнату
          </button>
        </form>
      </section>
    </Shell>
  )
}
