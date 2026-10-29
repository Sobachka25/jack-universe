export type Seat = { c: number; r: number }

export type ShelfLayout = {
  cols: number
  rows: number
  slots: Record<string, Seat>
}

export const SHELF_COLS = 4
export const SHELF_ROWS = 3

export function emptyShelf(): ShelfLayout {
  return { cols: SHELF_COLS, rows: SHELF_ROWS, slots: {} }
}

export function placeOnShelf(
  prev: ShelfLayout,
  ids: readonly string[],
  random: () => number = Math.random,
): ShelfLayout {
  if (ids.length === 0) return emptyShelf()
  const present = new Set(ids)
  const slots: Record<string, Seat> = {}
  for (const [id, seat] of Object.entries(prev.slots)) {
    if (present.has(id) && isSeat(seat)) slots[id] = { c: seat.c, r: seat.r }
  }

  let cols = Math.max(SHELF_COLS, prev.cols || SHELF_COLS)
  let rows = Math.max(SHELF_ROWS, prev.rows || SHELF_ROWS)
  for (const seat of Object.values(slots)) {
    cols = Math.max(cols, seat.c + 1)
    rows = Math.max(rows, seat.r + 1)
  }

  const newcomers = ids.filter((id) => slots[id] === undefined)
  for (const id of newcomers) {
    let free = freeSeats(cols, rows, slots)
    if (free.length === 0) {
      if (rows <= cols) rows += 1
      else cols += 1
      free = freeSeats(cols, rows, slots)
    }
    const index = Math.min(free.length - 1, Math.floor(random() * free.length))
    slots[id] = free[index] ?? { c: 0, r: 0 }
  }

  return { cols, rows, slots }
}

function freeSeats(cols: number, rows: number, slots: Record<string, Seat>) {
  const used = new Set(Object.values(slots).map((seat) => `${seat.c}:${seat.r}`))
  const free: Seat[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!used.has(`${c}:${r}`)) free.push({ c, r })
    }
  }
  return free
}

function isSeat(value: unknown): value is Seat {
  if (!value || typeof value !== 'object') return false
  const seat = value as Seat
  return Number.isInteger(seat.c) && seat.c >= 0 && Number.isInteger(seat.r) && seat.r >= 0
}
