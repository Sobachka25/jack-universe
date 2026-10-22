export type RoomPhase = 'lobby' | 'live'
export type GameId =
  | 'server-balance'
  | 'friday-release'
  | 'night-pager'
  | 'red-button'
  | 'alert-repeat'
  | 'code-review'

export interface PublicPlayer {
  id: string
  name: string
  connected: boolean
  onHh: boolean
}

export interface HostLine {
  id: string
  text: string
}

export interface RackView {
  playerId: string
  name: string
  angle: number
  score: number
  alive: boolean
  heavy: boolean
}

export type HauntKind = 'weight' | 'window' | 'band' | 'seal' | 'swap'

export interface HauntView {
  ghostId: string
  ghostName: string
  targetId: string
  targetName: string
  kind: HauntKind
  text: string
}

export interface SentPlayer {
  playerId: string
  name: string
}

interface ActivityBase {
  gameId: GameId
  title: string
  line: HostLine
}

export type ActivitySnapshot =
  | (ActivityBase & { status: 'briefing'; blurb: string })
  | (ActivityBase & {
      status: 'play'
      gameId: 'server-balance'
      serverNow: number
      endsAt: number
      wind: number
      racks: RackView[]
      haunts: HauntView[]
    })
  | (ActivityBase & {
      status: 'play'
      gameId: 'friday-release'
      serverNow: number
      startedAt: number
      endsAt: number
      periodMs: number
      greenCenter: number
      greenHalf: number
      tapped: string[]
      haunts: HauntView[]
    })
  | (ActivityBase & {
      status: 'play'
      gameId: 'night-pager'
      serverNow: number
      endsAt: number
      locked: string[]
      wideZone: boolean
      haunts: HauntView[]
    })
  | (ActivityBase & {
      status: 'play'
      gameId: 'red-button'
      serverNow: number
      endsAt: number
      options: string[]
      locked: string[]
      sealedIndex: number | null
      haunts: HauntView[]
    })
  | (ActivityBase & {
      status: 'play'
      gameId: 'alert-repeat'
      serverNow: number
      revealUntil: number
      endsAt: number
      sequence: string[]
      icons: string[]
      locked: string[]
      haunts: HauntView[]
    })
  | (ActivityBase & { status: 'result'; sentToHh: SentPlayer[] })

export interface RoomSnapshot {
  code: string
  phase: RoomPhase
  maxPlayers: number
  players: PublicPlayer[]
  screenConnected: boolean
  activity: ActivitySnapshot | null
}

export type RoomRole = 'screen' | 'player' | 'guest'

export interface GameInput {
  hold?: 'left' | 'right' | 'none'
  choice?: number
  sequence?: string[]
  hauntTargetId?: string
}
