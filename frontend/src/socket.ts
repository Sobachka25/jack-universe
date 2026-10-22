import { io, type Socket } from 'socket.io-client'
import { useEffect, useState } from 'react'

const scope = globalThis as typeof globalThis & { __juSocket?: Socket }

function socketTarget(): string | undefined {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3000`
  }
  return undefined
}

const target = socketTarget()

export function createSocket(): Socket {
  const options: { autoConnect: false; transports?: Array<'polling' | 'websocket'> } = {
    autoConnect: false,
  }
  if (import.meta.env.DEV) options.transports = ['websocket']
  return target ? io(target, options) : io(options)
}

export const socket: Socket = scope.__juSocket ?? createSocket()

if (!scope.__juSocket) {
  scope.__juSocket = socket
  socket.connect()
}

export type Ack<T> = ({ ok: true } & T) | { ok: false; message: string }

export function ensureConnected(): Promise<void> {
  if (socket.connected) return Promise.resolve()
  socket.connect()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('Не удалось подключиться к серверу'))
    }, 8000)
    socket.once('connect', () => {
      window.clearTimeout(timer)
      resolve()
    })
  })
}

export function emitOn<T>(
  targetSocket: Socket,
  event: string,
  payload: object = {},
): Promise<Ack<T>> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('Сервер не ответил'))
    }, 8000)
    targetSocket.emit(event, payload, (response: Ack<T>) => {
      window.clearTimeout(timer)
      resolve(response)
    })
  })
}

export async function emitAck<T>(
  event: string,
  payload: object = {},
): Promise<Ack<T>> {
  await ensureConnected()
  return emitOn<T>(socket, event, payload)
}

export function useSocketConnected(): boolean {
  const [connected, setConnected] = useState(socket.connected)

  useEffect(() => {
    const up = () => setConnected(true)
    const down = () => setConnected(false)
    socket.on('connect', up)
    socket.on('disconnect', down)
    return () => {
      socket.off('connect', up)
      socket.off('disconnect', down)
    }
  }, [])

  return connected
}
