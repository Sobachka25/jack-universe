import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useSocketConnected } from '../socket'

export function Shell({ children, home = true }: { children: ReactNode; home?: boolean }) {
  const connected = useSocketConnected()

  return (
    <div className="shell">
      <header className="topbar">
        {home ? (
          <Link to="/" className="brand">
            Jack Universe
          </Link>
        ) : (
          <span className="brand">Jack Universe</span>
        )}
        <span className={connected ? 'pill ok' : 'pill'}>
          {connected ? 'на связи' : 'нет связи'}
        </span>
      </header>
      <main className="stage-wrap">{children}</main>
    </div>
  )
}
