import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '../lib/router.jsx'
import { MousePointer2, MapPin, Spline, Hexagon, Type, Eraser, Eye, Route, Lock, Tag, Map as MapIcon, Minus, Plus, Maximize2, Trash2, Save, Check, X, Skull, BookOpen, ImagePlus } from 'lucide-react'
import { useTable, insertRow, updateRow, deleteRow, errorText } from '../lib/data.js'
import { Panel, Toggle, useToast, AutoTextarea, Badge } from '../ui/kit.jsx'
import { MapFallback } from '../ui/art.jsx'
import { resizeImage, uploadArt, pickFile } from '../lib/upload.js'
import { fileUrl } from '../lib/data.js'
import { AnnotationLayer, useImage, annMap, isRegion, MARKER_ICONS, MAIN_MAP, worldMapUrl } from './mapShared.jsx'

const TOOLS = [
  ['select', 'Select', MousePointer2],
  ['marker', 'Marker', MapPin],
  ['path', 'Path', Spline],
  ['region', 'Region', Hexagon],
  ['label', 'Text / Label', Type],
  ['erase', 'Erase', Eraser],
]
const HINTS = {
  marker: 'Click the map to drop a marker.',
  path: 'Click to add points. Double-click or press Enter to finish.',
  region: 'Click to outline the region. Double-click or press Enter to close it.',
  label: 'Click the map to place a label.',
  erase: 'Click a marker, path or label to delete it.',
}
const VIS = { party: 'Visible to players', dm: 'DM only', private: 'Private to me' }
export const FACTIONS = ['Neutral']
const NICE = [10, 25, 50, 100, 200, 250, 500, 1000, 2000]

function ScaleBar({ pxWidth, km }) {
  const kmPerPx = km / pxWidth
  const dist = NICE.find((d) => d / kmPerPx >= 90) || NICE[NICE.length - 1]
  const w = dist / kmPerPx
  return (
    <div className="map-scale" style={{ width: w + 24 }}>
      <div className="map-scale-labels"><span>0</span><span>{dist / 2}</span><span>{dist} km</span></div>
      <div className="map-scale-bar"><i /><i /><i /><i /></div>
    </div>
  )
}

