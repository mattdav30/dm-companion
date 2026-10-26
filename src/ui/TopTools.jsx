import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '../lib/router.jsx'
import { Bell, Download, Type, Plus, Settings, ChevronDown, ScrollText, Contact, Eye, ArrowLeft } from 'lucide-react'
import { api } from '../lib/api.js'
import { getCampaignId, insertRow, rpc, errorText } from '../lib/data.js'
import { useToast, Modal, AutoTextarea } from './kit.jsx'

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

/* ---------- Comfort mode ---------- */
export function useComfort() {
  const [on, setOn] = useState(() => store.get('dmc.comfort', '0') === '1')
  useEffect(() => {
    document.body.classList.toggle('comfort', on)
    store.set('dmc.comfort', on ? '1' : '0')
  }, [on])
  return [on, setOn]
}

export function ComfortButton() {
  const [on, setOn] = useComfort()
  return (
    <button className={`top-chip ${on ? 'on' : ''}`} onClick={() => setOn(!on)} title="Larger text and calmer colours for the table">
      <Type size={15} /> Comfort
    </button>
  )
}

/* ---------- Backup ---------- */
export function BackupButton() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    try {
      const payload = await api.get(`/c/${getCampaignId()}/export`)
      const tables = payload.tables
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(payload.campaign?.name || 'campaign').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      const rows = Object.values(tables).reduce((n, r) => n + r.length, 0)
      toast(`Backup saved: ${rows} records`)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button className="top-chip hide-md" onClick={run} disabled={busy} title="Download the whole campaign as a file">
      <Download size={15} /> {busy ? 'Saving…' : 'Backup'}
    </button>
  )
}

