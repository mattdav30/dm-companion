import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useSearchParams } from '../lib/router.jsx'
import { Home, BookMarked, BookOpen, Map as MapIcon, NotebookPen, ListChecks, Feather, UserRound, Plus, Pin, Trash2, Pencil, Search, Users, Lock, Globe, Eye, Network, ImagePlus } from 'lucide-react'
import { useRpc, rpc, insertRow, updateRow, deleteRow, errorText } from '../lib/data.js'
import { Panel, Badge, Modal, useToast, Loading, AutoTextarea, clickable } from '../ui/kit.jsx'
import { Portrait } from '../ui/art.jsx'
import { useCampaign } from '../lib/campaign.jsx'
import { resizeImage, uploadArt, pickFile } from '../lib/upload.js'
import { Profile as ProfileChip } from '../ui/Shell.jsx'
import WorldMap from '../dm/WorldMap.jsx'
const LoreBook = lazy(() => import('../lore/LoreBook.jsx'))
const Society = lazy(() => import('../lore/Society.jsx'))

export const PLAYER_NAV = [
  { to: '/', label: 'Home', icon: Home, img: 'dashboard' },
  { to: '/codex', label: 'Codex', icon: BookMarked, img: 'archive' },
  { to: '/lore', label: 'Lore & Society', icon: BookOpen, img: 'lore' },
  { to: '/map', label: 'World Map', icon: MapIcon, img: 'map' },
  { to: '/journal', label: 'Journal', icon: NotebookPen, img: 'notes' },
  { to: '/tracker', label: 'Party Tracker', icon: ListChecks, img: 'choices' },
  { to: '/entries', label: 'My Entries', icon: Feather, img: 'maps' },
  { to: '/profile', label: 'Profile', icon: UserRound, img: 'profile' },
]

const Ctx = createContext(null)
const usePD = () => useContext(Ctx)

