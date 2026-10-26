import { useEffect, useMemo, useState } from 'react'
import { Plus, Minus, Dices, SkipForward, Trash2, RotateCcw, Heart, Shield } from 'lucide-react'
import { useTable, insertRow, updateRow, deleteRow, rpc, loadTable, errorText } from '../lib/data.js'
import { Panel, Badge, useToast, Loading } from '../ui/kit.jsx'
import Records, { Tabbed } from './Records.jsx'
import { ENTITIES } from '../entities.js'

/* ---------- Lore & Society ---------- */
export function LoreSociety() {
  return (
    <Tabbed
      tabs={[
        { key: 'lore', label: 'Lore book', render: () => <Records ent={ENTITIES.lore_entries} /> },
        { key: 'society', label: 'Society & reputation', render: () => <Society /> },
      ]}
    />
  )
}

function Society() {
  const toast = useToast()
  const { rows: nodes, loading } = useTable('society_nodes')
  const { rows: reps } = useTable('reputations')
  const [reason, setReason] = useState('')
  async function setLevel(n, level) {
    try {
      await rpc('set_society_level', { p_slug: n.slug, p_level: level })
      loadTable('society_nodes', true)
    } catch (e) { toast(errorText(e), 'error') }
  }
  async function adjust(r, delta) {
    try {
      await rpc('adjust_reputation', { p_subject_key: r.subject_key, p_delta: delta, p_reason: reason || 'Adjusted by DM', p_session: null })
      loadTable('reputations', true)
    } catch (e) { toast(errorText(e), 'error') }
  }
  if (loading) return <Loading />
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <Panel title="Societies and factions" bodyClass={null}>
        <div className="panel-body faint" style={{ fontSize: 14.5, paddingBottom: 4 }}>Knowledge level sets how much the players see. Level 0 shows as “Unknown Society”.</div>
        {nodes.map((n) => (
          <div key={n.id} className="rec-item" style={{ cursor: 'default' }}>
            <div className="stat-icon" style={{ width: 42, height: 42, fontSize: 18 }}>{n.glyph || '✦'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4>{n.name}</h4>
              <p>{[n.level1, n.level2, n.level3, n.level4][Math.max(0, n.current_level - 1)] || 'Unknown to the party.'}</p>
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                {[0, 1, 2, 3, 4].map((l) => (
                  <button key={l} className={`btn sm ${n.current_level === l ? 'primary' : ''}`} style={{ width: 34, padding: 0 }} onClick={() => setLevel(n, l)}>{l}</button>
                ))}
                <Badge tone="grey">{n.node_type}</Badge>
              </div>
            </div>
          </div>
        ))}
      </Panel>
      <Panel title="Reputation" bodyClass={null}>
        <div className="panel-body" style={{ paddingBottom: 6 }}>
          <input className="input" placeholder="Reason for the change (logged)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {reps.map((r) => (
          <div key={r.id} className="rec-item" style={{ cursor: 'default', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4>{r.display_name}</h4>
              <div className="rep-bar" style={{ marginTop: 10 }}><i style={{ left: `calc(${(r.score + 100) / 2}% - 2px)` }} /></div>
            </div>
            <b style={{ width: 44, textAlign: 'right', fontFamily: 'var(--title)', fontSize: 22, color: r.score >= 0 ? '#9fd199' : '#f0a59c' }}>{r.score > 0 ? '+' : ''}{r.score}</b>
            <button className="btn sm icon" onClick={() => adjust(r, -5)} title="−5"><Minus /></button>
            <button className="btn sm icon" onClick={() => adjust(r, 5)} title="+5"><Plus /></button>
          </div>
        ))}
      </Panel>
    </div>
  )
}

