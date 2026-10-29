import { audioPrefs, saveAudioPrefs } from './audioPrefs'

export type MusicScene = 'lobby' | 'question' | 'finale' | 'credits' | 'off'

const MUSIC_VERSION = 10
const BED_URL = '/music/background.mp3'
const QUESTION_URL = '/music/question.mp3'
const FINALE_URL = '/music/finale.mp3'
const CREDITS_URL = '/music/credits.mp3'
const FADE_SEC = 0.7
const DUCK_LEVEL = 0.15
const DUCK_IN_SEC = 0.25
const DUCK_OUT_SEC = 0.6

const scope = globalThis as typeof globalThis & { __juMusic?: RoomMusic }

export function primeRoomMusic() {
  engine().start('lobby')
}

export function setMusicVolume(value: number) {
  const music = saveAudioPrefs({ music: value }).music
  engine().applyMusicVolume(music)
}

export function setVoiceVolume(value: number) {
  const voice = saveAudioPrefs({ voice: value }).voice
  engine().applyVoiceVolume(voice)
}

export function setRoomMusic(scene: MusicScene, paused: boolean) {
  const music = engine()
  music.setPaused(paused)
  music.start(scene)
}

export function playVoice(file: string, key: string) {
  engine().voice(`/voice/questions/${encodeURIComponent(file)}`, key)
}

/** Plays /voice/<category>/<file> right away; protected lines are never cut. */
export function playVoiceLine(category: VoiceCategory | 'briefing', file: string, key: string, protect = false) {
  engine().voice(`/voice/${category}/${encodeURIComponent(file)}`, key, protect)
}

export type VoiceCategory = 'intro' | 'countdown' | 'answer' | 'other'

let manifest: Promise<Partial<Record<VoiceCategory, string[]>>> | null = null

function voiceManifest() {
  manifest ??= fetch('/voice-lines')
    .then((response) => (response.ok ? (response.json() as Promise<Partial<Record<VoiceCategory, string[]>>>) : {}))
    .catch(() => ({}))
  return manifest
}

/** protect: the line plays to the end; other voices wait for it. */
export function playLine(category: VoiceCategory, key: string, file?: string, protect = false) {
  void voiceManifest().then((lines) => {
    const files = lines[category] ?? []
    const pick = file ? files.find((name) => name === file) : files[Math.floor(Math.random() * files.length)]
    if (!pick) return
    engine().voice(`/voice/${category}/${encodeURIComponent(pick)}`, key, protect)
  })
}

export function stopVoice() {
  engine().silence()
}

export function playScream(key: string) {
  engine().scream(key)
}

function engine(): RoomMusic {
  if (scope.__juMusic?.version !== MUSIC_VERSION) {
    scope.__juMusic?.stop()
    scope.__juMusic = new RoomMusic()
  }
  return scope.__juMusic
}

class RoomMusic {
  readonly version = MUSIC_VERSION
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private duckGain: GainNode | null = null
  private guarded = false
  private queued: (() => void) | null = null
  private voiceGain: GainNode | null = null
  private bedGain: GainNode | null = null
  private questionGain: GainNode | null = null
  private finaleGain: GainNode | null = null
  private creditsGain: GainNode | null = null
  private scene: MusicScene = 'off'
  private paused = false
  private musicVolume = audioPrefs().music
  private voiceVolume = audioPrefs().voice
  private bedState: TrackState = 'loading'
  private questionState: TrackState = 'loading'
  private finaleState: TrackState = 'loading'
  private creditsState: TrackState = 'loading'
  private lastScream = ''
  private lastVoice = ''
  private voiceSource: AudioBufferSourceNode | null = null
  private voiceCache = new Map<string, Promise<AudioBuffer>>()