/* preview: { characterId } when a DM is looking through a player's eyes (read only). */
export function PlayerData({ preview, children }) {
  const snap = useRpc(preview ? 'dm_player_preview_data' : 'player_data_snapshot', preview ? { target_character_id: preview.characterId ?? null, include_hidden: false } : undefined)
  const lore = useRpc(preview ? 'dm_player_preview_lore' : 'player_lore_snapshot', preview ? { include_hidden: false } : undefined)
  const { refresh: r1 } = snap
  const { refresh: r2 } = lore
  useEffect(() => {
    // Keep the party view current while the DM shares things mid-session.
    const tick = () => { if (document.visibilityState === 'visible') { r1(); r2() } }
    const t = setInterval(tick, 45000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [r1, r2])
  const value = useMemo(() => ({
    data: snap.data || { shares: [], notes: [], tracker: [], entries: [], profiles: [], bookmarks: [] },
    lore: lore.data || { lore: [], societies: [], reputations: [], edges: [] },
    loading: snap.loading,
    error: snap.error || lore.error,
    reload: () => { snap.refresh(); lore.refresh() }, // quiet refresh, no loading flash after a save
    readOnly: !!preview,
  }), [snap, lore, preview])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function PlayerBadge({ fallback }) {
  const { data } = usePD()
  const name = data.profile?.display_name || fallback || 'Player'
  return <ProfileChip name={name} tagline="Player" initials={name.slice(0, 2).toUpperCase()} img={data.profile?.avatar_url || null} />
}

export function PlayerRoutes({ uid, base = '' }) {
  return (
    <Routes>
      <Route path="/" element={<PlayerHome base={base} />} />
      <Route path="/codex" element={<Codex />} />
      <Route path="/lore" element={<Lore />} />
      <Route path="/map" element={<PlayerMap uid={uid} />} />
      <Route path="/journal" element={<Journal uid={uid} />} />
      <Route path="/tracker" element={<Tracker uid={uid} />} />
      <Route path="/entries" element={<Entries uid={uid} />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="*" element={<Navigate to={base || '/'} replace />} />
    </Routes>
  )
}

function ReadOnlyNote() {
  const { readOnly } = usePD()
  if (!readOnly) return null
  return <div className="badge blue" style={{ height: 28, fontSize: 11 }}><Eye /> Preview · read only</div>
}

/* ---------- Home ---------- */
function PlayerHome({ base }) {
  const { data, lore, loading } = usePD()
  const { campaign } = useCampaign()
  const nav = useNavigate()
  if (loading) return <Loading />
  const me = data.profile
  const pinned = data.tracker.filter((t) => t.pinned || t.status === 'Active').slice(0, 5)
  const recentShares = data.shares.slice(0, 5)
  const partyNotes = data.notes.filter((n) => n.scope === 'party').slice(0, 4)
  const go = (p) => nav(base + p)
  return (
    <div className="dash">
      <section className="hero" style={{ gridTemplateColumns: '1fr', minHeight: 230 }}>
        <div className="hero-copy">
          <div className="eyebrow">Welcome back{me?.display_name ? `, ${me.display_name}` : ''}</div>
          <h1 className="hero-title">{campaign.name}</h1>
          {campaign.subtitle && <p className="hero-sub">{campaign.subtitle}</p>}
        </div>
      </section>
      <div className="row" style={{ margin: '14px 0' }}><ReadOnlyNote /></div>
      <div className="stats four">
        {[
          [BookMarked, 'Codex', data.shares.length, 'People and places you know', '/codex'],
          [BookOpen, 'Lore', lore.lore.length, 'Revealed entries', '/lore'],
          [NotebookPen, 'Journal', data.notes.length, 'Your notes and the party’s', '/journal'],
          [ListChecks, 'Tracker', data.tracker.length, 'Open leads and mysteries', '/tracker'],
        ].map(([Icon, label, n, cap, to]) => (
          <div key={label} className="panel stat" {...clickable(() => go(to))}>
            <div className="stat-icon"><Icon /></div>
            <div><div className="eyebrow">{label}</div><div className="stat-num">{n}</div><div className="stat-cap">{cap}</div></div>
          </div>
        ))}
      </div>
      <div className="dash-grid">
        <Panel title="Recently revealed" bodyClass={null}>
          <div className="row-list">
            {recentShares.length === 0 && <div className="empty">Nothing shared yet.</div>}
            {recentShares.map((s) => (
              <button key={s.id} className="parchment sess-row" style={{ gridTemplateColumns: '1fr auto' }} onClick={() => go('/codex')}>
                <div><h4>{s.title}</h4><p>{s.subtitle || s.body}</p></div>
                <Badge tone="grey">{s.content_type}</Badge>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Party tracker" bodyClass={null}>
          {pinned.length === 0 && <div className="empty" style={{ padding: 20 }}>No open leads.</div>}
          {pinned.map((t) => (
            <div key={t.id} className="note-item">{t.pinned ? <Pin /> : <ListChecks />}<div><b>{t.title}</b><span>{t.category}</span></div></div>
          ))}
        </Panel>
        <Panel title="The party" bodyClass={null}>
          <div className="parchment party" style={{ margin: 12 }}>
            {data.profiles.length === 0 && <div className="faint">No one else has joined yet.</div>}
            {data.profiles.map((p) => (
              <div key={p.user_id || p.display_name} className="member"><Portrait name={p.display_name} size="sm" url={p.avatar_url} /><b style={{ fontSize: 16 }}>{p.display_name}</b></div>
            ))}
          </div>
          {partyNotes.map((n) => (
            <div key={n.id} className="note-item"><NotebookPen /><div><b>{n.title || 'Party note'}</b><span>{(n.body || '').slice(0, 90)}</span></div></div>
          ))}
        </Panel>
      </div>
    </div>
  )
}

/* ---------- Codex ---------- */
function groupBy(list, fn) {
  const m = new Map()
  list.forEach((x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x) })
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
}

function Codex() {
  const { data, loading } = usePD()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [open, setOpen] = useState(null)
  const types = [...new Set(data.shares.map((s) => s.content_type))]
  const list = data.shares.filter((s) => (!type || s.content_type === type) && (!q || `${s.title} ${s.subtitle} ${s.body}`.toLowerCase().includes(q.toLowerCase())))
  if (loading) return <Loading />
  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">What the party knows</div><h1 className="h-page">Codex</h1></div>
        <span className="sub">{data.shares.length} entries</span>
        <div className="spacer" />
        <div className="search" style={{ maxWidth: 320 }}><Search /><input placeholder="Search the codex…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="tabs">
        <button className={!type ? 'on' : ''} onClick={() => setType('')}>All</button>
        {types.map((t) => <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t}s</button>)}
      </div>
      {(type === 'location' ? groupBy(list, (s) => s.metadata?.area || 'Other places') : [[null, list]]).map(([g, items]) => (
      <div key={g || 'all'}>
      {g && <h4 className="scene-title" style={{ marginTop: 18 }}>{g} <span className="faint" style={{ fontSize: 12 }}>{items.length}</span></h4>}
      <div className="cards">
        {items.map((s) => (
          <div key={s.id} className="panel card" {...clickable(() => setOpen(s))}>
            <div className="row" style={{ gap: 12 }}>
              {s.content_type === 'npc' && <Portrait name={s.title} size="sm" url={s.metadata?.portrait_url} />}
              <div style={{ minWidth: 0 }}><h4>{s.title}</h4>{s.subtitle && <div className="eyebrow" style={{ fontSize: 10 }}>{s.subtitle}</div>}</div>
            </div>
            {s.body && <p style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.body}</p>}
            <div className="row" style={{ marginTop: 10, gap: 6 }}>
              <Badge tone="grey">{s.content_type}</Badge>
              {s.audience === 'character' && <Badge tone="violet">Just for you</Badge>}
            </div>
          </div>
        ))}
      </div>
      </div>
      ))}
      {list.length === 0 && <div className="empty">Nothing here yet.</div>}
      {open && (
        <Modal title={open.content_type} onClose={() => setOpen(null)}>
          <div className="row" style={{ gap: 18 }}>
            {open.content_type === 'npc' && <Portrait name={open.title} size="lg" url={open.metadata?.portrait_url} />}
            <div>
              <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--title)', fontSize: 32, fontWeight: 500, color: 'var(--parch)' }}>{open.title}</h2>
              {open.subtitle && <div className="eyebrow">{open.subtitle}</div>}
            </div>
          </div>
          <div className="parchment pre" style={{ padding: '18px 20px', marginTop: 14, fontSize: 18 }}>{open.body || 'No further details.'}</div>
          {open.metadata && Object.keys(open.metadata).length > 0 && (
            <dl className="detail-body" style={{ padding: '16px 0 0' }}>
              {Object.entries(open.metadata).filter(([k]) => k !== 'portrait_url').map(([k, v]) => <div key={k} className="fact"><dt>{k.replace(/_/g, ' ')}</dt><dd>{String(v)}</dd></div>)}
            </dl>
          )}
        </Modal>
      )}
    </div>
  )
}

/* ---------- Lore ---------- */
function Lore() {
  const { lore, loading } = usePD()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'society' ? 'society' : 'lore'
  if (loading) return <Loading />
  const known = lore.societies.filter((s) => s.current_level > 0).length
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{tab === 'lore' ? 'What the party has learned' : 'Peoples, powers and standing'}</div>
          <h1 className="h-page">{tab === 'lore' ? 'Lore Book' : 'Society'}</h1>
        </div>
        <div className="sub">{tab === 'lore' ? `${lore.lore.length} entries` : `${known} societies known`}</div>
        <div className="spacer" />
        <div className="seg">
          <button className={tab === 'lore' ? 'on' : ''} onClick={() => setParams({ tab: 'lore' })}><BookOpen /> Lore Book</button>
          <button className={tab === 'society' ? 'on' : ''} onClick={() => setParams({ tab: 'society' })}><Network /> Society</button>
        </div>
      </div>
      <Suspense fallback={<Loading />}>{tab === 'lore'
        ? <LoreBook entries={lore.lore} emptyText="The book is empty for now. Entries appear here as the party learns them." />
        : <Society nodes={lore.societies} edges={lore.edges} reps={lore.reputations} />}</Suspense>
    </div>
  )
}

function PlayerMap({ uid }) {
  const { readOnly } = usePD()
  return <WorldMap mode="player" uid={uid} readOnly={readOnly} />
}

/* ---------- Journal ---------- */
function Journal({ uid }) {
  const { data, reload, readOnly, loading } = usePD()
  const toast = useToast()
  const [edit, setEdit] = useState(null)
  const [scope, setScope] = useState('')
  const list = data.notes.filter((n) => !scope || n.scope === scope)
  async function save(v) {
    try {
      await rpc('player_save_note_v2', { payload: v })
      reload()
      setEdit(null)
      toast('Note saved')
    } catch (e) { toast(errorText(e), 'error') }
  }
  async function remove(n) {
    if (!confirm('Delete this note?')) return
    try { await deleteRow('player_notes', n.id); reload() } catch (e) { toast(errorText(e), 'error') }
  }
  if (loading) return <Loading />
  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Your record of the road</div><h1 className="h-page">Journal</h1></div>
        <div className="spacer" />
        <div className="seg">
          <button className={!scope ? 'on' : ''} onClick={() => setScope('')}>All</button>
          <button className={scope === 'private' ? 'on' : ''} onClick={() => setScope('private')}><Lock /> Mine</button>
          <button className={scope === 'party' ? 'on' : ''} onClick={() => setScope('party')}><Users /> Party</button>
        </div>
        {!readOnly && <button className="btn primary" onClick={() => setEdit({ scope: 'private', category: 'Note', title: '', body: '', session_number: '' })}><Plus /> New note</button>}
      </div>
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>
        {list.map((n) => {
          const mine = n.author_id === uid
          return (
            <div key={n.id} className="panel card" style={{ cursor: 'default' }}>
              <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                <Badge tone={n.scope === 'party' ? 'blue' : 'grey'}>{n.scope === 'party' ? 'Party' : 'Private'}</Badge>
                <Badge tone="grey">{n.category}</Badge>
                {n.session_number != null && <span className="faint" style={{ fontSize: 14 }}>Session {n.session_number}</span>}
                <div style={{ flex: 1 }} />
                {mine && !readOnly && <button className="btn sm icon ghost" onClick={() => setEdit({ ...n, session_number: n.session_number ?? '' })}><Pencil /></button>}
                {mine && !readOnly && <button className="btn sm icon ghost" onClick={() => remove(n)}><Trash2 /></button>}
              </div>
              <h4>{n.title || 'Untitled'}</h4>
              <p className="pre" style={{ color: 'var(--text)' }}>{n.body}</p>
            </div>
          )
        })}
      </div>
      {list.length === 0 && <div className="empty">No notes yet.</div>}
      {edit && (
        <Modal title={edit.id ? 'Edit note' : 'New note'} onClose={() => setEdit(null)} footer={<><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={() => save(edit)}>Save</button></>}>
          <div className="form-grid">
            <div className="field full"><label>Title</label><input className="input" value={edit.title || ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
            <div className="field"><label>Category</label><select className="select" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{['Note', 'Clue', 'Quest', 'NPC', 'Location', 'Theory', 'Loot'].map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Session</label><input className="input" type="number" value={edit.session_number} onChange={(e) => setEdit({ ...edit, session_number: e.target.value })} /></div>
            <div className="field full"><label>Visibility</label><select className="select" value={edit.scope} onChange={(e) => setEdit({ ...edit, scope: e.target.value })}><option value="private">Private to me</option><option value="party">Shared with the party</option></select></div>
            <div className="field full"><label>Note</label><AutoTextarea rows={6} value={edit.body} onChange={(v) => setEdit({ ...edit, body: v })} /></div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ---------- Party tracker ---------- */
function Tracker({ uid }) {
  const { data, reload, readOnly, loading } = usePD()
  const toast = useToast()
  const [edit, setEdit] = useState(null)
  const safe = (p) => p.then(reload).catch((e) => toast(errorText(e), 'error'))
  async function save() {
    const v = { category: edit.category, title: edit.title, body: edit.body, status: edit.status, pinned: !!edit.pinned }
    if (!v.title) return toast('A title is required', 'error')
    try {
      if (edit.id) await updateRow('party_tracker', edit.id, v)
      else await insertRow('party_tracker', { ...v, created_by: uid })
      reload()
      setEdit(null)
    } catch (e) { toast(errorText(e), 'error') }
  }
  const groups = ['Active', 'Resolved'].map((st) => [st, data.tracker.filter((t) => (st === 'Active' ? t.status !== 'Resolved' : t.status === 'Resolved'))])
  if (loading) return <Loading />
  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Shared by the whole party</div><h1 className="h-page">Party Tracker</h1></div>
        <div className="spacer" />
        {!readOnly && <button className="btn primary" onClick={() => setEdit({ category: 'Mystery', title: '', body: '', status: 'Active', pinned: false })}><Plus /> New lead</button>}
      </div>
      {groups.map(([st, items]) => (
        <div key={st} style={{ marginBottom: 20 }}>
          <h4 className="scene-title">{st}</h4>
          {items.length === 0 && <div className="faint">Nothing here.</div>}
          <div className="cards">
            {items.map((t) => (
              <div key={t.id} className="panel card" {...clickable(() => !readOnly && setEdit(t))}>
                <div className="row" style={{ gap: 6, marginBottom: 6 }}>{t.pinned && <Pin size={15} color="var(--gold)" />}<Badge tone="grey">{t.category}</Badge><Badge>{t.status}</Badge></div>
                <h4>{t.title}</h4>
                {t.body && <p className="pre">{t.body}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
      {edit && (
        <Modal title={edit.id ? 'Edit lead' : 'New lead'} onClose={() => setEdit(null)} footer={<>
          {edit.id && <button className="btn danger" onClick={() => confirm('Delete this lead?') && safe(deleteRow('party_tracker', edit.id)).then(() => setEdit(null))}><Trash2 /> Delete</button>}
          <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
          <div className="form-grid">
            <div className="field full"><label>Title</label><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
            <div className="field"><label>Category</label><select className="select" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{['Mystery', 'Quest', 'Lead', 'Rumour', 'Goal', 'Debt'].map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Status</label><select className="select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{['Active', 'Stalled', 'Resolved'].map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field full"><label>Details</label><AutoTextarea value={edit.body} onChange={(v) => setEdit({ ...edit, body: v })} /></div>
            <label className="row muted" style={{ gap: 8 }}><input type="checkbox" checked={!!edit.pinned} onChange={(e) => setEdit({ ...edit, pinned: e.target.checked })} /> Pin to the top</label>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ---------- My entries (player-written NPCs and places) ---------- */
function Entries({ uid }) {
  const { data, reload, readOnly, loading } = usePD()
  const toast = useToast()
  const [edit, setEdit] = useState(null)
  async function save() {
    if (!edit.name) return toast('A name is required', 'error')
    try {
      await rpc('player_save_entry', { entry_id: edit.id || null, new_entry_type: edit.entry_type, new_scope: edit.scope, new_name: edit.name, new_subtitle: edit.subtitle || '', new_body: edit.body || '', new_metadata: edit.metadata || {} })
      reload()
      setEdit(null)
    } catch (e) { toast(errorText(e), 'error') }
  }
  if (loading) return <Loading />
  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">People and places in your own words</div><h1 className="h-page">My Entries</h1></div>
        <div className="spacer" />
        {!readOnly && <button className="btn primary" onClick={() => setEdit({ entry_type: 'npc', scope: 'private', name: '', subtitle: '', body: '' })}><Plus /> New entry</button>}
      </div>
      <div className="cards">
        {data.entries.map((e) => (
          <div key={e.id} className="panel card" {...clickable(() => !readOnly && e.author_id === uid && setEdit(e))}>
            <div className="row" style={{ gap: 6, marginBottom: 6 }}><Badge tone="grey">{e.entry_type}</Badge><Badge tone={e.scope === 'party' ? 'blue' : 'grey'}>{e.scope === 'party' ? <><Globe /> Party</> : <><Lock /> Private</>}</Badge></div>
            <h4>{e.name}</h4>
            {e.subtitle && <div className="eyebrow" style={{ fontSize: 10 }}>{e.subtitle}</div>}
            {e.body && <p className="pre">{e.body}</p>}
          </div>
        ))}
      </div>
      {data.entries.length === 0 && <div className="empty">No entries yet. Record the people and places you meet.</div>}
      {edit && (
        <Modal title={edit.id ? 'Edit entry' : 'New entry'} onClose={() => setEdit(null)} footer={<>
          {edit.id && <button className="btn danger" onClick={() => confirm('Delete this entry?') && deleteRow('player_entries', edit.id).then(() => { reload(); setEdit(null) }).catch((e) => toast(errorText(e), 'error'))}><Trash2 /> Delete</button>}
          <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
          <div className="form-grid">
            <div className="field"><label>Type</label><select className="select" value={edit.entry_type} onChange={(e) => setEdit({ ...edit, entry_type: e.target.value })}><option value="npc">Person</option><option value="location">Place</option></select></div>
            <div className="field"><label>Visibility</label><select className="select" value={edit.scope} onChange={(e) => setEdit({ ...edit, scope: e.target.value })}><option value="private">Private to me</option><option value="party">Shared with the party</option></select></div>
            <div className="field"><label>Name</label><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="field"><label>Subtitle</label><input className="input" value={edit.subtitle || ''} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} /></div>
            <div className="field full"><label>Notes</label><AutoTextarea rows={5} value={edit.body} onChange={(v) => setEdit({ ...edit, body: v })} /></div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ---------- Profile ---------- */
function Profile() {
  const { data, reload, readOnly } = usePD()
  const toast = useToast()
  const p = data.profile || {}
  const [v, setV] = useState({ display_name: p.display_name || '', accent_color: p.accent_color || '#d8a84e' })
  const [avatar, setAvatar] = useState(p.avatar_url || '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!data.profile) return
    setV({ display_name: data.profile.display_name || '', accent_color: data.profile.accent_color || '#d8a84e' })
    setAvatar(data.profile.avatar_url || '')
  }, [data.profile?.user_id, data.profile?.avatar_url, data.profile?.display_name])
  const payload = (extra = {}) => ({ display_name: v.display_name, accent_color: v.accent_color, background_preset: p.background_preset || 'parchment', background_url: p.background_url || '', font_scale: p.font_scale || 1, avatar_url: avatar, ...extra })
  async function save() {
    try {
      await rpc('player_save_profile_v2', { payload: payload() })
      reload()
      toast('Profile saved')
    } catch (e) { toast(errorText(e), 'error') }
  }
  async function upload() {
    const file = await pickFile()
    if (!file) return
    setBusy(true)
    try {
      const blob = await resizeImage(file, 400, true)
      const uid = data.profile?.user_id || data.member?.user_id || 'me'
      const url = await uploadArt(`avatars/${uid}/${Date.now()}.webp`, blob)
      setAvatar(url)
      await rpc('player_save_profile_v2', { payload: payload({ avatar_url: url }) })
      reload()
      toast('Picture saved')
    } catch (e) { toast(errorText(e), 'error') } finally { setBusy(false) }
  }
  async function removePic() {
    setAvatar('')
    try { await rpc('player_save_profile_v2', { payload: payload({ avatar_url: '' }) }); reload(); toast('Picture removed') } catch (e) { toast(errorText(e), 'error') }
  }
  return (
    <div style={{ maxWidth: 680 }}>
      <div className="page-head"><div><div className="eyebrow">Your seat at the table</div><h1 className="h-page">Profile</h1></div></div>
      <Panel framed>
        <div className="profile-hero">
          <Portrait name={v.display_name || 'Player'} size="lg" url={avatar || null} />
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Playing as</div>
            <div style={{ fontFamily: 'var(--title)', fontSize: 28, lineHeight: 1.1 }}>{v.display_name || 'Unnamed'}</div>
            {!readOnly && (
              <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={upload} disabled={busy}><ImagePlus /> {busy ? 'Uploading…' : avatar ? 'Change picture' : 'Add a picture'}</button>
                {avatar && <button className="btn ghost" onClick={removePic}>Remove</button>}
              </div>
            )}
            <div className="faint" style={{ fontSize: 14, marginTop: 8 }}>A headshot, character art or a logo. The party and the DM see it next to your name.</div>
          </div>
        </div>
        <div className="form-grid" style={{ marginTop: 18 }}>
          <div className="field"><label>Display name</label><input className="input" value={v.display_name} onChange={(e) => setV({ ...v, display_name: e.target.value })} disabled={readOnly} /></div>
          <div className="field"><label>Accent colour</label><input type="color" value={v.accent_color} onChange={(e) => setV({ ...v, accent_color: e.target.value })} disabled={readOnly} style={{ height: 40, width: 80, background: 'none', border: '1px solid var(--line)', borderRadius: 4 }} /></div>
        </div>
        {!readOnly && <button className="btn primary" style={{ marginTop: 18 }} onClick={save}>Save profile</button>}
      </Panel>
    </div>
  )
}
