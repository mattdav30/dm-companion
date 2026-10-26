import { useImage, worldMapUrl, annMap, isRegion, MAIN_MAP } from './mapShared.jsx'
import { useTable } from '../lib/data.js'
import { MapFallback } from '../ui/art.jsx'

/* Dashboard preview: the world map, showing only the party's routes. */
export default function MapThumb() {
  const url = worldMapUrl()
  const img = useImage(url)
  const { rows } = useTable('world_map_annotations')
  const routes = rows.filter((a) => annMap(a) === MAIN_MAP && a.annotation_type === 'path' && !isRegion(a) && (a.points || []).length > 1)
  const W = 1000
  const H = 1000 * img.ratio
  const P = (p) => [(p.x / 100) * W, (p.y / 100) * H]
  return (
    <div className="map-thumb" style={{ aspectRatio: `${1 / img.ratio}` }}>
      {img.ok ? <img src={url} alt="World map" /> : <div style={{ position: 'absolute', inset: 0 }}><MapFallback /></div>}
      {(img.ok || img.failed) && routes.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {routes.map((a) => {
            const pts = a.points.map((p) => P(p).join(',')).join(' ')
            const ends = [a.points[0], a.points[a.points.length - 1]].map(P)
            return (
              <g key={a.id}>
                <polyline points={pts} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={pts} fill="none" stroke="#f0b35a" strokeWidth="5" strokeDasharray="14 10" strokeLinecap="round" strokeLinejoin="round" />
                {ends.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r="10" fill="#f0b35a" stroke="#14161c" strokeWidth="4" />
                ))}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