  start(scene: MusicScene) {
    const ctx = this.ensure()
    if (!this.paused) void ctx.resume().then(() => this.mark())
    if (scene === this.scene) return
    this.scene = scene
    const now = ctx.currentTime
    fade(this.bedGain, scene === 'lobby' ? 1 : 0, now)
    fade(this.questionGain, scene === 'question' ? 1 : 0, now)
    fade(this.finaleGain, scene === 'finale' ? 1 : 0, now)
    fade(this.creditsGain, scene === 'credits' ? 1 : 0, now)
    this.mark()
  }

  applyMusicVolume(value: number) {
    this.musicVolume = value
    if (!this.master || !this.ctx) return
    this.master.gain.setValueAtTime(value, this.ctx.currentTime)
  }

  applyVoiceVolume(value: number) {
    this.voiceVolume = value
    if (!this.voiceGain || !this.ctx) return
    this.voiceGain.gain.setValueAtTime(value, this.ctx.currentTime)
  }

  voice(url: string, key: string, protect = false) {
    if (this.lastVoice === key) return
    this.lastVoice = key
    const ctx = this.ensure()
    let pending = this.voiceCache.get(url)
    if (!pending) {
      pending = fetch(url).then(async (response) => {
        if (!response.ok) throw new Error(`${response.status} ${url}`)
        return ctx.decodeAudioData(await response.arrayBuffer())
      })
      this.voiceCache.set(url, pending)
    }
    const play = (own = false) => {
      pending
        .then((buffer) => {
          if (this.ctx !== ctx || !this.voiceGain) {
            if (own) this.release()
            return
          }
          // a protected line holds the channel: it must play even if a newer voice was requested
          // behind it (that one waits in the queue), otherwise the guard never releases
          if (!own && this.lastVoice !== key) return
          if (this.guarded && !own) {
            this.queued = play
            return
          }
          if (!own) this.silence()
          const source = ctx.createBufferSource()
          source.buffer = buffer
          source.connect(this.voiceGain)
          source.onended = () => this.ended(source)
          source.start()
          this.voiceSource = source
          this.guarded = protect
          this.duck(true)
        })
        .catch((error) => {
          this.voiceCache.delete(url)
          console.warn('voice not played', error)
          if (own) this.release()
        })
    }
    if (protect && !this.guarded) {
      // claim the channel now so voices requested meanwhile queue behind this line
      this.silence(true)
      this.guarded = true
      play(true)
    } else if (this.guarded) this.queued = play
    else play()
  }

  /** Stops the current voice unless it is a protected line (then only drops the queue). */
  silence(force = false) {
    this.queued = null
    if (this.guarded && !force) return
    const source = this.voiceSource
    this.voiceSource = null
    this.guarded = false
    try {
      source?.stop()
    } catch {
      // already stopped
    }
    this.duck(false)
  }

  private ended(source: AudioBufferSourceNode) {
    if (this.voiceSource !== source) return
    this.voiceSource = null
    this.release()
  }

  private release() {
    this.guarded = false
    const next = this.queued
    this.queued = null
    if (next) next()
    else this.duck(false)
  }

  private duck(on: boolean) {
    const ctx = this.ctx
    const gain = this.duckGain
    if (!ctx || !gain) return
    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(on ? DUCK_LEVEL : 1, now + (on ? DUCK_IN_SEC : DUCK_OUT_SEC))
  }