/* ---------- Campaign overview ---------- */
export function Overview() {
  const { rows, loading } = useTable('campaign_overview')
  const [kind, setKind] = useState('Phase')
  const kinds = useMemo(() => [...new Set(rows.map((r) => r.kind).filter(Boolean))], [rows])
  const campaign = rows.find((r) => r.kind === 'Campaign')
  const list = rows.filter((r) => r.kind === kind)
  if (loading) return <Loading />
  return (
    <Tabbed
      tabs={[
        {
          key: 'timeline', label: 'Timeline', render: () => (
            <div>
              <div className="page-head">
                <div>
                  <div className="eyebrow">The long road</div>
                  <h1 className="h-page">{campaign?.title || 'Campaign Overview'}</h1>
                </div>
                <div className="spacer" />
                <div className="seg">
                  {kinds.filter((k) => k !== 'Campaign').map((k) => <button key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{k}s</button>)}
                </div>
              </div>
              {campaign?.summary && <Panel framed style={{ marginBottom: 18 }}><div className="pre" style={{ fontFamily: 'var(--title)', fontSize: 20, lineHeight: 1.45 }}>{campaign.summary}</div></Panel>}
              <div className="timeline">
                {list.map((r) => (
                  <div key={r.id} className={`tl-item ${/current|active|in progress/i.test(r.status || '') ? 'current' : ''}`}>
                    <Panel>
                      <div className="row wrap" style={{ gap: 10 }}>
                        <span className="eyebrow">{r.session_range || (r.session_start != null ? `Session ${r.session_start}${r.session_end && r.session_end !== r.session_start ? `–${r.session_end}` : ''}` : r.kind)}</span>
                        <Badge>{r.status}</Badge>
                      </div>
                      <h3 style={{ margin: '4px 0 6px', fontFamily: 'var(--title)', fontSize: 24, fontWeight: 600, color: 'var(--parch)' }}>{r.title}</h3>
                      {r.summary && <div className="pre muted">{r.summary}</div>}
                      {r.details && <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer', color: 'var(--gold)' }}>Details</summary><div className="pre" style={{ marginTop: 8 }}>{r.details}</div></details>}
                    </Panel>
                  </div>
                ))}
              </div>
            </div>
          ),
        },
        { key: 'edit', label: 'Edit entries', render: () => <Records ent={ENTITIES.campaign_overview} /> },
      ]}
    />
  )
}

/* ---------- DM toolkit ---------- */
export function Toolkit() {
  return (
    <Tabbed
      tabs={[
        { key: 'initiative', label: 'Initiative', render: () => <Initiative /> },
        { key: 'dice', label: 'Dice', render: () => <Dice /> },
        { key: 'notes', label: 'Quick notes', render: () => <Records ent={ENTITIES.quick_notes} /> },
        { key: 'secrets', label: 'Secrets', render: () => <Records ent={ENTITIES.secrets} /> },
        { key: 'inventory', label: 'Party inventory', render: () => <Records ent={ENTITIES.party_inventory} /> },
        { key: 'music', label: 'Music', render: () => <Records ent={ENTITIES.music} /> },
      ]}
    />
  )
}

/* Saves when the field loses focus or Enter is pressed, so typing never fights the server. */
function DraftInput({ value, onSave, type = 'text', ...rest }) {
  const [v, setV] = useState(value ?? '')
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setV(value ?? '') }, [value, focus])
  const commit = () => { setFocus(false); const out = type === 'number' ? (v === '' ? null : Number(v)) : v; if (out !== (value ?? (type === 'number' ? null : ''))) onSave(out) }
  return <input {...rest} type={type} value={v} onFocus={() => setFocus(true)} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
}

// Turn and round live outside the component, so the Toolkit page and the Play mode drawer share them.
const combat = { turnId: null, round: 1 }

