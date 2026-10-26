import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from '../lib/router.jsx'
import { X, Search, Swords, Dices, Flag, Send, Trash2, Clock, ScrollText, NotebookPen, ChevronDown, Lock } from 'lucide-react'
import { useTable, insertRow, deleteRow, errorText, getCampaignId } from '../lib/data.js'
import { useToast, Loading } from '../ui/kit.jsx'
import { ENTITIES } from '../entities.js'
import RunSheet from './RunSheet.jsx'
import Wrapup from './Wrapup.jsx'
import { Initiative, Dice } from './Extras.jsx'
import { TextSize } from '../ui/TopTools.jsx'

const LOG_TYPES = ['Note', 'Choice', 'Clue', 'Loot', 'Consequence', 'NPC']
const LOOKUP = [
  ['npcs', 'NPC'], ['locations', 'Location'], ['characters', 'Character'], ['items', 'Item'], ['threads', 'Thread'], ['lore_entries', 'Lore'],
]

function useWakeLock() {
  useEffect(() => {
    let lock = null
    let gone = false
    const get = () => navigator.wakeLock?.request('screen').then((l) => { if (gone) l.release(); else lock = l }).catch(() => {})
    get()
    const vis = () => document.visibilityState === 'visible' && get()
    document.addEventListener('visibilitychange', vis)
    return () => { gone = true; document.removeEventListener('visibilitychange', vis); lock?.release?.().catch?.(() => {}) }
  }, [])
}

function useClock(n) {
  const key = `dmc.play.${getCampaignId()}.${n}`
  const start = useMemo(() => {
    if (n == null) return Date.now()
    try { const v = Number(localStorage.getItem(key)); if (v && Date.now() - v < 16 * 3600e3) return v; localStorage.setItem(key, String(Date.now())) } catch { /* private mode */ }
    return Date.now()
  }, [key, n])
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30e3); return () => clearInterval(t) }, [])
  const m = Math.floor((now - start) / 60e3)
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

function Lookup() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const npcs = useTable('npcs').rows
  const locations = useTable('locations').rows
  const characters = useTable('characters').rows
  const items = useTable('items').rows
  const threads = useTable('threads').rows
  const lore = useTable('lore_entries').rows
  const tables = useMemo(() => ({ npcs, locations, characters, items, threads, lore_entries: lore }), [npcs, locations, characters, items, threads, lore])
  const input = useRef(null)
  useEffect(() => { input.current?.focus() }, [])
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out = []
    for (const [t, kind] of LOOKUP) {
      const ent = ENTITIES[t]
      for (const r of tables[t]) {
        const title = ent.titleOf(r)
        const hay = `${title} ${ent.subtitleOf?.(r) || ''} ${r.faction || ''} ${r.region || ''} ${r.area || ''}`.toLowerCase()
        if (!s ? t === 'npcs' || t === 'locations' : hay.includes(s)) out.push({ t, kind, r, title, sub: ent.subtitleOf?.(r), score: title.toLowerCase().startsWith(s) ? 0 : 1 })
      }
    }
    return out.sort((a, b) => a.score - b.score).slice(0, 40)
  }, [q, tables])
  return (
    <div className="lookup">
      <div className="lookup-search"><Search /><input ref={input} className="input" placeholder="Name, faction, place…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!q && <div className="faint" style={{ fontSize: 14, margin: '4px 2px 8px' }}>NPCs and locations. Type to search everything.</div>}
      {hits.map((h) => {
        const k = `${h.t}-${h.r.id}`
        const ent = ENTITIES[h.t]
        const isOpen = open === k
        return (
          <div key={k} className={`look ${isOpen ? 'open' : ''}`}>
            <button className="look-head" onClick={() => setOpen(isOpen ? null : k)}>
              <span><b>{h.title}</b><small>{h.kind}{h.sub ? ` · ${h.sub}` : ''}</small></span>
              <ChevronDown />
            </button>
            {isOpen && (
              <dl className="look-body">
                {ent.fields.filter((f) => f.type !== 'bool' && h.r[f.key] != null && h.r[f.key] !== '' && f.key !== 'name' && f.key !== 'title').map((f) => (
                  <div key={f.key} className={f.dm ? 'dm' : ''}><dt>{f.dm && <Lock size={12} />} {f.label}</dt><dd>{String(h.r[f.key])}</dd></div>
                ))}
              </dl>
            )}
          </div>
        )
      })}
      {q && !hits.length && <div className="empty">Nothing matches “{q}”.</div>}
    </div>
  )
}

