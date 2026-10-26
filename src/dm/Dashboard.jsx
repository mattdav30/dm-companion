import { useMemo, useState } from 'react'
import { useNavigate } from '../lib/router.jsx'
import { UserRound, Compass, ArrowRight, MapPin, Clock, Users, FileText, Swords, Plus, ExternalLink, Shield, Crown, Flame, Feather, Check, ChevronRight, Mail, Play, BookOpen, Gem, Contact } from 'lucide-react'
import { useCampaign } from '../lib/campaign.jsx'
import SessionEmail from './SessionEmail.jsx'
import { useTable, insertRow, updateRow, errorText } from '../lib/data.js'
import { Panel, Badge, useToast, clickable } from '../ui/kit.jsx'
import { Portrait } from '../ui/art.jsx'
import MapThumb from './MapThumb.jsx'

const THREAD_ICON = { 'Main Plot': Flame, Faction: Shield, 'Character Arc': Feather, Romance: Crown, Investigation: Compass, 'NPC Arc': UserRound }

export default function Dashboard() {
  const nav = useNavigate()
  const toast = useToast()
  const { campaign } = useCampaign()
  const sessions = useTable('sessions').rows
  const lore = useTable('lore_entries').rows
  const npcs = useTable('npcs').rows
  const locations = useTable('locations').rows
  const items = useTable('items').rows
  const characters = useTable('characters').rows
  const threads = useTable('threads').rows
  const notes = useTable('quick_notes').rows
  const [draft, setDraft] = useState('')
  const [mail, setMail] = useState(false)

  const completed = sessions.filter((s) => /complete/i.test(s.status || ''))
  const next = sessions.filter((s) => !/complete/i.test(s.status || '')).sort((a, b) => a.number - b.number)[0]
  const recent = [...completed].sort((a, b) => b.number - a.number).slice(0, 3)
  const activeThreads = threads.filter((t) => /active/i.test(t.status || '')).slice(0, 4)
  const openNotes = notes.filter((n) => n.status !== 'Done').slice(0, 5)
  const beats = useMemo(() => {
    if (!next) return []
    const out = []
    npcs.filter((x) => x.target_session === next.number && x.next_beat).forEach((x) => out.push({ key: 'n' + x.id, title: x.name, text: x.next_beat, to: `/npcs?id=${x.id}` }))
    threads.filter((x) => x.target_session === next.number && x.next_beat).forEach((x) => out.push({ key: 't' + x.id, title: x.title, text: x.next_beat, to: `/threads?id=${x.id}` }))
    return out.slice(0, 6)
  }, [next, npcs, threads])
  const partyChars = useMemo(() => [...characters].sort((a, b) => a.name.localeCompare(b.name)), [characters])

  async function addNote(e) {
    e.preventDefault()
    if (!draft.trim()) return
    try {
      await insertRow('quick_notes', { note: draft.trim(), status: 'Open', created_at: new Date().toISOString() })
      setDraft('')
    } catch (err) {
      toast(errorText(err), 'error')
    }
  }

  const stats = [
    { icon: Swords, label: 'Sessions', n: completed.length, cap: 'Completed', link: 'View sessions', to: '/sessions' },
    { icon: BookOpen, label: 'Lore entries', n: lore.length, cap: 'People, places, events', link: 'Open lore book', to: '/lore' },
    { icon: Users, label: 'NPCs', n: npcs.length, cap: 'Allies, enemies, factions', link: 'View NPCs', to: '/npcs' },
    { icon: MapPin, label: 'Locations', n: locations.length, cap: 'Mapped and discovered', link: 'View locations', to: '/locations' },
    { icon: Gem, label: 'Items', n: items.length, cap: 'Gear, relics, treasures', link: 'View items', to: '/items' },
  ]

  return (
    <div className="dash">
      {mail && next && <SessionEmail session={next} onClose={() => setMail(false)} />}
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Campaign dashboard</div>
          <h1 className="hero-title">{campaign.name}</h1>
          {campaign.subtitle && <p className="hero-sub">{campaign.subtitle}</p>}
          <div className="hero-tag">{completed.length} {completed.length === 1 ? 'session' : 'sessions'} played · {sessions.length - completed.length} planned · {characters.length} in the party</div>
          {sessions.length === 0 && characters.length === 0 && (
            <div className="getting-started">
              <b>Getting started</b>
              <button className="link" onClick={() => nav('/characters')}><UserRound size={15} /> Add the party's characters</button>
              <button className="link" onClick={() => nav('/sessions')}><Swords size={15} /> Plan your first session</button>
              <button className="link" onClick={() => nav('/players')}><Contact size={15} /> Invite your players</button>
            </div>
          )}
        </div>
        <Panel framed className="next-card" title="Next session" action={next ? <span className="next-date">{next.planned_date || 'Date to be set'}</span> : null}>
          {next ? (
            <>
              <div className="next-title">Session {next.number}<span>{next.title}</span></div>
              {next.location && <div className="meta-row"><span><MapPin /> {next.location}</span></div>}
              <div className="meta-row one-line">
                {next.prep && <span><Clock /> {(next.prep.match(/(\d+\s*[–-]\s*\d+|\d+)\s*hours?/i) || [])[0] || 'Prep ready'}</span>}
                <span><Users /> {characters.length} Players</span>
                <button className="link-inline" onClick={() => nav(`/sessions?n=${next.number}`)}><FileText /> Prep Notes</button>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 15.5, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{next.summary}</p>
              <div className="next-actions">
                <button className="btn primary" onClick={() => nav(`/sessions?n=${next.number}`)}><Swords /> <span className="btn-label">Open session</span></button>
                <button className="btn icon gold" onClick={() => nav(`/play?n=${next.number}`)} title="Play mode for game night" aria-label="Play mode"><Play /></button>
                <button className="btn icon" onClick={() => setMail(true)} title="Email the players about this session" aria-label="Email the players"><Mail /></button>
              </div>
            </>
          ) : (
            <div className="muted">No planned sessions. Add one from Sessions.</div>
          )}
        </Panel>
      </section>

      <div className="stats">
        {stats.map((s) => (
          <div key={s.label} className="panel stat" {...clickable(() => nav(s.to))}>
            <div className="stat-icon"><s.icon /></div>
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">{s.label}</div>
              <div className="stat-num">{s.n}</div>
              <div className="stat-cap">{s.cap}</div>
              <div className="stat-link">{s.link} <ArrowRight size={14} /></div>
            </div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <Panel title="Recent sessions" bodyClass={null} action={<button className="link" onClick={() => nav('/sessions')}>View all <ArrowRight size={15} /></button>}>
          <div className="row-list">
            {recent.length === 0 && <div className="empty">No completed sessions yet.</div>}
            {recent.map((s, i) => (
              <button key={s.id} className="parchment sess-row" onClick={() => nav(`/sessions?n=${s.number}`)}>
                <div className="sess-thumb">{toRoman(s.number)}</div>
                <div style={{ minWidth: 0 }}>
                  <h4>Session {s.number}</h4>
                  <div style={{ fontFamily: 'var(--title)', fontSize: 17 }}>{s.title}</div>
                  {s.planned_date && <small className="faint">{s.planned_date}</small>}
                </div>
                <p style={{ maxWidth: 220 }}>{s.summary}</p>
                <ChevronRight className="row-arrow" size={20} />
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Campaign map" bodyClass={null} action={<button className="link" onClick={() => nav('/map')}>Open map <ExternalLink size={14} /></button>}>
          <div className="map-preview" {...clickable(() => nav('/map'))}><MapThumb /></div>
        </Panel>

        <Panel title="Quick notes" bodyClass={null} action={<button className="link" onClick={() => nav('/toolkit?tab=notes')} aria-label="All notes"><Plus size={18} /></button>}>
          <form onSubmit={addNote} style={{ padding: '10px 14px 4px' }}>
            <input className="input" placeholder="Jot a note and press Enter" value={draft} onChange={(e) => setDraft(e.target.value)} />
          </form>
          {openNotes.length === 0 && <div className="empty" style={{ padding: 20 }}>No open notes.</div>}
          {openNotes.map((n) => {
            const [head, ...rest] = (n.note || '').split(/[:\n]/)
            return (
              <div key={n.id} className="note-item">
                <FileText />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{head}</b>
                  {rest.length > 0 && <span>{rest.join(':').trim()}</span>}
                </div>
                <button className="btn sm icon ghost" title="Mark done" onClick={() => updateRow('quick_notes', n.id, { status: 'Done' }).catch((e) => toast(errorText(e), 'error'))}><Check /></button>
              </div>
            )
          })}
        </Panel>
      </div>

      <div className="dash-grid-2">
        <Panel title="Current party" bodyClass={null} action={<span className="muted" style={{ marginLeft: 'auto', fontSize: 15 }}>{characters.length} members</span>}>
          {partyChars.length === 0 && <div className="empty" style={{ padding: 20 }}>Add characters to see the party here.</div>}
          {partyChars.length > 0 && <div className="parchment party" style={{ margin: 12 }}>
            {partyChars.map((c) => (
              <div key={c.id} className="member" {...clickable(() => nav(`/characters?id=${c.id}`))}>
                <Portrait name={c.name} url={c.portrait_url} />
                <b>{c.name.split(',')[0]}</b>
                <small>{[c.race, c.class_name].filter(Boolean).join(' ')}{c.player ? <><br />{c.player}</> : null}</small>
              </div>
            ))}
          </div>}
        </Panel>
        <Panel title="Active threads" bodyClass={null} action={<button className="link" onClick={() => nav('/threads')}>View all <ArrowRight size={15} /></button>}>
          {activeThreads.length === 0 && <div className="empty" style={{ padding: 20 }}>Active story threads will show here.</div>}
          {activeThreads.length > 0 && <div className="parchment" style={{ margin: 12 }}>
            {activeThreads.map((t, i) => {
              const Icon = THREAD_ICON[t.category] || Swords
              return (
                <div key={t.id} className="thread-row" style={{ borderTop: i ? '1px solid var(--line-soft)' : 0, cursor: 'pointer' }} {...clickable(() => nav(`/threads?id=${t.id}`))}>
                  <Icon className="ic" size={20} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4>{t.title}</h4>
                    <p>{t.summary}</p>
                  </div>
                  <Badge tone={/main/i.test(t.category) ? 'solid-red' : 'grey'}>{/main/i.test(t.category) ? 'Major' : t.category}</Badge>
                </div>
              )
            })}
          </div>}
        </Panel>
        <Panel title={next ? `Beats for session ${next.number}` : 'Upcoming beats'} bodyClass={null}>
          {beats.length === 0 && <div className="empty" style={{ padding: 20 }}>No NPC or thread beats aimed at the next session.</div>}
          {beats.map((b) => (
            <div key={b.key} className="beat" style={{ cursor: 'pointer' }} {...clickable(() => nav(b.to))}>
              <b>{b.title}</b>
              <span>{b.text}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  )
}

export function toRoman(n) {
  if (!n) return '0'
  const map = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  let x = n
  for (const [v, s] of map) while (x >= v) { out += s; x -= v }
  return out
}
