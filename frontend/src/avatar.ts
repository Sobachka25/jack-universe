const FILLS = ['#f0a35e', '#f48fb1', '#8eb6ff', '#7dcea0', '#f2c14e', '#e07a5f', '#c9a0dc', '#6ec8d4']

export function avatarFill(id: string) {
  return FILLS[hash(id, 2) % FILLS.length] ?? FILLS[0]
}

export function avatarShape(id: string, count: number) {
  return hash(id, 1) % count
}

function hash(id: string, seed: number) {
  let value = 2166136261 ^ seed
  for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619)
  return value >>> 0
}