function slug(s) {
  return (s || '').toLowerCase().replace(/\b(map|world)\b/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function WorldMap({ mode = 'dm', uid, viewAs: viewAsProp, readOnly = false }) {
  const isDm = mode === 'dm'
  const toast = useToast()
  const nav = useNavigate()
  const { rows: all } = useTable('world_map_annotations')
  const { rows: mapRows } = useTable(isDm ? 'maps' : null)
  const { rows: locations } = useTable(isDm ? 'locations' : null)
  const { rows: meta } = useTable(isDm ? 'meta' : null)
  const mapKm = Number(meta.find((m) => m.key === 'map_width_km')?.value) || 4000
  const [tool, setTool] = useState('select')
  const [layers, setLayers] = useState({ markers: true, routes: true, regions: true, party: true, dm: true, labels: true })
  const [viewAs, setViewAs] = useState(viewAsProp || 'dm')
  const [mapKey, setMapKey] = useState(MAIN_MAP)
  const [bust, setBust] = useState(0)
  const [selId, setSelId] = useState(null)
  const [draft, setDraft] = useState([])
  const [view, setView] = useState({ z: 1, x: 0, y: 0 })
  const stageRef = useRef()
  const canvasRef = useRef()
  const drag = useRef(null)
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 })
  const [panning, setPanning] = useState(false)

  const maps = useMemo(() => {
    const list = [{ key: MAIN_MAP, name: 'World Map', main: true, url: worldMapUrl(bust) }]
    for (const m of mapRows) {
      const k = slug(m.name)
      if (!k || k === MAIN_MAP) continue
      list.push({ key: k, id: m.id, name: m.name.replace(/\s*map$/i, ''), url: m.file_path ? fileUrl(m.file_path) : null })
    }
    return list
  }, [mapRows, bust])
  const cur = maps.find((m) => m.key === mapKey) || maps[0]
  const img = useImage(cur.url)

  useEffect(() => {
    if (viewAsProp) setViewAs(viewAsProp)
  }, [viewAsProp])

  // Stage size and base fit
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const base = useMemo(() => {
    const r = img.ratio
    let w = stageSize.w
    let h = w * r
    if (h > stageSize.h) { h = stageSize.h; w = h / r }
    return { w, h }
  }, [stageSize, img.ratio])
  const fit = useCallback(() => {
    setView({ z: 1, x: (stageSize.w - base.w) / 2, y: (stageSize.h - base.h) / 2 })
  }, [stageSize, base])
  useEffect(() => { fit() }, [fit, mapKey])

  const W = 1000
  const H = W * img.ratio
  const pinScale = Math.min(1, Math.max(0.6, stageSize.w / 900))
  const k = (W / (base.w * view.z)) * pinScale

  const anns = useMemo(() => all.filter((a) => {
    if (annMap(a) !== mapKey) return false
    const hiddenForPlayer = a.visibility === 'dm' || (a.visibility === 'private' && a.created_by !== uid)
    if ((!isDm || viewAs === 'player') && hiddenForPlayer) return false
    if (a.visibility === 'party' && !layers.party) return false
    if ((a.visibility === 'dm' || a.visibility === 'private') && !layers.dm) return false
    if (a.annotation_type === 'marker' && !layers.markers) return false
    if (a.annotation_type === 'label' && !layers.labels) return false
    if (a.annotation_type === 'path' && (isRegion(a) ? !layers.regions : !layers.routes)) return false
    return true
  }), [all, mapKey, layers, isDm, viewAs, uid])

  const selected = all.find((a) => a.id === selId)
  const canEdit = (a) => !readOnly && (isDm || a?.created_by === uid)

  function toPct(e) {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: +(((e.clientX - r.left) / r.width) * 100).toFixed(2), y: +(((e.clientY - r.top) / r.height) * 100).toFixed(2) }
  }

  async function create(values) {
    try {
      const style = { ...(values.style || {}) }
      if (mapKey !== MAIN_MAP) style.map = mapKey
      const row = await insertRow('world_map_annotations', {
        points: [], notes: '', visibility: isDm ? 'dm' : 'private', ...values, style, created_by: uid,
      })
      setSelId(row.id)
      setTool('select')
      return row
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function finishDraft() {
    if (tool === 'path' && draft.length >= 2) await create({ annotation_type: 'path', label: 'New route', points: draft, style: { color: '#e8dcc6', width: 2, dash: true } })
    else if (tool === 'region' && draft.length >= 3) await create({ annotation_type: 'path', label: 'New region', points: draft, style: { closed: true, color: '#81C784', fill: '#2E7D32', fillOpacity: 0.3, width: 2 } })
    else if (draft.length) toast(tool === 'region' ? 'A region needs at least three points' : 'A path needs at least two points', 'error')
    setDraft([])
  }

  useEffect(() => {
    const k2 = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'Enter' && draft.length) finishDraft()
      if (e.key === 'Escape') { setDraft([]); setSelId(null) }
    }
    window.addEventListener('keydown', k2)
    return () => window.removeEventListener('keydown', k2)
  })

  // Pointer handling on the stage
  function onDown(e) {
    if (e.button !== 0) return
    drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false }
    stageRef.current.setPointerCapture(e.pointerId)
  }
  function onMove(e) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) > 4) { d.moved = true; if (!d.ann) setPanning(true) }
    if (!d.moved) return
    if (d.ann) {
      const p = toPct(e)
      d.pos = p
      setDragPos({ id: d.ann.id, ...p })
    } else {
      setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
    }
  }
  const [dragPos, setDragPos] = useState(null)
  async function onUp(e) {
    const d = drag.current
    drag.current = null
    setPanning(false)
    if (!d) return
    if (d.ann && d.moved && d.pos) {
      try { await updateRow('world_map_annotations', d.ann.id, { x: d.pos.x, y: d.pos.y }) } catch (err) { toast(errorText(err), 'error') }
      setDragPos(null)
      return
    }
    if (d.ann || d.moved) return
    const p = toPct(e)
    if (p.x < 0 || p.y < 0 || p.x > 100 || p.y > 100) return
    if (tool === 'marker') create({ annotation_type: 'marker', x: p.x, y: p.y, label: 'New marker', style: { icon: 'settlement', color: '#8f3429' } })
    else if (tool === 'label') create({ annotation_type: 'label', x: p.x, y: p.y, label: 'New label', style: { size: 20, color: '#f3e6cc' } })
    else if (tool === 'path' || tool === 'region') setDraft((x) => [...x, p])
    else if (tool === 'select') setSelId(null)
  }
  function onPick(a, e) {
    if (tool === 'erase') {
      if (!canEdit(a)) return toast('You can only erase your own marks', 'error')
      deleteRow('world_map_annotations', a.id).then(() => toast(`Erased ${a.label || a.annotation_type}`)).catch((err) => toast(errorText(err), 'error'))
      return
    }
    if (tool !== 'select') return
    setSelId(a.id)
    if ((a.annotation_type === 'marker' || a.annotation_type === 'label') && canEdit(a)) {
      drag.current = { sx: e.clientX, sy: e.clientY, moved: false, ann: a }
      stageRef.current.setPointerCapture(e.pointerId)
    }
  }
  function onWheel(e) {
    const r = stageRef.current.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    setView((v) => {
      const z = Math.min(6, Math.max(0.5, v.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
      const f = z / v.z
      return { z, x: mx - (mx - v.x) * f, y: my - (my - v.y) * f }
    })
  }
  useEffect(() => {
    const el = stageRef.current
    const h = (e) => { e.preventDefault(); onWheel(e) }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  })
  const zoomBy = (f) => setView((v) => {
    const z = Math.min(6, Math.max(0.5, v.z * f))
    const cx = stageSize.w / 2
    const cy = stageSize.h / 2
    return { z, x: cx - (cx - v.x) * (z / v.z), y: cy - (cy - v.y) * (z / v.z) }
  })

  async function uploadFor(m) {
    const file = await pickFile()
    if (!file) return
    try {
      toast('Uploading map…')
      const blob = await resizeImage(file, 4096, false)
      if (m.main) {
        await uploadArt('world-map', blob)
        setBust(Date.now())
        toast('World map updated')
        return
      }
      const path = `maps/${m.key || 'map'}-${Date.now()}.webp`
      await uploadArt(path, blob)
      await updateRow('maps', m.id, { file_path: path })
      toast(`Image added to ${m.name}`)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function newMap() {
    const file = await pickFile()
    if (!file) return
    const name = prompt('Name for this map', file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
    if (!name) return
    try {
      toast('Uploading map…')
      const blob = await resizeImage(file, 4096, false)
      const path = `maps/${slug(name) || 'map'}-${Date.now()}.webp`
      await uploadArt(path, blob)
      await insertRow('maps', { name, file_path: path, description: '' })
      toast(`Map added: ${name}`)
      setMapKey(slug(name))
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  const shown = dragPos ? anns.map((a) => (a.id === dragPos.id ? { ...a, x: dragPos.x, y: dragPos.y } : a)) : anns
  const layerDefs = [
    ['markers', 'Locations', MapPin], ['routes', 'Routes', Route], ['regions', 'Regions', Hexagon],
    ['party', 'Player visible', Eye], ['dm', isDm ? 'DM only' : 'Private', Lock], ['labels', 'Labels', Tag],
  ]
  const tools = readOnly ? TOOLS.slice(0, 1) : isDm ? TOOLS : TOOLS.filter(([t]) => t !== 'region')

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{cur.name === 'World Map' ? 'Atlas' : `World map · ${cur.name}`}</div>
          <h1 className="h-page">{cur.name}</h1>
          <div className="sub">{cur.main ? 'Main campaign world map' : 'Campaign map'}</div>
        </div>
        <div className="spacer" />
        {isDm && (
          <div className="seg">
            <button className={viewAs === 'player' ? 'on' : ''} onClick={() => setViewAs('player')}><Eye /> Player View</button>
            <button className={viewAs === 'dm' ? 'on' : ''} onClick={() => setViewAs('dm')}><Skull /> DM View</button>
          </div>
        )}
      </div>
      <div className="map-layout">
        <Panel className="map-tools" title="Map tools">
          {tools.map(([t, label, Icon]) => (
            <button key={t} className={`tool-btn ${tool === t ? 'on' : ''}`} onClick={() => { setTool(t); setDraft([]) }}><Icon /> {label}</button>
          ))}
          <div className="divider" style={{ margin: '12px 0' }}>✦</div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Layers</div>
          {layerDefs.map(([key, label, Icon]) => (
            <div key={key} className="layer-row"><Icon /> {label}<Toggle on={layers[key]} onChange={(v) => setLayers((l) => ({ ...l, [key]: v }))} /></div>
          ))}
          {(maps.length > 1 || (isDm && !readOnly)) && (
            <>
              <div className="divider" style={{ margin: '12px 0' }}>✦</div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Maps</div>
              {maps.map((m) => (
                <button key={m.key} className={`tool-btn ${m.key === mapKey ? 'on' : ''}`} onClick={() => { setMapKey(m.key); setSelId(null) }}><MapIcon /> {m.name}</button>
              ))}
              {isDm && !readOnly && <button className="tool-btn ghost-tool" onClick={newMap}><Plus /> New map</button>}
            </>
          )}
        </Panel>

        <div
          ref={stageRef}
          className={`map-stage ${tool !== 'select' ? 'drawing' : ''} ${panning ? 'panning' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onDoubleClick={() => (tool === 'path' || tool === 'region') && finishDraft()}
          style={{ touchAction: 'none' }}
        >
          <div ref={canvasRef} className="map-canvas" style={{ width: base.w * view.z, height: base.h * view.z, transform: `translate(${view.x}px, ${view.y}px)` }}>
            {img.ok ? <img src={cur.url} alt={cur.name} draggable={false} /> : <MapFallback title={cur.name} />}
            <AnnotationLayer anns={shown} W={W} H={H} k={k} selectedId={selId} onPick={tool === 'select' || tool === 'erase' ? onPick : undefined} showLabels={layers.labels} draft={draft} draftClosed={tool === 'region'} />
          </div>
          {img.failed && (cur.id || cur.main) && (
            <div className="map-missing" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
              <b>No image for {cur.name} yet</b>
              {isDm && !readOnly ? <button className="btn gold sm" onClick={() => uploadFor(cur)}><ImagePlus size={15} /> Upload the map image</button> : <span className="faint">The DM has not added this map yet.</span>}
            </div>
          )}
          {HINTS[tool] && (
            <div className="map-hint">
              {HINTS[tool]}
              {draft.length > 0 && (
                <span style={{ marginLeft: 10 }}>
                  <button className="btn sm gold" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={finishDraft}><Check /> Finish</button>{' '}
                  <button className="btn sm ghost" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={() => setDraft([])}><X /></button>
                </span>
              )}
            </div>
          )}
                    {cur.main && img.ok && <ScaleBar pxWidth={base.w * view.z} km={mapKm} />}
          <div className="map-hud" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <button className="btn icon" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out"><Minus /></button>
            <div className="zoom">{Math.round(view.z * 100)}%</div>
            <button className="btn icon" onClick={() => zoomBy(1.25)} aria-label="Zoom in"><Plus /></button>
            <button className="btn icon" onClick={fit} aria-label="Fit map"><Maximize2 /></button>
          </div>
        </div>

        <Panel className="map-inspector" title="Map item">
          {selected ? (
            <Inspector key={selected.id} a={selected} isDm={isDm} editable={canEdit(selected)} locations={locations} onDelete={async () => {
              try { await deleteRow('world_map_annotations', selected.id); setSelId(null); toast('Deleted') } catch (e) { toast(errorText(e), 'error') }
            }} onOpenLocation={(id) => nav(`/locations?id=${id}`)} />
          ) : (
            <div className="muted" style={{ fontSize: 16 }}>
              <p style={{ marginTop: 0 }}>Select a marker, route, region or label to see its details.</p>
              <p className="faint">{anns.length} items shown on this map.</p>
              <div className="faint" style={{ fontSize: 14.5 }}>Scroll to zoom. Drag to pan. Drag a marker to move it.</div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Inspector({ a, isDm, editable, onDelete, locations, onOpenLocation }) {
  const toast = useToast()
  const [v, setV] = useState({ label: a.label, notes: a.notes, visibility: a.visibility, style: { ...(a.style || {}) } })
  const [dirty, setDirty] = useState(false)
  const set = (patch) => { setV((s) => ({ ...s, ...patch })); setDirty(true) }
  const setStyle = (patch) => { setV((s) => ({ ...s, style: { ...s.style, ...patch } })); setDirty(true) }
  const region = isRegion(a)
  const kind = region ? 'Region' : a.annotation_type === 'path' ? 'Route' : a.annotation_type === 'label' ? 'Label' : 'Marker'
  const linked = locations?.find((l) => l.name?.toLowerCase() === (a.label || '').toLowerCase())
  async function save() {
    try {
      await updateRow('world_map_annotations', a.id, v)
      setDirty(false)
      toast('Map item saved')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  const visOptions = isDm ? ['party', 'dm', 'private'] : ['party', 'private']
  const { rows: npcRows } = useTable(isDm ? 'npcs' : null)
  const factions = [...new Set([...FACTIONS, ...npcRows.map((n) => n.faction).filter(Boolean)])].sort()
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="parchment" style={{ height: 110, display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ fontFamily: 'var(--display)', letterSpacing: '.24em', fontSize: 12, color: 'var(--ink-soft)' }}>{kind.toUpperCase()}</div>
        <div style={{ position: 'absolute', inset: 8, border: '1px solid rgba(90,60,30,.35)', borderRadius: 3 }} />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <MapPin size={18} color="var(--gold)" />
        {editable ? <input className="input" value={v.label || ''} onChange={(e) => set({ label: e.target.value })} style={{ fontFamily: 'var(--title)', fontSize: 19 }} /> : <b style={{ fontFamily: 'var(--title)', fontSize: 21 }}>{a.label}</b>}
      </div>
      <div className="field"><label>Type</label><input className="input" value={kind} disabled /></div>
      {(region || a.annotation_type === 'marker') && (
        <div className="field">
          <label>Faction</label>
          {editable ? (
            <>
              <input className="input" list="map-factions" placeholder="Neutral" value={v.style.faction || ''} onChange={(e) => setStyle({ faction: e.target.value })} />
              <datalist id="map-factions">{factions.map((f) => <option key={f} value={f} />)}</datalist>
            </>
          ) : <Badge>{a.style?.faction || 'Neutral'}</Badge>}
        </div>
      )}
      <div className="field">
        <label>Visibility</label>
        {editable ? (
          <select className="select" value={v.visibility} onChange={(e) => set({ visibility: e.target.value })}>
            {visOptions.map((o) => <option key={o} value={o}>{VIS[o]}</option>)}
          </select>
        ) : <Badge>{VIS[a.visibility]}</Badge>}
      </div>
      <div className="field">
        <label>Description</label>
        {editable ? <AutoTextarea value={v.notes} onChange={(x) => set({ notes: x })} placeholder="What lies here…" /> : <div className="pre">{a.notes || '—'}</div>}
      </div>
      {editable && (
        <>
          <div className="eyebrow">Styling</div>
          {a.annotation_type === 'marker' && (
            <div className="field">
              <label>Icon</label>
              <select className="select" value={v.style.icon || 'settlement'} onChange={(e) => setStyle({ icon: e.target.value })}>
                {MARKER_ICONS.map((i) => <option key={i} value={i}>{i[0].toUpperCase() + i.slice(1)}</option>)}
              </select>
            </div>
          )}
          <div className="row" style={{ display: a.annotation_type === 'marker' ? 'none' : undefined }}>
            <div className="field" style={{ flex: 1 }}>
              <label>{region ? 'Border' : 'Colour'}</label>
              <div className="row" style={{ gap: 6 }}>
                <input type="color" value={v.style.color || '#8f3429'} onChange={(e) => setStyle({ color: e.target.value })} style={{ width: 40, height: 36, border: '1px solid var(--line)', background: 'none', borderRadius: 4, padding: 2 }} />
                <input className="input" value={v.style.color || ''} onChange={(e) => setStyle({ color: e.target.value })} />
              </div>
            </div>
            {a.annotation_type === 'path' && (
              <div className="field" style={{ width: 70 }}>
                <label>Width</label>
                <input className="input" type="number" min="1" max="10" value={v.style.width || 2} onChange={(e) => setStyle({ width: Number(e.target.value) })} />
              </div>
            )}
            {a.annotation_type === 'label' && (
              <div className="field" style={{ width: 70 }}>
                <label>Size</label>
                <input className="input" type="number" min="8" max="60" value={v.style.size || 20} onChange={(e) => setStyle({ size: Number(e.target.value) })} />
              </div>
            )}
          </div>
          {region && (
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>Fill</label>
                <div className="row" style={{ gap: 6 }}>
                  <input type="color" value={v.style.fill || '#2E7D32'} onChange={(e) => setStyle({ fill: e.target.value })} style={{ width: 40, height: 36, border: '1px solid var(--line)', background: 'none', borderRadius: 4, padding: 2 }} />
                  <input className="input" value={v.style.fill || ''} onChange={(e) => setStyle({ fill: e.target.value })} />
                </div>
              </div>
              <div className="field" style={{ width: 80 }}>
                <label>Opacity</label>
                <input className="input" type="number" min="0" max="100" step="5" value={Math.round((v.style.fillOpacity ?? 0.3) * 100)} onChange={(e) => setStyle({ fillOpacity: Number(e.target.value) / 100 })} />
              </div>
            </div>
          )}
          {a.annotation_type === 'path' && (
            <div className="field">
              <label>Line style</label>
              <select className="select" value={v.style.dash ? 'dashed' : 'solid'} onChange={(e) => setStyle({ dash: e.target.value === 'dashed' })}>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
              </select>
            </div>
          )}
          <button className="btn primary" disabled={!dirty} onClick={save}><Save /> Save changes</button>
          <button className="btn danger" onClick={onDelete}><Trash2 /> Delete</button>
        </>
      )}
      {linked && isDm && <button className="btn gold" onClick={() => onOpenLocation(linked.id)}><BookOpen /> Open location record</button>}
    </div>
  )
}