export function Initiative({ compact }) {
  const toast = useToast()
  const { rows } = useTable('initiative')
  const { rows: chars } = useTable('characters')
  const [turnId, setTurnIdS] = useState(combat.turnId)
  const [round, setRoundS] = useState(combat.round)
  const setTurnId = (id) => { combat.turnId = id; setTurnIdS(id) }
  const setRound = (f) => { combat.round = typeof f === 'function' ? f(combat.round) : f; setRoundS(combat.round) }
  const [form, setForm] = useState({ name: '', initiative: '', max_hp: '', ac: '', kind: 'Enemy' })
  const order = useMemo(() => rows.filter((r) => r.active !== 0).sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0)), [rows])
  const safe = (p) => p.catch((e) => toast(errorText(e), 'error'))
  const turn = Math.max(0, order.findIndex((r) => r.id === turnId))
  function add(e) {
    e.preventDefault()
    if (!form.name) return
    const hp = form.max_hp ? Number(form.max_hp) : null
    safe(insertRow('initiative', { name: form.name, kind: form.kind, initiative: Number(form.initiative) || 0, max_hp: hp, current_hp: hp, ac: form.ac ? Number(form.ac) : null, active: 1, position: rows.length }))
    setForm({ ...form, name: '', initiative: '', max_hp: '', ac: '' })
  }
  function addParty() {
    const have = new Set(rows.map((r) => (r.name || '').toLowerCase()))
    const add = chars.filter((c) => !have.has(c.name.split(',')[0].toLowerCase()))
    if (!add.length) return toast('The party is already in the order')
    add.forEach((c, i) => safe(insertRow('initiative', { name: c.name.split(',')[0], kind: 'Player', initiative: 0, ac: c.ac, active: 1, position: rows.length + i })))
  }
  function next() {
    if (!order.length) return
    if (turn + 1 >= order.length) { setTurnId(order[0].id); setRound((r) => r + 1) } else setTurnId(order[turn + 1].id)
  }
  async function clear() {
    if (!confirm('Clear the whole initiative order?')) return
    for (const r of rows) await deleteRow('initiative', r.id).catch(() => {})
    setTurnId(null); setRound(1)
  }
  return (
    <div className={compact ? 'init-compact' : ''}>
      {compact ? (
        <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
          <b className="init-round">Round {round}</b>
          <div style={{ flex: 1 }} />
          <button className="btn sm" onClick={addParty}><Plus /> Party</button>
          <button className="btn sm danger icon" onClick={clear} title="Clear"><RotateCcw /></button>
          <button className="btn sm primary" onClick={next}><SkipForward /> Next</button>
        </div>
      ) : (
      <div className="page-head">
        <div><div className="eyebrow">Combat</div><h1 className="h-page">Initiative</h1></div>
        <span className="sub">Round {round}</span>
        <div className="spacer" />
        <button className="btn" onClick={addParty}><Plus /> Add party</button>
        <button className="btn danger" onClick={clear}><RotateCcw /> Clear</button>
        <button className="btn primary" onClick={next}><SkipForward /> Next turn</button>
      </div>
      )}
      <Panel bodyClass={null}>
        <form onSubmit={add} className="row wrap" style={{ padding: 12, gap: 8, borderBottom: '1px solid var(--line-soft)' }}>
          <input className="input" style={{ flex: 2, minWidth: 160 }} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="select" style={{ width: 120 }} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option>Enemy</option><option>Ally</option><option>Player</option></select>
          <input className="input" style={{ width: 90 }} placeholder="Init" type="number" value={form.initiative} onChange={(e) => setForm({ ...form, initiative: e.target.value })} />
          <input className="input" style={{ width: 90 }} placeholder="HP" type="number" value={form.max_hp} onChange={(e) => setForm({ ...form, max_hp: e.target.value })} />
          <input className="input" style={{ width: 80 }} placeholder="AC" type="number" value={form.ac} onChange={(e) => setForm({ ...form, ac: e.target.value })} />
          <button className="btn gold"><Plus /> Add</button>
        </form>
        {order.length === 0 && <div className="empty">No combatants. Add the party or enemies above.</div>}
        {order.map((r, i) => (
          <div key={r.id} className={`init-row ${i === turn ? 'active' : ''}`}>
            <DraftInput className="input" type="number" value={r.initiative ?? 0} onSave={(v) => safe(updateRow('initiative', r.id, { initiative: v ?? 0 }))} style={{ textAlign: 'center' }} aria-label={`Initiative for ${r.name}`} />
            <div style={{ minWidth: 0 }}>
              <b style={{ fontFamily: 'var(--title)', fontSize: 19 }}>{r.name}</b> <Badge tone={r.kind === 'Enemy' ? 'red' : r.kind === 'Player' ? 'blue' : 'green'}>{r.kind}</Badge>
              <DraftInput className="input" placeholder="Conditions" value={r.conditions || ''} onSave={(v) => safe(updateRow('initiative', r.id, { conditions: v }))} style={{ marginTop: 4, height: 28, fontSize: 14.5 }} aria-label={`Conditions for ${r.name}`} />
            </div>
            <div className="row" style={{ gap: 4 }}>
              <Heart size={15} color="#c9382c" />
              <button className="btn sm icon" type="button" onClick={() => safe(updateRow('initiative', r.id, { current_hp: Math.max(0, (r.current_hp ?? 0) - 1) }))}><Minus /></button>
              <span style={{ minWidth: 44, textAlign: 'center', fontFamily: 'var(--title)', fontSize: 18 }}>{r.current_hp ?? '–'}{r.max_hp ? `/${r.max_hp}` : ''}</span>
              <button className="btn sm icon" type="button" onClick={() => safe(updateRow('initiative', r.id, { current_hp: r.max_hp ? Math.min(r.max_hp, (r.current_hp ?? 0) + 1) : (r.current_hp ?? 0) + 1 }))}><Plus /></button>
            </div>
            <span className="row muted" style={{ gap: 4 }}><Shield size={15} /> {r.ac ?? '–'}</span>
            <button className="btn sm icon ghost" type="button" onClick={() => safe(deleteRow('initiative', r.id))}><Trash2 /></button>
          </div>
        ))}
      </Panel>
    </div>
  )
}