/* ---------- Quick note ---------- */
export function NoteButton() {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  async function save() {
    if (!text.trim()) return
    try {
      await insertRow('quick_notes', { note: text.trim(), status: 'Open', created_at: new Date().toISOString() })
      toast('Note saved')
      setText('')
      setOpen(false)
    } catch (e) { toast(errorText(e), 'error') }
  }
  return (
    <>
      <button className="top-chip hide-md" onClick={() => setOpen(true)}><Plus size={15} /> Note</button>
      {open && (
        <Modal title="Quick note" onClose={() => setOpen(false)} width={560} footer={<><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" onClick={save}>Save note</button></>}>
          <AutoTextarea rows={4} value={text} onChange={setText} placeholder="Black Catechists: growing influence in the Marches" autoFocus />
        </Modal>
      )}
    </>
  )
}

/* ---------- Notifications (DM) ---------- */
function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export function Notifications() {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [seen, setSeen] = useState(() => store.get('dmc.seen.' + getCampaignId(), '1970-01-01'))
  const ref = useRef()
  useEffect(() => {
    let live = true
    async function load() {
      const act = await rpc('dm_activity')
      const notes = { data: act.notes }, tracker = { data: act.tracker }, entries = { data: act.entries }, invites = { data: act.invites }, members = { data: act.members }
      const who = (id) => members.data?.find((m) => m.user_id === id)?.display_name || 'A player'
      const out = []
      notes.data?.forEach((n) => out.push({ key: 'n' + n.id, at: n.updated_at, text: `${who(n.author_id)} shared a note: ${n.title || n.category}`, to: '/player-view/journal' }))
      tracker.data?.forEach((t) => out.push({ key: 't' + t.id, at: t.updated_at, text: `${who(t.created_by)} updated the tracker: ${t.title}`, to: '/player-view/tracker' }))
      entries.data?.filter((e) => e.scope === 'party').forEach((e) => out.push({ key: 'e' + e.id, at: e.updated_at, text: `${who(e.author_id)} wrote about ${e.name}`, to: '/player-view/entries' }))
      invites.data?.forEach((i) => out.push({ key: 'i' + i.id, at: i.claimed_at, text: `${who(i.claimed_by)} joined with invite ${i.code}`, to: '/players' }))
      out.sort((a, b) => (a.at < b.at ? 1 : -1))
      if (live) setItems(out.slice(0, 30))
    }
    load().catch(() => {})
    const t = setInterval(() => load().catch(() => {}), 120000)
    return () => { live = false; clearInterval(t) }
  }, [])
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const unread = useMemo(() => items.filter((i) => i.at > seen).length, [items, seen])
  function toggle() {
    setOpen(!open)
    if (!open && items[0]) {
      store.set('dmc.seen.' + getCampaignId(), items[0].at)
      setTimeout(() => setSeen(items[0].at), 1500)
    }
  }
  return (
    <div className="bell" ref={ref}>
      <button className="btn icon ghost" onClick={toggle} aria-label="Notifications">
        <Bell size={19} />
        {unread > 0 && <i className="bell-dot">{unread > 9 ? '9+' : unread}</i>}
      </button>
      {open && (
        <div className="bell-menu panel">
          <div className="panel-head"><h3>Player activity</h3></div>
          {items.length === 0 && <div className="empty" style={{ padding: 22, fontSize: 16 }}>Nothing from the players this month.</div>}
          {items.map((i) => (
            <button key={i.key} className={`bell-item ${i.at > seen ? 'new' : ''}`} onClick={() => { setOpen(false); nav(i.to) }}>
              <span>{i.text}</span>
              <small>{ago(i.at)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Gear menu: comfort, backup, quick note, live status ---------- */
export function GearMenu({ children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.modal-back') && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  return (
    <div className="bell" ref={ref}>
      <button className={`btn icon ghost ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-label="Settings and tools" title="Settings and tools"><Settings size={19} /></button>
      <div className="bell-menu panel gear-menu" hidden={!open}>
        <div className="panel-head"><h3>Tools</h3><span className="live" style={{ marginLeft: 'auto' }}><i /> Live</span></div>
        <div className="gear-list">{children}</div>
      </div>
    </div>
  )
}

/* ---------- Campaign selector chip ---------- */
export function CampaignChip({ name = 'Campaign', links = [] }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const icons = { overview: ScrollText, players: Contact, view: Eye, settings: Settings }
  return (
    <div className="bell camp-chip-wrap hide-sm" ref={ref}>
      <button className="camp-chip" onClick={() => setOpen(!open)}>
        <span>{name}</span> <ChevronDown size={15} />
      </button>
      {open && (
        <div className="bell-menu panel" style={{ width: 260 }}>
          <div className="panel-head"><h3>Campaign</h3></div>
          {links.map((l) => {
            const I = icons[l.icon] || ScrollText
            return <button key={l.to} className="bell-item gear-row" onClick={() => { setOpen(false); nav(l.to) }}><I size={16} /> {l.label}</button>
          })}
          <a className="bell-item gear-row" href="/"><ArrowLeft size={16} /> All campaigns</a>
        </div>
      )}
    </div>
  )
}

/* ---------- Text size (large print) ---------- */
const TEXT_SIZES = [100, 115, 130, 150]
export function useTextSize() {
  const [lvl, setLvl] = useState(() => Math.max(0, Math.min(3, +store.get('dmc.text', '0') || 0)))
  useEffect(() => {
    document.body.classList.remove('tz-1', 'tz-2', 'tz-3')
    if (lvl > 0) document.body.classList.add('tz-' + lvl)
    store.set('dmc.text', String(lvl))
  }, [lvl])
  return [lvl, setLvl]
}
export function TextSize() {
  const [lvl, setLvl] = useTextSize()
  return (
    <div className="text-size" role="group" aria-label="Text size">
      <button className="ts-small" onClick={() => setLvl(Math.max(0, lvl - 1))} disabled={lvl === 0} aria-label="Smaller text" title="Smaller text">A</button>
      <span aria-live="polite">{TEXT_SIZES[lvl]}%</span>
      <button className="ts-big" onClick={() => setLvl(Math.min(3, lvl + 1))} disabled={lvl === 3} aria-label="Bigger text" title="Bigger text">A</button>
    </div>
  )
}
