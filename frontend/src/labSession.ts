import type { Socket } from 'socket.io-client'
import { createSocket, emitAck, emitOn } from './socket'
import type { RoomSnapshot } from './types'

export interface LabReady {
  code: string
  playerId: string
  player: Socket
  ghostId: string
  ghost: Socket
  snapshot: RoomSnapshot
}

type Created = {
  role: 'screen'
  code: string
  screenToken: string
  snapshot: RoomSnapshot
}

type Joined = {
  role: 'player'
  playerId: string
  playerToken: string
  name: string
  snapshot: RoomSnapshot
}

const scope = globalThis as typeof globalThis & { __juLab?: Promise<LabReady> }

export function bootLab(): Promise<LabReady> {
  if (!scope.__juLab) {
    scope.__juLab = startLab().catch((error: unknown) => {
      scope.__juLab = undefined
      throw error
    })
  }
  return scope.__juLab
}

async function startLab(): Promise<LabReady> {
  const created = await emitAck<Created>('room:create')
  if (!created.ok) throw new Error(created.message)
  const player = createSocket()
  await waitConnect(player)
  const joined = await emitOn<Joined>(player, 'room:join', {
    code: created.code,
    name: 'Супер',
  })
  if (!joined.ok) throw new Error(joined.message)
  const ghostSocket = createSocket()
  await waitConnect(ghostSocket)
  const ghost = await emitOn<Joined>(ghostSocket, 'room:join', {
    code: created.code,
    name: 'Призрак',
  })
  if (!ghost.ok) throw new Error(ghost.message)
  const pinned = await emitAck<{ snapshot: RoomSnapshot }>('room:pin-hh', {
    playerId: ghost.playerId,
  })
  if (!pinned.ok) throw new Error(pinned.message)
  return {
    code: created.code,
    playerId: joined.playerId,
    player,
    ghostId: ghost.playerId,
    ghost: ghostSocket,
    snapshot: pinned.snapshot,
  }
}

function waitConnect(player: Socket): Promise<void> {
  if (player.connected) return Promise.resolve()
  player.connect()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('Не удалось подключиться к серверу'))
    }, 8000)
    player.once('connect', () => {
      window.clearTimeout(timer)
      resolve()
    })
  })
}