  scream(key: string) {
    if (this.paused || this.lastScream === key) return
    const ctx = this.ensure()
    this.lastScream = key
    void ctx.resume().then(() => this.mark())
    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.45)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.9)
    gain.connect(this.master ?? ctx.destination)

    const tone = ctx.createOscillator()
    tone.type = 'sawtooth'
    tone.frequency.setValueAtTime(720, now)
    tone.frequency.exponentialRampToValueAtTime(160, now + 1.7)
    tone.connect(gain)
    tone.start(now)
    tone.stop(now + 2)

    const edge = ctx.createOscillator()
    edge.type = 'square'
    edge.frequency.setValueAtTime(980, now)
    edge.frequency.exponentialRampToValueAtTime(210, now + 1.2)
    edge.connect(gain)
    edge.start(now)
    edge.stop(now + 1.6)

    const length = Math.floor(ctx.sampleRate * 2)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 5
    filter.frequency.setValueAtTime(1600, now)
    filter.frequency.exponentialRampToValueAtTime(280, now + 1.6)
    noise.connect(filter)
    filter.connect(gain)
    noise.start(now)
    noise.stop(now + 2)
  }

  setPaused(paused: boolean) {
    this.paused = paused
    const ctx = this.ctx
    if (!ctx) return
    if (paused) void ctx.suspend().then(() => this.mark())
    else void ctx.resume().then(() => this.mark())
  }

  stop() {
    void this.ctx?.close()
    this.ctx = null
    this.master = null
    this.voiceGain = null
    this.voiceSource = null
    this.duckGain = null
    this.guarded = false
    this.queued = null
    this.voiceCache.clear()
    this.lastVoice = ''
    this.bedGain = null
    this.questionGain = null
    this.finaleGain = null
    this.creditsGain = null
    this.bedState = 'loading'
    this.questionState = 'loading'
    this.finaleState = 'loading'
    this.creditsState = 'loading'
    this.scene = 'off'
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx
    const ctx = new AudioContext()
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = this.musicVolume
    const duck = ctx.createGain()
    duck.gain.value = 1
    duck.connect(ctx.destination)
    this.duckGain = duck
    master.connect(duck)
    this.master = master
    const voice = ctx.createGain()
    voice.gain.value = this.voiceVolume
    voice.connect(ctx.destination)
    this.voiceGain = voice
    const bed = ctx.createGain()
    const question = ctx.createGain()
    const finale = ctx.createGain()
    const credits = ctx.createGain()
    bed.gain.value = 0
    question.gain.value = 0
    finale.gain.value = 0
    credits.gain.value = 0
    bed.connect(master)
    question.connect(master)
    finale.connect(master)
    credits.connect(master)
    this.bedGain = bed
    this.questionGain = question
    this.finaleGain = finale
    this.creditsGain = credits
    void this.loadLoop(ctx, bed, BED_URL, 'bed')
    void this.loadLoop(ctx, question, QUESTION_URL, 'question')
    void this.loadLoop(ctx, finale, FINALE_URL, 'finale')
    void this.loadLoop(ctx, credits, CREDITS_URL, 'credits')
    this.mark()
    return ctx
  }

  private async loadLoop(
    ctx: AudioContext,
    dest: GainNode,
    url: string,
    track: 'bed' | 'question' | 'finale' | 'credits',
  ) {
    const stateKey =
      track === 'bed'
        ? 'bedState'
        : track === 'question'
          ? 'questionState'
          : track === 'finale'
            ? 'finaleState'
            : 'creditsState'
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(String(response.status))
      const audio = await ctx.decodeAudioData(await response.arrayBuffer())
      if (this.ctx !== ctx || this[stateKey] === 'ready') return
      const source = ctx.createBufferSource()
      source.buffer = audio
      source.loop = true
      source.connect(dest)
      source.start()
      this[stateKey] = 'ready'
      this.mark()
    } catch {
      this[stateKey] = 'error'
      this.mark()
    }
  }

  private mark() {
    if (!this.ctx || typeof document === 'undefined') return
    document.documentElement.dataset.music = this.scene
    document.documentElement.dataset.musicState = this.ctx.state
    document.documentElement.dataset.musicTime = this.ctx.currentTime.toFixed(2)
    document.documentElement.dataset.musicBed = this.bedState
    document.documentElement.dataset.musicQuestion = this.questionState
    document.documentElement.dataset.musicFinale = this.finaleState
    document.documentElement.dataset.musicCredits = this.creditsState
  }
}

type TrackState = 'loading' | 'ready' | 'error'

function fade(gain: GainNode | null, value: number, now: number) {
  if (!gain) return
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(value, now + FADE_SEC)
}
