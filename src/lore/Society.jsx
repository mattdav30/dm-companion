import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, Pencil, Lock, X } from 'lucide-react'
import { Panel, clickable } from '../ui/kit.jsx'
import './lore.css'

export const LEVEL_NAMES = ['Unknown', 'Heard of', 'Known', 'Understood', 'Deep knowledge']
const TIER = ['I', 'II', 'III', 'IV']

export function repLabel(score) {
  const s = +score || 0
  if (s <= -60) return 'Hostile'
  if (s <= -30) return 'Poor'
  if (s <= -10) return 'Wary'
  if (s < 10) return 'Neutral'
  if (s < 30) return 'Respected'
  if (s < 60) return 'Trusted'
  return 'Honoured'
}
export function repTone(score) {
  const s = +score || 0
  if (s <= -60) return 'hostile'
  if (s <= -30) return 'poor'
  if (s <= -10) return 'wary'
  if (s < 10) return 'neutral'
  if (s < 30) return 'good'
  return 'great'
}
const signed = (n) => `${n > 0 ? '+' : ''}${n}`
const initials = (s) => String(s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()

export function RepMeter({ score, small }) {
  const pct = ((Math.max(-100, Math.min(100, +score || 0)) + 100) / 2)
  return <div className={`rep-meter ${small ? 'sm' : ''}`}><i style={{ left: `${pct}%` }} /></div>
}

/* Relations that imply one society belongs to another. [from is parent?] */
const CHILD_TO_PARENT = new Set(['part_of', 'serves', 'splinter_of', 'member_of', 'belongs_to'])
const PARENT_TO_CHILD = new Set(['authority', 'government', 'governed_by', 'protected_by', 'political', 'founded', 'commands'])
const COL = 138
const ROW = 196

function buildTree(nodes, edges) {
  const by = Object.fromEntries(nodes.map((n) => [n.slug, n]))
  const parent = {}
  const isAncestor = (a, b) => { for (let x = parent[b], i = 0; x && i < 50; x = parent[x], i++) if (x === a) return true; return false }
  // Skip any "belongs to" link that would loop back on itself, so no society drops out of the tree.
  for (const n of nodes) if (n.parent_slug && by[n.parent_slug] && n.parent_slug !== n.slug && !isAncestor(n.slug, n.parent_slug)) parent[n.slug] = n.parent_slug
  for (const e of edges) {
    if (!by[e.from_slug] || !by[e.to_slug]) continue
    let p = null
    let c = null
    if (CHILD_TO_PARENT.has(e.relation_type)) { c = e.from_slug; p = e.to_slug }
    else if (PARENT_TO_CHILD.has(e.relation_type)) { p = e.from_slug; c = e.to_slug }
    if (!p || parent[c] || p === c || isAncestor(c, p)) continue
    parent[c] = p
  }
  const kids = {}
  for (const n of nodes) if (parent[n.slug]) (kids[parent[n.slug]] ||= []).push(n)
  const typeRank = { people: 0, faith: 1, faction: 2 }
  const order = (a, b) => (+a.x || 0) - (+b.x || 0) || (typeRank[a.node_type] ?? 3) - (typeRank[b.node_type] ?? 3) || a.name.localeCompare(b.name)
  const roots = nodes.filter((n) => !parent[n.slug]).sort(order)
  Object.values(kids).forEach((l) => l.sort(order))
  const place = {}
  let cursor = 0
  let depthMax = 0
  const walk = (n, d) => {
    depthMax = Math.max(depthMax, d)
    const ch = kids[n.slug] || []
    if (!ch.length) { place[n.slug] = { x: cursor + 0.5, d }; cursor += 1; return }
    ch.forEach((c) => walk(c, d + 1))
    const xs = ch.map((c) => place[c.slug].x)
    place[n.slug] = { x: (Math.min(...xs) + Math.max(...xs)) / 2, d }
  }
  roots.forEach((r) => { walk(r, 0); cursor += 0.35 })
  return { parent, place, kids, roots, width: Math.max(1, cursor - 0.35), depth: depthMax + 1 }
}

/*
  nodes: [{ slug, name, node_type, parent_slug, x, y, glyph, current_level, knowledge: [..4] }]
  For the DM, knowledge holds all four tiers; for players, unrevealed tiers are null.
*/
export default function Society({ nodes, edges, reps, events = [], dm = false, onLevel, onAdjust, onEdit }) {
  const [sel, setSel] = useState(null)
  const [boxW, setBoxW] = useState(900)
  const wrap = useRef()
  useEffect(() => {
    if (!wrap.current) return
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])
  const bySlug = useMemo(() => Object.fromEntries(nodes.map((n) => [n.slug, n])), [nodes])
  const repBy = useMemo(() => Object.fromEntries(reps.map((r) => [r.subject_key, r])), [reps])
  const overall = repBy.overall
  const tree = useMemo(() => buildTree(nodes, edges), [nodes, edges])
  const treeW = tree.width * COL
  const W = Math.max(boxW, treeW + 40)
  const H = Math.max(tree.depth * ROW + 70, 520)
  const off = (W - treeW) / 2
  const P = (slug) => { const p = tree.place[slug]; return p ? { x: off + p.x * COL, y: 104 + p.d * ROW } : { x: 0, y: 0 } }

  const cross = useMemo(() => {
    const out = []
    const seen = new Set()
    for (const e of edges) {
      if (!bySlug[e.from_slug] || !bySlug[e.to_slug]) continue
      if (tree.parent[e.to_slug] === e.from_slug || tree.parent[e.from_slug] === e.to_slug) continue
      const k = [e.from_slug, e.to_slug].sort().join('|')
      if (seen.has(k)) continue
      seen.add(k)
      const kind = e.relation_type === 'opposes' || e.relation_type === 'enemy' ? 'opposes' : e.visible === false ? 'hidden-edge' : 'link'
      out.push({ key: 'e' + k, a: e.from_slug, b: e.to_slug, kind, label: e.label || String(e.relation_type || '').replace(/_/g, ' ') })
    }
    return out
  }, [edges, bySlug, tree])

  const selected = sel ? bySlug[sel] : null
  const lit = (a, b) => sel && (a === sel || b === sel)

  const groups = [
    ['Peoples and kingdoms', reps.filter((r) => r.subject_type === 'people')],
    ['Factions', reps.filter((r) => r.subject_type === 'faction')],
    ['Other', reps.filter((r) => !['people', 'faction', 'overall'].includes(r.subject_type))],
  ].filter(([, list]) => list.length)

  return (
    <div className="society">
      {overall && (
        <div className="rep-banner">
          <div className="rb-label">
            <div className="eyebrow">Party reputation</div>
            <div className={`rb-big tone-${repTone(overall.score)}`}>{repLabel(overall.score)} <span>{signed(overall.score)}</span></div>
          </div>
          <div className="rb-meter">
            <RepMeter score={overall.score} />
            <div className="rep-scale"><span>Hostile</span><span>Neutral</span><span>Honoured</span></div>
          </div>
          {dm && onAdjust && <div className="rb-adjust"><Adjuster subject={overall} onAdjust={onAdjust} /></div>}
        </div>
      )}

      <div className={`society-stage ${selected ? 'has-sel' : ''}`}>
        <div className="society-scroll" ref={wrap}>
          {boxW < 600 ? (
            <div className="s-list">
              {tree.roots.map((r) => <ListNode key={r.slug} n={r} tree={tree} repBy={repBy} dm={dm} sel={sel} setSel={setSel} depth={0} />)}
            </div>
          ) : (
          <div className="society-canvas" style={{ width: W, height: H }}>
            <svg className="society-svg" width={W} height={H}>
              {nodes.filter((n) => tree.parent[n.slug]).map((n) => {
                const a = P(tree.parent[n.slug])
                const b = P(n.slug)
                const y0 = a.y + 98
                const y1 = b.y - 42
                const mid = (y0 + y1) / 2
                return <path key={'t' + n.slug} className={`s-edge parent ${lit(n.slug, tree.parent[n.slug]) ? 'lit' : ''}`} d={`M${a.x},${y0} L${a.x},${mid} L${b.x},${mid} L${b.x},${y1}`} />
              })}
              {cross.map((l) => {
                const a = P(l.a)
                const b = P(l.b)
                const dx = b.x - a.x
                const lift = Math.min(120, 30 + Math.abs(dx) * 0.18)
                const cx = (a.x + b.x) / 2
                const cy = Math.min(a.y, b.y) - lift
                return <path key={l.key} className={`s-edge ${l.kind} ${lit(l.a, l.b) ? 'lit' : ''}`} d={`M${a.x},${a.y - 30} Q${cx},${cy} ${b.x},${b.y - 30}`} />
              })}
              {sel && cross.filter((l) => lit(l.a, l.b)).map((l) => {
                const a = P(l.a)
                const b = P(l.b)
                const lift = Math.min(120, 30 + Math.abs(b.x - a.x) * 0.18)
                const cy = Math.min(a.y, b.y) - lift
                const ly = (a.y - 30 + 2 * cy + b.y - 30) / 4
                return <text key={'lab' + l.key} className="s-edge-label" x={(a.x + b.x) / 2} y={ly - 6} textAnchor="middle">{l.label}</text>
              })}
            </svg>
            {nodes.map((n) => {
              const p = P(n.slug)
              const r = repBy[n.slug]
              const locked = !n.current_level && !dm
              return (
                <button key={n.slug} className={`s-node ${n.node_type} ${locked ? 'locked' : ''} ${sel === n.slug ? 'sel' : ''} ${dm && !n.current_level ? 'dm-unknown' : ''}`} style={{ left: p.x, top: p.y }} onClick={() => setSel(sel === n.slug ? null : n.slug)}>
                  <span className="medal">{locked ? '?' : n.glyph || initials(n.name)}</span>
                  <b>{n.name}</b>
                  <span className="pips">{[1, 2, 3, 4].map((l) => <i key={l} className={n.current_level >= l ? 'on' : ''} />)}</span>
                  {r && !locked && <span className={`rep-chip tone-${repTone(r.score)}`}>{repLabel(r.score)}</span>}
                </button>
              )
            })}
          </div>
          )}
        </div>
        {boxW >= 600 && <div className="s-legend">
          <span><i /> Belongs to</span>
          <span><i className="link" /> Connected</span>
          <span><i className="opp" /> Opposed</span>
        </div>}
        {selected && (
          <div className="s-drawer">
            <Detail node={selected} rep={repBy[selected.slug]} dm={dm} events={events.filter((e) => e.subject_key === selected.slug)} onLevel={onLevel} onAdjust={onAdjust} onEdit={onEdit} parent={tree.parent[selected.slug] ? bySlug[tree.parent[selected.slug]] : null} onClose={() => setSel(null)} />
          </div>
        )}
        {!selected && boxW >= 600 && <div className="s-dm-tip">Select a society to open its record</div>}
      </div>

      <Panel title="Reputation ledger" bodyClass={null} style={{ marginTop: 16 }}>
        {groups.length === 0 && <div className="empty" style={{ padding: 20 }}>No reputations recorded yet.</div>}
        {groups.map(([title, list]) => (
          <div key={title}>
            <div className="ledger-group">{title}</div>
            <div className="ledger">
              {list.map((r) => (
                <div key={r.subject_key} className={`ledger-row ${sel === r.subject_key ? 'on' : ''}`} {...clickable(() => bySlug[r.subject_key] && setSel(r.subject_key))}>
                  <div className="top">
                    <b>{r.display_name}</b>
                    <span className={`rep-chip tone-${repTone(r.score)}`}>{repLabel(r.score)}</span>
                    <span className={`score ${r.score > 0 ? 'pos' : r.score < 0 ? 'neg' : ''}`}>{signed(r.score)}</span>
                  </div>
                  <RepMeter score={r.score} small />
                </div>
              ))}
            </div>
          </div>
        ))}
      </Panel>
    </div>
  )
}

function ListNode({ n, tree, repBy, dm, sel, setSel, depth }) {
  const r = repBy[n.slug]
  const locked = !n.current_level && !dm
  const kids = tree.kids[n.slug] || []
  return (
    <div className={`s-li depth-${Math.min(depth, 3)}`}>
      <button className={`s-li-row ${sel === n.slug ? 'sel' : ''} ${locked ? 'locked' : ''}`} onClick={() => setSel(sel === n.slug ? null : n.slug)}>
        <span className={`medal ${n.node_type}`}>{locked ? '?' : n.glyph || initials(n.name)}</span>
        <span className="s-li-text">
          <b>{n.name}</b>
          <span className="s-li-meta">
            <span className="pips">{[1, 2, 3, 4].map((l) => <i key={l} className={n.current_level >= l ? 'on' : ''} />)}</span>
            {r && !locked && <span className={`rep-chip tone-${repTone(r.score)}`}>{repLabel(r.score)}</span>}
          </span>
        </span>
      </button>
      {kids.length > 0 && <div className="s-li-kids">{kids.map((k) => <ListNode key={k.slug} n={k} tree={tree} repBy={repBy} dm={dm} sel={sel} setSel={setSel} depth={depth + 1} />)}</div>}
    </div>
  )
}

function Adjuster({ subject, onAdjust }) {
  const [reason, setReason] = useState('')
  const [session, setSession] = useState('')
  const go = async (d) => {
    const ok = await onAdjust(subject.subject_key, d, reason, session ? +session : null)
    if (ok !== false) setReason('')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, textAlign: 'left' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" placeholder="Reason, saved to the log" value={reason} onChange={(e) => setReason(e.target.value)} />
        <input className="input" style={{ width: 84 }} placeholder="Session" inputMode="numeric" value={session} onChange={(e) => setSession(e.target.value.replace(/\D/g, ''))} />
      </div>
      <div className="rep-adjust">
        <button className="btn sm" onClick={() => go(-10)}><Minus size={13} /> 10</button>
        <button className="btn sm" onClick={() => go(-5)}><Minus size={13} /> 5</button>
        <button className="btn sm" onClick={() => go(5)}><Plus size={13} /> 5</button>
        <button className="btn sm" onClick={() => go(10)}><Plus size={13} /> 10</button>
      </div>
    </div>
  )
}

function Detail({ node, rep, dm, events, onLevel, onAdjust, onEdit, parent, onClose }) {
  const locked = !node.current_level && !dm
  const knowledge = node.knowledge || []
  return (
    <Panel className="s-detail" title="Society record" action={<span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{dm && onEdit && <button className="btn sm ghost" onClick={() => onEdit(node)}><Pencil size={14} /> Edit</button>}<button className="btn sm icon ghost" onClick={onClose} aria-label="Close"><X size={16} /></button></span>}>
      <div className="s-detail-head">
        <span className="medal">{locked ? '?' : node.glyph || initials(node.name)}</span>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{node.node_type}{parent && !locked ? ` · ${parent.name}` : ''}</div>
          <h3>{node.name}</h3>
        </div>
      </div>
      <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="eyebrow" style={{ color: 'var(--muted)' }}>Party knowledge</span>
          <span style={{ fontFamily: 'var(--title)', fontSize: 17, color: 'var(--parch)' }}>{LEVEL_NAMES[node.current_level || 0]}</span>
        </div>
        {dm && onLevel ? (
          <div className="level-set">
            {LEVEL_NAMES.map((name, l) => <button key={l} className={node.current_level === l ? 'on' : ''} title={name} onClick={() => onLevel(node, l)}>{l === 0 ? '0' : TIER[l - 1]}</button>)}
          </div>
        ) : (
          <span className="pips">{[1, 2, 3, 4].map((l) => <i key={l} className={node.current_level >= l ? 'on' : ''} />)}</span>
        )}
      </div>
      {[0, 1, 2, 3].map((i) => {
        const text = knowledge[i]
        const known = (node.current_level || 0) > i
        if (!dm && !known) return <div key={i} className="tier locked"><span className="mark"><Lock size={13} /></span><p>Not yet learned.</p></div>
        if (dm && !text) return <div key={i} className="tier locked"><span className="mark">{TIER[i]}</span><p>No text written for this tier.</p></div>
        return (
          <div key={i} className={`tier ${dm && !known ? 'dm-hidden' : ''}`}>
            <span className="mark">{TIER[i]}</span>
            <p>{text}{dm && !known && <><br /><small className="faint">Hidden from players until knowledge reaches {TIER[i]}.</small></>}</p>
          </div>
        )
      })}
      {rep && !locked && (
        <div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>Reputation</span>
            <span><span className={`rep-chip tone-${repTone(rep.score)}`}>{repLabel(rep.score)}</span> <b className={rep.score > 0 ? 'pos' : rep.score < 0 ? 'neg' : ''} style={{ fontFamily: 'var(--display)', fontSize: 13 }}>{signed(rep.score)}</b></span>
          </div>
          <RepMeter score={rep.score} small />
          {dm && onAdjust && <Adjuster subject={rep} onAdjust={onAdjust} />}
        </div>
      )}
      {dm && events.length > 0 && (
        <div className="rep-log">
          {events.slice(0, 12).map((e) => (
            <div key={e.id}><b className={e.delta > 0 ? 'pos' : 'neg'}>{signed(e.delta)}</b><span>{e.reason}</span>{e.session_number ? <small>S{e.session_number}</small> : null}</div>
          ))}
        </div>
      )}
    </Panel>
  )
}
