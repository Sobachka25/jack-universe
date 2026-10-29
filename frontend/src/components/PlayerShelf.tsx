import { useState } from 'react'
import { avatarFill } from '../avatar'
import { PlayerAvatar } from './PlayerAvatar'
import { emptyShelf, placeOnShelf, type ShelfLayout } from '../shelf'
import type { PublicPlayer } from '../types'

export function PlayerShelf({ code, players }: { code: string; players: PublicPlayer[] }) {
  const ids = players.map((player) => player.id).join('\0')
  const [storedCode, setStoredCode] = useState(code)
  const [layout, setLayout] = useState<ShelfLayout>(() => readShelf(code))
  const [placedFor, setPlacedFor] = useState<string | null>(null)

  if (storedCode !== code) {
    setStoredCode(code)
    setLayout(readShelf(code))
    setPlacedFor(null)
  } else if (placedFor !== ids) {
    const nextIds = ids ? ids.split('\0') : []
    const next = placeOnShelf(layout, nextIds)
    setPlacedFor(ids)
    if (!sameShelf(layout, next)) {
      writeShelf(code, next)
      setLayout(next)
    }
  }

  const seated = new Map<string, PublicPlayer>()
  for (const player of players) {
    const seat = layout.slots[player.id]
    if (!seat) continue
    seated.set(`${seat.c}:${seat.r}`, player)
  }

  const cells = []
  for (let r = 0; r < layout.rows; r += 1) {
    for (let c = 0; c < layout.cols; c += 1) {
      const player = seated.get(`${c}:${r}`)
      cells.push(
        <li key={`${c}:${r}`} className="cubby" data-seat={`${c}:${r}`}>
          {player ? (
            <div className={player.connected ? 'cubby-player' : 'cubby-player off'}>
              <PlayerAvatar id={player.id} ghost={player.onHh} fit />
              <span className="cubby-name" style={{ color: avatarFill(player.id) }}>
                {player.name}
              </span>
            </div>
          ) : null}
        </li>,
      )
    }
  }

  return (
    <ol
      className="shelf"
      data-cols={layout.cols}
      data-rows={layout.rows}
      style={{
        gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
      }}
      aria-label="Полки игроков"
    >
      {cells}
    </ol>
  )
}

function sameShelf(left: ShelfLayout, right: ShelfLayout) {
  if (left.cols !== right.cols || left.rows !== right.rows) return false
  const ids = Object.keys(left.slots)
  if (ids.length !== Object.keys(right.slots).length) return false
  return ids.every((id) => {
    const a = left.slots[id]
    const b = right.slots[id]
    return a && b && a.c === b.c && a.r === b.r
  })
}

function readShelf(code: string): ShelfLayout {
  try {
    const raw = sessionStorage.getItem(storageKey(code))
    if (!raw) return emptyShelf()
    const parsed = JSON.parse(raw) as ShelfLayout
    if (
      typeof parsed?.cols !== 'number' ||
      typeof parsed?.rows !== 'number' ||
      !parsed.slots ||
      typeof parsed.slots !== 'object'
    ) {
      return emptyShelf()
    }
    return placeOnShelf(parsed, Object.keys(parsed.slots), () => 0)
  } catch {
    return emptyShelf()
  }
}

function writeShelf(code: string, layout: ShelfLayout) {
  try {
    sessionStorage.setItem(storageKey(code), JSON.stringify(layout))
  } catch {
    /* private mode */
  }
}

function storageKey(code: string) {
  return `ju-shelf:${code}`
}
