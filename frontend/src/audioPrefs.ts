const KEY = 'ju-audio'

export type AudioPrefs = {
  music: number
  voice: number
}

const DEFAULTS: AudioPrefs = { music: 0.7, voice: 1 }

export function audioPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>
    return {
      music: clamp(parsed.music, DEFAULTS.music),
      voice: clamp(parsed.voice, DEFAULTS.voice),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveAudioPrefs(partial: Partial<AudioPrefs>): AudioPrefs {
  const next = { ...audioPrefs(), ...partial }
  next.music = clamp(next.music, DEFAULTS.music)
  next.voice = clamp(next.voice, DEFAULTS.voice)
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

function clamp(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(1, Math.max(0, value))
}