function TableLog({ n }) {
  const toast = useToast()
  const { rows } = useTable('session_events')
  const [type, setType] = useState('Note')
  const [text, setText] = useState('')
  const list = rows.filter((e) => e.session_number === n).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  async function add(e) {
    e?.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    try { await insertRow('session_events', { session_number: n, event_type: type, subject: t, status: 'Logged', created_at: new Date().toISOString() }) } catch (err) { toast(errorText(err), 'error'); setText(t) }
  }
  return (
    <div className="tlog">
      <div className="tlog-types">{LOG_TYPES.map((t) => <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t}</button>)}</div>
      <form onSubmit={add} className="tlog-form">
        <textarea className="input" rows={2} style={{ height: "auto" }} placeholder="What just happened? Enter saves." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) add(e) }} />
        <button className="btn primary icon" title="Log it"><Send /></button>
      </form>
      <div className="tlog-list">
        {list.length === 0 && <div className="faint" style={{ fontSize: 14.5, padding: '6px 2px' }}>Choices, loot and surprises you log here feed the wrap-up at the end.</div>}
        {list.map((e) => (
          <div key={e.id} className="tlog-item">
            <span className={`tlog-kind k-${(e.event_type || 'note').toLowerCase()}`}>{e.event_type || 'Note'}</span>
            <p>{[e.subject, e.detail].filter(Boolean).join('. ')}</p>
            <time>{e.created_at ? new Date(e.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</time>
            <button className="btn sm icon ghost" title="Remove" onClick={() => deleteRow('session_events', e.id).catch((err) => toast(errorText(err), 'error'))}><Trash2 /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PlayMode() {
  useWakeLock()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { rows: sessions, loading } = useTable('sessions')
  const { rows: blocks } = useTable('session_blocks')
  const [drawer, setDrawer] = useState(null)
  const [pane, setPane] = useState('sheet')
  const [finish, setFinish] = useState(false)
  const [hideDone, setHideDone] = useState(false)
  const sorted = useMemo(() => [...sessions].sort((a, b) => a.number - b.number), [sessions])
  const cur = sorted.find((s) => String(s.number) === params.get('n')) || sorted.find((s) => !/complete/i.test(s.status || '')) || sorted[sorted.length - 1]
  const sBlocks = useMemo(() => blocks.filter((b) => b.session_number === cur?.number).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id), [blocks, cur])
  const clock = useClock(cur?.number)
  const done = sBlocks.filter((b) => b.completed).length
  const exit = () => nav(`/sessions?n=${cur?.number ?? ''}`)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') return setDrawer(null)
      if (e.target.closest?.('input, textarea, select')) return
      if (e.key === '/') { e.preventDefault(); setDrawer('look') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (loading) return <div className="playmode"><Loading /></div>
  if (!cur) return <div className="playmode"><div className="empty">No sessions yet. <button className="btn" onClick={() => nav('/sessions')}>Back</button></div></div>

  const DRAWERS = { look: ['Look up', <Lookup key="l" />], fight: ['Combat', <Initiative key="i" compact />], dice: ['Dice', <Dice key="d" compact />] }

  return (
    <div className="playmode">
      <header className="play-top">
        <button className="btn ghost icon" onClick={exit} title="Leave play mode"><X /></button>
        <div className="play-title">
          <small>Session {cur.number} · <Clock size={12} /> {clock}</small>
          <b>{cur.title}</b>
        </div>
        <div className="play-progress" title={`${done} of ${sBlocks.length} blocks done`}>
          <i style={{ width: `${sBlocks.length ? (done / sBlocks.length) * 100 : 0}%` }} />
          <span>{done}/{sBlocks.length}</span>
        </div>
        <div className="play-tools">
          <button className={`btn ${drawer === 'look' ? 'primary' : ''}`} onClick={() => setDrawer(drawer === 'look' ? null : 'look')} title="Look up (press /)"><Search /> <span className="btn-label">Look up</span></button>
          <button className={`btn ${drawer === 'fight' ? 'primary' : ''}`} onClick={() => setDrawer(drawer === 'fight' ? null : 'fight')}><Swords /> <span className="btn-label">Combat</span></button>
          <button className={`btn ${drawer === 'dice' ? 'primary' : ''}`} onClick={() => setDrawer(drawer === 'dice' ? null : 'dice')}><Dices /> <span className="btn-label">Dice</span></button>
          <TextSize />
          <button className="btn gold" onClick={() => setFinish(true)}><Flag /> <span className="btn-label">Finish</span></button>
        </div>
      </header>

      <div className="play-panes">
        <button className={pane === 'sheet' ? 'on' : ''} onClick={() => setPane('sheet')}><ScrollText /> Run sheet</button>
        <button className={pane === 'log' ? 'on' : ''} onClick={() => setPane('log')}><NotebookPen /> Table log</button>
      </div>

      <div className={`play-body show-${pane}`}>
        <main className="play-sheet">
          <label className="row faint play-hide"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide finished blocks</label>
          {sBlocks.length === 0 ? <div className="empty">This session has no run sheet yet.</div> : (
            <RunSheet mode="play" all={sBlocks} blocks={hideDone ? sBlocks.filter((b) => !b.completed) : sBlocks} />
          )}
        </main>
        <aside className="play-log">
          <h4 className="play-side-title">Table log</h4>
          <TableLog n={cur.number} />
        </aside>
      </div>

      {drawer && (
        <>
          <div className="play-scrim" onClick={() => setDrawer(null)} />
          <aside className="play-drawer">
            <div className="play-drawer-head"><b>{DRAWERS[drawer][0]}</b><button className="btn ghost icon sm" onClick={() => setDrawer(null)} title="Close"><X /></button></div>
            <div className="play-drawer-body">{DRAWERS[drawer][1]}</div>
          </aside>
        </>
      )}
      {finish && <Wrapup session={cur} sessions={sorted} blocks={sBlocks} onClose={() => setFinish(false)} onDone={exit} />}
    </div>
  )
}
