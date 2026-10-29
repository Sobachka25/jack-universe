import { avatarFill, avatarShape } from '../avatar'

const INK = '#24170f'
const CREAM = '#f6f1ea'

export function PlayerAvatar({
  id,
  ghost = false,
  size = 56,
  fit = false,
}: {
  id: string
  ghost?: boolean
  size?: number
  fit?: boolean
}) {
  const shape = avatarShape(id, FACES.length)
  const Face = FACES[shape] ?? Owl
  return (
    <span
      className={ghost ? 'avatar ghost' : 'avatar'}
      style={{ ...(fit ? {} : { width: size, height: size }), ...motionStyle(id, ghost) }}
      aria-hidden="true"
    >
      <Face fill={avatarFill(id)} />
    </span>
  )
}

function Owl({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 64 64">
      <path d="M16 28 L22 12 L30 24" fill={fill} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M48 28 L42 12 L34 24" fill={fill} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="32" cy="38" rx="20" ry="18" fill={fill} stroke={INK} strokeWidth="2.5" />
      <circle cx="24" cy="36" r="7" fill={CREAM} stroke={INK} strokeWidth="2" />
      <circle cx="40" cy="36" r="7" fill={CREAM} stroke={INK} strokeWidth="2" />
      <circle cx="25" cy="37" r="3" fill={INK} />
      <circle cx="41" cy="37" r="3" fill={INK} />
      <path d="M28 46 h8" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Mushroom({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 64 64">
      <rect x="26" y="32" width="12" height="20" rx="6" fill={CREAM} stroke={INK} strokeWidth="2.5" />
      <path d="M10 36 Q32 6 54 36 Z" fill={fill} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="24" cy="28" r="3" fill={CREAM} />
      <circle cx="38" cy="24" r="4" fill={CREAM} />
      <circle cx="27" cy="40" r="2" fill={INK} />
      <circle cx="37" cy="40" r="2" fill={INK} />
      <path d="M28 46 Q32 49 36 46" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Cat({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 64 64">
      <path d="M14 30 L18 12 L28 26" fill={fill} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M50 30 L46 12 L36 26" fill={fill} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="32" cy="38" r="18" fill={fill} stroke={INK} strokeWidth="2.5" />
      <circle cx="25" cy="36" r="2.4" fill={INK} />
      <circle cx="39" cy="36" r="2.4" fill={INK} />
      <path d="M32 40 v4" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M26 46 Q32 50 38 46" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 40 h8 M44 40 h8 M14 46 h6 M44 46 h6" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function Mug({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 64 64">
      <path d="M44 28 h6 a8 8 0 0 1 0 16 h-6" fill="none" stroke={INK} strokeWidth="2.5" />
      <rect x="14" y="22" width="32" height="28" rx="8" fill={fill} stroke={INK} strokeWidth="2.5" />
      <path d="M24 14 q4 6 0 10 M32 12 q4 6 0 10" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <circle cx="26" cy="36" r="2.2" fill={INK} />
      <circle cx="38" cy="36" r="2.2" fill={INK} />
      <path d="M28 42 h8" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Planet({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 64 64">
      <ellipse cx="32" cy="34" rx="26" ry="8" fill="none" stroke={INK} strokeWidth="2.5" />
      <circle cx="32" cy="34" r="14" fill={fill} stroke={INK} strokeWidth="2.5" />
      <circle cx="27" cy="32" r="2" fill={INK} />
      <circle cx="36" cy="32" r="2" fill={INK} />
      <path d="M28 39 Q32 42 36 39" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Pickle({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 64 64">
      <rect x="20" y="8" width="24" height="48" rx="12" fill={fill} stroke={INK} strokeWidth="2.5" />
      <circle cx="20" cy="24" r="3" fill={fill} stroke={INK} strokeWidth="2" />
      <circle cx="44" cy="34" r="3" fill={fill} stroke={INK} strokeWidth="2" />
      <circle cx="22" cy="44" r="3" fill={fill} stroke={INK} strokeWidth="2" />
      <circle cx="28" cy="28" r="2" fill={INK} />
      <circle cx="38" cy="28" r="2" fill={INK} />
      <path d="M28 36 Q32 40 36 36" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Cheese({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 64 64">
      <polygon points="8,50 32,10 56,50" fill={fill} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="28" cy="36" r="3.5" fill={CREAM} stroke={INK} strokeWidth="1.5" />
      <circle cx="40" cy="42" r="2.5" fill={CREAM} stroke={INK} strokeWidth="1.5" />
      <circle cx="26" cy="32" r="1.6" fill={INK} />
      <circle cx="36" cy="32" r="1.6" fill={INK} />
      <path d="M28 40 h6" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Bulb({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 64 64">
      <rect x="26" y="46" width="12" height="8" rx="2" fill={CREAM} stroke={INK} strokeWidth="2.5" />
      <circle cx="32" cy="30" r="16" fill={fill} stroke={INK} strokeWidth="2.5" />
      <circle cx="26" cy="28" r="2.2" fill={INK} />
      <circle cx="38" cy="28" r="2.2" fill={INK} />
      <path d="M27 36 Q32 40 37 36" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Cloud({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 64 64">
      <path
        d="M16 42 Q8 42 10 34 Q8 24 20 24 Q24 14 36 18 Q48 12 52 24 Q62 26 58 38 Q58 48 44 46 Q32 52 18 46 Z"
        fill={fill}
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M24 30 l4 6 h-3 l4 7" fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="36" cy="32" r="2" fill={INK} />
      <circle cx="46" cy="32" r="2" fill={INK} />
      <path d="M38 40 h8" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Frog({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 64 64">
      <ellipse cx="32" cy="40" rx="20" ry="14" fill={fill} stroke={INK} strokeWidth="2.5" />
      <circle cx="20" cy="26" r="8" fill={fill} stroke={INK} strokeWidth="2.5" />
      <circle cx="44" cy="26" r="8" fill={fill} stroke={INK} strokeWidth="2.5" />
      <circle cx="20" cy="26" r="3" fill={INK} />
      <circle cx="44" cy="26" r="3" fill={INK} />
      <path d="M22 42 Q32 50 42 42" fill={CREAM} stroke={INK} strokeWidth="2" />
    </svg>
  )
}

function Rocket({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 64 64">
      <polygon points="32,6 46,28 18,28" fill={fill} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="20" y="26" width="24" height="22" rx="8" fill={fill} stroke={INK} strokeWidth="2.5" />
      <circle cx="32" cy="36" r="5" fill={CREAM} stroke={INK} strokeWidth="2" />
      <circle cx="32" cy="36" r="2" fill={INK} />
      <path d="M20 40 L12 50 L24 46" fill="#e07a5f" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M44 40 L52 50 L40 46" fill="#e07a5f" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

function Boot({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 64 64">
      <path
        d="M22 8 h16 v28 h12 v14 H18 V36 h4 Z"
        fill={fill}
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="28" cy="22" r="2" fill={INK} />
      <circle cx="36" cy="22" r="2" fill={INK} />
      <path d="M27 30 h10" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

const FACES = [Owl, Mushroom, Cat, Mug, Planet, Pickle, Cheese, Bulb, Cloud, Frog, Rocket, Boot]

function motionStyle(id: string, ghost: boolean) {
  let hash = 0
  for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  if (ghost) {
    return {
      animationDuration: `${(2.6 + (hash % 1400) / 1000).toFixed(2)}s`,
      animationDelay: `${-((hash % 3600) / 1000).toFixed(2)}s`,
    }
  }
  return {
    animationDuration: `${(1 + (hash % 1000) / 1000).toFixed(2)}s`,
    animationDelay: `${-((hash % 2000) / 1000).toFixed(2)}s`,
  }
}
