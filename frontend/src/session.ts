const screenKey = (code: string) => `ju.screen.${code}`
const playerKey = (code: string) => `ju.player.${code}`

export interface PlayerSession {
  token: string
  playerId: string
  name: string
}

export function saveScreen(code: string, token: string) {
  sessionStorage.setItem(screenKey(code), token)
}

export function loadScreen(code: string) {
  return sessionStorage.getItem(screenKey(code))
}

export function clearScreen(code: string) {
  sessionStorage.removeItem(screenKey(code))
}

export function savePlayer(code: string, session: PlayerSession) {
  sessionStorage.setItem(playerKey(code), JSON.stringify(session))
}

export function loadPlayer(code: string): PlayerSession | null {
  const raw = sessionStorage.getItem(playerKey(code))
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const session = parsed as Partial<PlayerSession>
    if (!session.token || !session.playerId || !session.name) return null
    return {
      token: session.token,
      playerId: session.playerId,
      name: session.name,
    }
  } catch {
    return null
  }
}

export function clearPlayer(code: string) {
  sessionStorage.removeItem(playerKey(code))
}

export function clearRoomSession(code: string) {
  clearScreen(code)
  clearPlayer(code)
}