export function Dice({ compact }) {
  const [log, setLog] = useState([])
  const [expr, setExpr] = useState('1d20')
  function roll(e) {
    const m = String(e).replace(/\s/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i)
    if (!m) return setLog((l) => [{ e, text: 'Use a form like 2d6+3' }, ...l])
    const n = Math.min(100, Number(m[1] || 1))
    const d = Number(m[2])
    const mod = Number(m[3] || 0)
    const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * d))
    const total = rolls.reduce((a, b) => a + b, 0) + mod
    setLog((l) => [{ e, total, rolls, mod }, ...l].slice(0, 30))
  }
  const last = log[0]
  return (
    <div className={compact ? 'stack dice-compact' : 'grid-2'} style={{ alignItems: 'start' }}>
      <Panel framed title="Roll">
        <div className="dice" style={{ marginBottom: 14 }}>
          {['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '2d20', '1d100'].map((d) => <button key={d} className="btn" onClick={() => roll(d)}><Dices /> {d}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); roll(expr) }} className="row">
          <input className="input" value={expr} onChange={(e) => setExpr(e.target.value)} />
          <button className="btn primary">Roll</button>
        </form>
        {last?.total != null && (
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <div className="roll-out">{last.total}</div>
            <div className="muted">{last.e} → [{last.rolls.join(', ')}]{last.mod ? ` ${last.mod > 0 ? '+' : ''}${last.mod}` : ''}</div>
          </div>
        )}
      </Panel>
      <Panel title="History" bodyClass={null}>
        {log.length === 0 && <div className="empty">No rolls yet.</div>}
        {log.map((r, i) => (
          <div key={i} className="note-item"><Dices /><div style={{ flex: 1 }}><b>{r.total ?? '—'}</b><span>{r.e}{r.rolls ? ` · ${r.rolls.join(', ')}` : ` · ${r.text}`}</span></div></div>
        ))}
      </Panel>
    </div>
  )
}
