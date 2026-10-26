import { useState } from 'react'

/* The app mark: a twenty-sided die outline. */
export function Emblem({ className = 'brand-emblem' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M24 3 42 13.5v21L24 45 6 34.5v-21Z" />
      <path d="M24 3 15 19h18Z M15 19 6 13.5 M33 19l9-5.5 M15 19 24 34l9-15 M24 34v11 M15 19 6 34.5 M33 19l9 15.5 M6 34.5 24 34l18 .5" opacity=".55" />
    </svg>
  )
}

/* Fallback world map drawn as an old chart. */
export function MapFallback({ title = 'World' }) {
  return (
    <svg className="map-fallback" viewBox="0 0 1600 1000" preserveAspectRatio="none">
      <defs>
        <radialGradient id="msea" cx="50%" cy="50%" r="75%">
          <stop offset="0" stopColor="#35505a" />
          <stop offset="1" stopColor="#15252c" />
        </radialGradient>
        <linearGradient id="mland" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9a67a" />
          <stop offset="1" stopColor="#8e7b52" />
        </linearGradient>
        <filter id="mrough"><feTurbulence baseFrequency=".012" numOctaves="3" seed="4" /><feDisplacementMap in="SourceGraphic" scale="40" /></filter>
      </defs>
      <rect width="1600" height="1000" fill="url(#msea)" />
      <g filter="url(#mrough)" fill="url(#mland)" stroke="#3b2e1d" strokeWidth="4">
        <path d="M520 160 L980 90 L1380 170 L1480 420 L1440 760 L1180 860 L820 900 L600 780 L520 560 L470 360 Z" />
        <path d="M80 110 L330 80 L420 250 L360 460 L160 470 L70 300 Z" />
        <path d="M40 700 L300 680 L360 820 L200 920 L50 860 Z" />
        <path d="M720 820 L860 800 L900 900 L760 940 Z" />
      </g>
      <g fill="#5e7244" opacity=".6" filter="url(#mrough)">
        <ellipse cx="760" cy="400" rx="130" ry="90" />
        <ellipse cx="1080" cy="480" rx="120" ry="80" />
        <ellipse cx="220" cy="300" rx="80" ry="60" />
      </g>
      <g fill="#e9e1d0" opacity=".8">
        {Array.from({ length: 16 }).map((_, i) => (
          <path key={i} d={`M${560 + i * 50} ${170 + (i % 3) * 14} l26 -48 l26 48 z`} />
        ))}
      </g>
      <text x="800" y="520" textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontSize="64" fill="#3b2e1d" opacity=".35" letterSpacing="18">{title.toUpperCase()}</text>
    </svg>
  )
}

export function ArtImage({ src, fallback, alt = '' }) {
  const [failed, setFailed] = useState(!src)
  if (failed) return fallback
  return <img src={src} alt={alt} onError={() => setFailed(true)} />
}

const PALETTES = [
  ['#5b4a8c', '#1e1a33'],
  ['#2f5f7a', '#11222e'],
  ['#7a5a2f', '#2a1f12'],
  ['#2f6b55', '#10251d'],
  ['#7a3550', '#2a121c'],
  ['#4a5568', '#1a1f29'],
]

export function initials(name = '') {
  const parts = name.replace(/[,“”"'].*$/, '').split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

export function portraitFor(name = '', url) {
  return url || null
}

export function Portrait({ name, size = '', seed, url }) {
  const [broken, setBroken] = useState(false)
  const src = broken ? null : portraitFor(name, url)
  const n = seed ?? [...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0)
  const [a, b] = PALETTES[n % PALETTES.length]
  return (
    <div className={`portrait ${size}`} style={{ background: `radial-gradient(circle at 35% 28%, ${a}, ${b})` }}>
      {src ? <img src={src} alt="" onError={() => setBroken(true)} /> : initials(name)}
    </div>
  )
}
