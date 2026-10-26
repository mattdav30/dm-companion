import { useEffect, useState } from 'react'
import { fileUrl } from '../lib/data.js'

export const MARKER_ICONS = ['settlement', 'fortress', 'port', 'forest', 'mountain', 'battle', 'danger', 'skull', 'compass', 'mystery']
const PIN_ALIAS = { camp: 'compass', point: 'mystery' }
export function pinSrc(icon) {
  const k = PIN_ALIAS[icon] || icon
  return `/art/pin-${MARKER_ICONS.includes(k) ? k : 'settlement'}.webp`
}

/* The campaign's main world map image. `bust` forces a fresh copy after an upload. */
export const MAIN_MAP = 'main'
export function worldMapUrl(bust) {
  return fileUrl('world-map') + (bust ? `?b=${bust}` : '')
}

/* Load an image, report its aspect ratio or failure. */
export function useImage(src) {
  const [state, setState] = useState({ ok: false, failed: !src, ratio: 1000 / 1600 })
  useEffect(() => {
    if (!src) return setState({ ok: false, failed: true, ratio: 1000 / 1600 })
    let live = true
    const img = new Image()
    img.onload = () => live && setState({ ok: true, failed: false, ratio: img.naturalHeight / img.naturalWidth })
    img.onerror = () => live && setState({ ok: false, failed: true, ratio: 1000 / 1600 })
    img.src = src
    return () => { live = false }
  }, [src])
  return state
}

export function annMap(a) {
  return a.style?.map || MAIN_MAP
}

export function isRegion(a) {
  return a.annotation_type === 'path' && a.style?.closed
}

/* Renders all annotations in a W×H coordinate space. `k` is the inverse zoom so pins keep screen size. */
export function AnnotationLayer({ anns, W, H, k = 1, selectedId, onPick, showLabels = true, draft, draftClosed, fit = 'none' }) {
  const P = (p) => [(p.x / 100) * W, (p.y / 100) * H]
  const regions = anns.filter(isRegion)
  const paths = anns.filter((a) => a.annotation_type === 'path' && !isRegion(a))
  const labels = anns.filter((a) => a.annotation_type === 'label')
  const markers = anns.filter((a) => a.annotation_type === 'marker')
  const pick = (a) => (e) => { if (onPick) { e.stopPropagation(); onPick(a, e) } }
  return (
    <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={fit}>
      {regions.map((a) => {
        const s = a.style || {}
        const pts = (a.points || []).map((p) => P(p).join(',')).join(' ')
        const sel = a.id === selectedId
        return (
          <polygon key={a.id} points={pts} onPointerDown={pick(a)}
            fill={s.fill || s.color || '#2E7D32'} fillOpacity={s.fillOpacity ?? 0.3}
            stroke={sel ? '#f3d98f' : s.color || '#81C784'} strokeWidth={(s.width || 2) * k * (sel ? 1.8 : 1)}
            strokeDasharray={s.dash ? `${8 * k} ${6 * k}` : undefined} style={{ cursor: onPick ? 'pointer' : 'default', filter: sel ? 'drop-shadow(0 0 6px rgba(243,217,143,.8))' : undefined }} />
        )
      })}
      {paths.map((a) => {
        const s = a.style || {}
        const pts = (a.points || []).map((p) => P(p).join(',')).join(' ')
        const sel = a.id === selectedId
        return (
          <g key={a.id} onPointerDown={pick(a)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
            <polyline points={pts} fill="none" stroke="transparent" strokeWidth={14 * k} />
            <polyline points={pts} fill="none" stroke="rgba(10,8,7,.55)" strokeWidth={((s.width || 2) + 2) * k} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={pts} fill="none" stroke={sel ? '#f3d98f' : s.color || '#e8dcc6'} strokeWidth={(s.width || 2) * k} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={s.dash ? `${9 * k} ${7 * k}` : undefined} />
          </g>
        )
      })}
      {showLabels && labels.map((a) => {
        const [x, y] = P(a)
        const s = a.style || {}
        const sel = a.id === selectedId
        return (
          <g key={a.id} onPointerDown={pick(a)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
            <text x={x} y={y} textAnchor="middle" className="pin-label" fontSize={(s.size || 20) * k} strokeWidth={4 * k}
              style={{ fill: sel ? '#f3d98f' : s.color || '#f3e6cc', letterSpacing: '.2em', pointerEvents: 'all' }}>{(a.label || 'Label').toUpperCase()}</text>
          </g>
        )
      })}
      {markers.map((a) => {
        const [x, y] = P(a)
        const s = a.style || {}
        const sel = a.id === selectedId
        return (
          <g key={a.id} transform={`translate(${x} ${y}) scale(${k * 2.2})`} onPointerDown={pick(a)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
            {sel && <ellipse cy="0" rx="9" ry="3" fill="none" stroke="#f3d98f" strokeWidth="1.2" />}
            <image href={pinSrc(s.icon)} x="-7.5" y="-20" width="15" height="20" preserveAspectRatio="xMidYMax meet"
              style={{ filter: sel ? 'drop-shadow(0 0 2px #f3d98f) drop-shadow(0 1.5px 1.5px rgba(0,0,0,.8))' : 'drop-shadow(0 1.5px 1.5px rgba(0,0,0,.8))' }} />
            {a.visibility === 'dm' && <circle cx="6" cy="-18" r="2.2" fill="#c9382c" stroke="#0a0807" strokeWidth=".6" />}
            {showLabels && a.label && (
              <text y="6" textAnchor="middle" className="pin-label" fontSize="4.6" strokeWidth="1.6">{a.label}</text>
            )}
          </g>
        )
      })}
      {draft && draft.length > 0 && (
        <g>
          {draftClosed
            ? <polygon points={draft.map((p) => P(p).join(',')).join(' ')} fill="#c9a15e" fillOpacity=".2" stroke="#f3d98f" strokeWidth={2 * k} strokeDasharray={`${6 * k} ${5 * k}`} />
            : <polyline points={draft.map((p) => P(p).join(',')).join(' ')} fill="none" stroke="#f3d98f" strokeWidth={2.5 * k} strokeDasharray={`${6 * k} ${5 * k}`} />}
          {draft.map((p, i) => { const [x, y] = P(p); return <circle key={i} cx={x} cy={y} r={4 * k} fill="#f3d98f" stroke="#0a0807" strokeWidth={1.5 * k} /> })}
        </g>
      )}
    </svg>
  )
}
