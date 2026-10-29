export async function phoneJoinUrl(code: string): Promise<string> {
  const origin = await phoneOrigin()
  return `${origin}/join/${code}`
}

async function phoneOrigin(): Promise<string> {
  const host = window.location.hostname
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
    return window.location.origin
  }
  try {
    const response = await fetch('/lan')
    if (!response.ok) return window.location.origin
    const body = (await response.json()) as { host?: string | null }
    if (!body.host) return window.location.origin
    const port = window.location.port
    return `${window.location.protocol}//${body.host}${port ? `:${port}` : ''}`
  } catch {
    return window.location.origin
  }
}
