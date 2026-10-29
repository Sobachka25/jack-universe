import { useState } from 'react'
import { audioPrefs } from '../audioPrefs'
import { setMusicVolume, setVoiceVolume } from '../roomMusic'

export function PauseMenu({
  onClose,
  onRestart,
}: {
  onClose: () => void
  onRestart?: () => void
}) {
  const initial = audioPrefs()
  const [music, setMusic] = useState(initial.music)
  const [voice, setVoice] = useState(initial.voice)

  return (
    <div className="pause-layer" role="dialog" aria-modal="true" aria-label="Пауза">
      <div className="pause-card">
        <button className="pause-x" type="button" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">Пауза</p>
        <label className="pause-slider">
          <span>
            Музыка <b>{Math.round(music * 100)}</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(music * 100)}
            onChange={(event) => {
              const next = Number(event.target.value) / 100
              setMusic(next)
              setMusicVolume(next)
            }}
          />
        </label>
        <label className="pause-slider">
          <span>
            Голос ведущего <b>{Math.round(voice * 100)}</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(voice * 100)}
            onChange={(event) => {
              const next = Number(event.target.value) / 100
              setVoice(next)
              setVoiceVolume(next)
            }}
          />
        </label>
        {onRestart ? (
          <button className="btn btn-ghost" type="button" onClick={onRestart}>
            Перезапустить сессию
          </button>
        ) : null}
      </div>
    </div>
  )
}
