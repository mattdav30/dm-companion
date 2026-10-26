import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard, ScrollText, Map as MapIcon, Swords, UserRound, Users, HeartHandshake, MapPin, Gem, Spline, Split,
  Images, BookOpen, Wrench, Contact, KeyRound, Plus, Settings, Crown, ArrowLeft, ChevronRight,
} from 'lucide-react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from './lib/router.jsx'
import { api } from './lib/api.js'
import { setCampaignId, errorText, useTable } from './lib/data.js'
import { CampaignCtx, useCampaign } from './lib/campaign.jsx'
import { ToastProvider, Panel, Loading, Modal, useToast } from './ui/kit.jsx'
import { Sidebar, Topbar, SearchBox, SignOut, useCloseOnNav, Profile } from './ui/Shell.jsx'
import { ComfortButton, BackupButton, NoteButton, Notifications, useComfort, GearMenu, CampaignChip, TextSize } from './ui/TopTools.jsx'
import { Emblem, Portrait } from './ui/art.jsx'
import { ENTITIES } from './entities.js'
import { BRAND } from './brand.js'
const Dashboard = lazy(() => import('./dm/Dashboard.jsx'))
const Records = lazy(() => import('./dm/Records.jsx'))
const Tabbed = lazy(() => import('./dm/Records.jsx').then((m) => ({ default: m.Tabbed })))
const Sessions = lazy(() => import('./dm/Sessions.jsx'))
const PlayMode = lazy(() => import('./dm/PlayMode.jsx'))
const WorldMap = lazy(() => import('./dm/WorldMap.jsx'))
const Players = lazy(() => import('./dm/Players.jsx'))
const LoreSociety = lazy(() => import('./lore/DmLore.jsx'))
const Overview = lazy(() => import('./dm/Extras.jsx').then((m) => ({ default: m.Overview })))
const Toolkit = lazy(() => import('./dm/Extras.jsx').then((m) => ({ default: m.Toolkit })))
const CampaignSettings = lazy(() => import('./dm/CampaignSettings.jsx'))
import { PlayerData, PlayerRoutes, PLAYER_NAV, PlayerBadge } from './player/PlayerApp.jsx'

const DM_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/overview', label: 'Campaign Overview', icon: ScrollText },
  { to: '/map', label: 'World Map', icon: MapIcon },
  { to: '/sessions', label: 'Sessions', icon: Swords },
  { label: 'The world' },
  { to: '/characters', label: 'Characters', icon: UserRound },
  { to: '/npcs', label: 'NPCs', icon: Users },
  { to: '/relationships', label: 'Relationships', icon: HeartHandshake },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/items', label: 'Items', icon: Gem },
  { label: 'The story' },
  { to: '/threads', label: 'Story Threads', icon: Spline },
  { to: '/choices', label: 'Choices', icon: Split },
  { to: '/lore', label: 'Lore & Society', icon: BookOpen },
  { label: 'Table' },
  { to: '/maps', label: 'Maps & Music', icon: Images, small: true },
  { to: '/players', label: 'Players', icon: Contact, small: true },
  { to: '/toolkit', label: 'DM Toolkit', icon: Wrench, small: true },
  { to: '/settings', label: 'Campaign Settings', icon: Settings, small: true },
]

const CAMPAIGN_PATH = /^\/c\/([0-9a-f-]{36})(?:\/|$)/

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  )
}

function Root() {
  const [user, setUser] = useState(undefined) // undefined while loading, null when signed out
  useEffect(() => {
    api.get('/auth/me').then((r) => setUser(r?.user || null)).catch(() => setUser(null))
    const out = () => setUser(null)
    window.addEventListener('dmc:signed-out', out)
    return () => window.removeEventListener('dmc:signed-out', out)
  }, [])
  if (user === undefined) return <Splash />
  if (!user) return <Login onSignedIn={setUser} />
  const m = window.location.pathname.match(CAMPAIGN_PATH)
  if (m) return <CampaignRoot key={m[1]} cid={m[1]} user={user} />
  return (
    <BrowserRouter>
      <Home user={user} setUser={setUser} />
    </BrowserRouter>
  )
}

function Splash({ text = 'Rolling for initiative…' }) {
  return (
    <div className="splash">
      <div>
        <Emblem className="brand-emblem lg" />
        <div className="eyebrow" style={{ marginTop: 14 }}>{text}</div>
      </div>
    </div>
  )
}

export async function signOut() {
  try { await api.post('/auth/logout') } catch { /* already signed out */ }
  location.href = '/'
}

/* ---------- Home: your campaigns ---------- */
function Home({ user, setUser }) {
  const toast = useToast()
  const [list, setList] = useState(null)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [account, setAccount] = useState(false)
  const load = useCallback(() => api.get('/campaigns').then((r) => setList(r.campaigns)).catch((e) => { toast(errorText(e), 'error'); setList([]) }), [toast])
  useEffect(() => { load() }, [load])
  useEffect(() => { document.title = `Your campaigns · ${BRAND.name}` }, [])
  const running = (list || []).filter((c) => c.role === 'dm')
  const playing = (list || []).filter((c) => c.role !== 'dm')
  return (
    <div className="home">
      <header className="home-top">
        <div className="home-brand"><Emblem /><div><strong>{BRAND.name}</strong><small>{BRAND.tagline}</small></div></div>
        <div className="spacer" />
        <button className="home-user" onClick={() => setAccount(true)} title="Account">
          <Portrait name={user.name} size="sm" />
          <span className="hide-sm">{user.name}</span>
        </button>
        <SignOut onClick={signOut} />
      </header>
      <main className="home-main">
        <div className="home-hero">
          <div>
            <div className="eyebrow">Welcome back, {user.name.split(' ')[0]}</div>
            <h1 className="h-page">Your campaigns</h1>
            <p className="muted">Run your own games as the DM, or join a friend's campaign with the invite code they send you. One account works for every campaign.</p>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn" onClick={() => setJoining(true)}><KeyRound /> Join with a code</button>
            <button className="btn primary" onClick={() => setCreating(true)}><Plus /> New campaign</button>
          </div>
        </div>
        {list === null ? <Loading /> : (
          <>
            <CampaignGroup title="Campaigns you run" icon={Crown} items={running} empty={
              <div className="empty-card">
                <b>No campaigns yet</b>
                <span>Create one to start building your world, prepping sessions and inviting players.</span>
                <button className="btn primary sm" onClick={() => setCreating(true)}><Plus /> Create your first campaign</button>
              </div>
            } />
            <CampaignGroup title="Campaigns you play in" icon={Users} items={playing} empty={
              <div className="empty-card">
                <b>Playing in a friend's game?</b>
                <span>When a DM sends you an invite code, add it here to join their campaign.</span>
                <button className="btn sm" onClick={() => setJoining(true)}><KeyRound /> Join with a code</button>
              </div>
            } />
          </>
        )}
      </main>
      {creating && <CreateCampaign onClose={() => setCreating(false)} />}
      {joining && <JoinCampaign onClose={() => setJoining(false)} />}
      {account && <Account user={user} setUser={setUser} onClose={() => setAccount(false)} />}
    </div>
  )
}

function ago(at) {
  const d = Math.round((Date.now() - Date.parse(at)) / 86400000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(at).toLocaleDateString()
}

function CampaignGroup({ title, icon: Icon, items, empty }) {
  return (
    <section className="camp-group">
      <h2 className="camp-group-title"><Icon size={18} /> {title}<span>{items.length}</span></h2>
      {items.length === 0 ? empty : (
        <div className="camp-grid">
          {items.map((c) => (
            <a key={c.id} className="camp-card" href={`/c/${c.id}`}>
              <div className="camp-card-top">
                <span className={`camp-role ${c.role}`}>{c.role === 'dm' ? 'Dungeon Master' : 'Player'}</span>
                <ChevronRight size={18} />
              </div>
              <h3>{c.name}</h3>
              {c.subtitle && <p>{c.subtitle}</p>}
              <div className="camp-meta">
                {c.role === 'dm'
                  ? <span><Users size={14} /> {c.players} {c.players === 1 ? 'player' : 'players'}</span>
                  : <span><Crown size={14} /> DM: {c.owner_name}</span>}
                <span>Updated {ago(c.updated_at)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}

function CreateCampaign({ onClose }) {
  const toast = useToast()
  const [v, setV] = useState({ name: '', subtitle: '' })
  const [busy, setBusy] = useState(false)
  async function save(e) {
    e?.preventDefault()
    if (!v.name.trim()) return toast('Give the campaign a name', 'error')
    setBusy(true)
    try {
      const r = await api.post('/campaigns', v)
      location.href = `/c/${r.campaign.id}`
    } catch (err) { toast(errorText(err), 'error'); setBusy(false) }
  }
  return (
    <Modal title="New campaign" onClose={onClose} footer={<><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Creating…' : 'Create campaign'}</button></>}>
      <form onSubmit={save} className="form-grid">
        <div className="field full"><label htmlFor="nc-name">Campaign name</label><input id="nc-name" className="input" autoFocus placeholder="The Shattered Crown" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
        <div className="field full"><label htmlFor="nc-sub">Tagline (optional)</label><input id="nc-sub" className="input" placeholder="A dark fantasy campaign for four players" value={v.subtitle} onChange={(e) => setV({ ...v, subtitle: e.target.value })} /></div>
      </form>
      <p className="faint" style={{ marginBottom: 0 }}>You will be the Dungeon Master. Invite players from the Players page once it is set up.</p>
    </Modal>
  )
}

function JoinCampaign({ onClose }) {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  async function join(e) {
    e?.preventDefault()
    setBusy(true)
    try {
      const r = await api.post('/join', { code })
      toast(`Welcome to ${r.campaign.name}`)
      location.href = `/c/${r.campaign.id}`
    } catch (err) { toast(errorText(err), 'error'); setBusy(false) }
  }
  return (
    <Modal title="Join a campaign" onClose={onClose} footer={<><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button><button className="btn primary" onClick={join} disabled={busy || !code.trim()}><KeyRound /> {busy ? 'Joining…' : 'Join'}</button></>}>
      <form onSubmit={join} className="stack" style={{ gap: 10 }}>
        <label className="faint" htmlFor="join-code">Enter the invite code your DM gave you.</label>
        <input id="join-code" className="input code-input" autoFocus placeholder="ABCD-EFGH" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      </form>
    </Modal>
  )
}

function Account({ user, setUser, onClose }) {
  const toast = useToast()
  const [name, setName] = useState(user.name)
  const [pw, setPw] = useState({ current: '', next: '' })
  async function saveName() {
    try { const r = await api.patch('/auth/me', { name }); setUser(r.user); toast('Name saved') } catch (e) { toast(errorText(e), 'error') }
  }
  async function savePw(e) {
    e.preventDefault()
    try { await api.post('/auth/password', pw); setPw({ current: '', next: '' }); toast('Password changed. Other devices have been signed out.') } catch (err) { toast(errorText(err), 'error') }
  }
  return (
    <Modal title="Your account" onClose={onClose}>
      <div className="stack" style={{ gap: 18 }}>
        <div className="field"><label>Email</label><div className="muted">{user.email}</div></div>
        <div className="field"><label htmlFor="acc-name">Your name</label>
          <div className="row" style={{ gap: 8 }}><input id="acc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn" onClick={saveName} disabled={!name.trim() || name === user.name}>Save</button></div>
        </div>
        <form onSubmit={savePw} className="stack" style={{ gap: 10 }}>
          <label className="eyebrow">Change password</label>
          <input className="input" type="password" autoComplete="current-password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input className="input" type="password" autoComplete="new-password" placeholder="New password (8 characters or more)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <button className="btn" disabled={!pw.current || pw.next.length < 8}>Change password</button>
        </form>
      </div>
    </Modal>
  )
}

/* ---------- One campaign ---------- */
function CampaignRoot({ cid, user }) {
  const [state, setState] = useState(null) // { campaign, member, profile } or { error }
  const load = useCallback(() => api.get(`/campaigns/${cid}`).then(setState).catch((e) => setState({ error: e })), [cid])
  // Point the data layer at this campaign before any page asks for rows.
  useMemo(() => setCampaignId(cid), [cid])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (state?.campaign) document.title = `${state.campaign.name} · ${BRAND.name}` }, [state?.campaign])
  if (!state) return <Splash text="Opening the campaign…" />
  if (state.error) return (
    <div className="splash">
      <div style={{ maxWidth: 420 }}>
        <Emblem className="brand-emblem lg" />
        <h2 className="h-page" style={{ fontSize: 28, marginTop: 16 }}>Campaign unavailable</h2>
        <p className="muted">{errorText(state.error)}</p>
        <a className="btn primary" href="/"><ArrowLeft /> Back to your campaigns</a>
      </div>
    </div>
  )
  const ctx = { user, campaign: state.campaign, member: state.member, profile: state.profile, refresh: load }
  return (
    <CampaignCtx.Provider value={ctx}>
      <BrowserRouter basename={`/c/${cid}`}>
        {state.member.role === 'dm' ? <DmApp /> : <PlayerShell />}
      </BrowserRouter>
    </CampaignCtx.Provider>
  )
}

function currentNav(items, pathname) {
  const hits = items.filter((n) => n.to && (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))
  return hits.sort((a, b) => b.to.length - a.to.length)[0]
}

function DmApp() {
  const { user, campaign } = useCampaign()
  const [menu, setMenu] = useState(false)
  useCloseOnNav(setMenu)
  useComfort()
  const loc = useLocation()
  const npcs = useTable('npcs').rows
  const locs = useTable('locations').rows
  const sessions = useTable('sessions').rows
  const lore = useTable('lore_entries').rows
  const items = useTable('items').rows
  const threads = useTable('threads').rows
  const chars = useTable('characters').rows
  const sources = useMemo(() => [
    { kind: 'Session', rows: sessions, title: (r) => `${r.number}. ${r.title}`, to: (r) => `/sessions?n=${r.number}` },
    { kind: 'Character', rows: chars, title: (r) => r.name, to: (r) => `/characters?id=${r.id}` },
    { kind: 'NPC', rows: npcs, title: (r) => r.name, extra: (r) => `${r.role || ''} ${r.faction || ''}`, to: (r) => `/npcs?id=${r.id}` },
    { kind: 'Location', rows: locs, title: (r) => r.name, extra: (r) => r.region, to: (r) => `/locations?id=${r.id}` },
    { kind: 'Item', rows: items, title: (r) => r.name, to: (r) => `/items?id=${r.id}` },
    { kind: 'Thread', rows: threads, title: (r) => r.title, to: (r) => `/threads?id=${r.id}` },
    { kind: 'Lore', rows: lore, title: (r) => r.title, to: (r) => `/lore?tab=lore&id=${r.id}` },
  ], [npcs, locs, sessions, lore, items, threads, chars])

  if (loc.pathname === '/play') return <Suspense fallback={<Loading />}><PlayMode /></Suspense>

  return (
    <div className="app">
      <Sidebar items={DM_NAV} open={menu} onClose={() => setMenu(false)} title={campaign.name} subtitle="Dungeon Master" footer={<div className="row" style={{ justifyContent: 'space-between' }}><a className="btn sm ghost" href="/"><ArrowLeft /> Campaigns</a><SignOut onClick={signOut} /></div>} />
      <div className="main">
        <Topbar
          onMenu={() => setMenu(true)}
          search={<SearchBox sources={sources} />}
          right={<>
            <TextSize />
            <CampaignChip name={campaign.name} links={[{ to: '/overview', label: 'Campaign overview', icon: 'overview' }, { to: '/players', label: 'Players and invites', icon: 'players' }, { to: '/player-view', label: 'See the player view', icon: 'view' }, { to: '/settings', label: 'Campaign settings', icon: 'settings' }]} />
            <Notifications />
            <GearMenu>
              <ComfortButton />
              <BackupButton />
              <NoteButton />
            </GearMenu>
            <Profile name={user.name} tagline="Dungeon Master" initials={user.name.slice(0, 2).toUpperCase()} />
          </>}
        />
        <main className="content">
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/map" element={<WorldMap mode="dm" uid={user.id} />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/characters" element={<Records ent={ENTITIES.characters} />} />
              <Route path="/npcs" element={<Records ent={ENTITIES.npcs} />} />
              <Route path="/relationships" element={<Records ent={ENTITIES.relationships} />} />
              <Route path="/locations" element={<Records ent={ENTITIES.locations} />} />
              <Route path="/items" element={<Records ent={ENTITIES.items} />} />
              <Route path="/threads" element={<Records ent={ENTITIES.threads} />} />
              <Route path="/choices" element={<Tabbed tabs={[
                { key: 'choices', label: 'Choices', render: () => <Records ent={ENTITIES.choices} /> },
                { key: 'consequences', label: 'Consequences', render: () => <Records ent={ENTITIES.consequences} /> },
              ]} />} />
              <Route path="/lore" element={<LoreSociety />} />
              <Route path="/maps" element={<Tabbed tabs={[
                { key: 'maps', label: 'Maps', render: () => <Records ent={ENTITIES.maps} /> },
                { key: 'music', label: 'Music', render: () => <Records ent={ENTITIES.music} /> },
              ]} />} />
              <Route path="/players" element={<Players />} />
              <Route path="/toolkit" element={<Toolkit />} />
              <Route path="/settings" element={<CampaignSettings />} />
              <Route path="/player-view/*" element={<PlayerPreview uid={user.id} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function PlayerPreview({ uid }) {
  const { rows: members } = useTable('campaign_members')
  const { rows: chars } = useTable('characters')
  const players = members.filter((m) => m.role === 'player' && m.active)
  const [charId, setCharId] = useState(null)
  const preview = useMemo(() => ({ characterId: charId }), [charId])
  return (
    <div>
      <Panel style={{ marginBottom: 16 }} bodyClass="panel-body">
        <div className="row wrap" style={{ gap: 12 }}>
          <div>
            <div className="eyebrow">Player view preview</div>
            <div className="muted" style={{ fontSize: 15 }}>This is what players see. DM-only material stays hidden.</div>
          </div>
          <div style={{ flex: 1 }} />
          <select className="select" style={{ width: 240 }} value={charId ?? ''} onChange={(e) => setCharId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Whole party</option>
            {players.filter((m) => m.character_id).map((m) => <option key={m.id} value={m.character_id}>{m.display_name} · {chars.find((c) => c.id === m.character_id)?.name?.split(',')[0] || 'No character'}</option>)}
          </select>
        </div>
        <nav className="tabs preview-tabs">
          {PLAYER_NAV.map((n) => (
            <NavLink key={n.to} to={`/player-view${n.to === '/' ? '' : n.to}`} end={n.to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>{n.label}</NavLink>
          ))}
        </nav>
      </Panel>
      <PlayerData key={charId ?? 'party'} preview={preview}>
        <PlayerRoutes uid={uid} base="/player-view" />
      </PlayerData>
    </div>
  )
}

/* ---------- Player ---------- */
function PlayerShell() {
  const { user, campaign, member, profile } = useCampaign()
  const [menu, setMenu] = useState(false)
  useCloseOnNav(setMenu)
  const name = profile?.display_name || member?.display_name || user.name
  useComfort()
  return (
    <PlayerData>
      <div className="app">
        <Sidebar items={PLAYER_NAV} open={menu} onClose={() => setMenu(false)} title={campaign.name} subtitle="Player companion" footer={<div className="row" style={{ justifyContent: 'space-between' }}><a className="btn sm ghost" href="/"><ArrowLeft /> Campaigns</a><SignOut onClick={signOut} /></div>} />
        <div className="main">
          <Topbar onMenu={() => setMenu(true)} crumb={<PlayerCrumb />} search={<div style={{ flex: 1 }} />} right={<><span className="live hide-sm"><i /> Live</span><TextSize /><span className="hide-sm"><ComfortButton /></span><PlayerBadge fallback={name} /></>} />
          <main className="content">
            <PlayerRoutes uid={user.id} />
          </main>
        </div>
      </div>
    </PlayerData>
  )
}

function PlayerCrumb() {
  const { campaign } = useCampaign()
  const loc = useLocation()
  const here = currentNav(PLAYER_NAV, loc.pathname) || PLAYER_NAV[0]
  return (
    <div className="crumb">
      <div><b>{campaign.name}</b><small>{here.label}</small></div>
    </div>
  )
}

/* ---------- Sign in ---------- */
function AuthFrame({ children }) {
  return (
    <div className="login">
      <div className="login-art" aria-hidden="true">
        <div className="login-glow" />
        <div className="login-copy">
          <Emblem className="brand-emblem xl" />
          <h1>Your whole campaign,<br />in one place.</h1>
          <p>Prep sessions, track your world and share what the party has learned. Players join with an invite code and keep their own journal.</p>
        </div>
      </div>
      <div className="login-form">
        <div className="login-card">
          <div className="home-brand" style={{ marginBottom: 26 }}><Emblem /><div><strong>{BRAND.name}</strong><small>{BRAND.tagline}</small></div></div>
          {children}
        </div>
      </div>
    </div>
  )
}

function Login({ onSignedIn }) {
  const toast = useToast()
  const [mode, setMode] = useState(() => (window.location.pathname === '/signup' ? 'up' : 'in'))
  useEffect(() => { document.title = `${mode === 'up' ? 'Create your account' : 'Sign in'} · ${BRAND.name}` }, [mode])
  const [v, setV] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const r = mode === 'in' ? await api.post('/auth/login', { email: v.email, password: v.password }) : await api.post('/auth/signup', v)
      // Ready for Google Tag Manager or Ads conversion tracking when a tag is added.
      if (mode === 'up') (window.dataLayer = window.dataLayer || []).push({ event: 'sign_up', method: 'email' })
      if (/^\/(signin|signup|login)$/.test(window.location.pathname)) window.history.replaceState(null, '', '/')
      onSignedIn(r.user)
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  return (
    <AuthFrame>
      <h2 className="auth-title">{mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create your account' : 'Forgot your password?'}</h2>
      {mode === 'reset' ? (
        <p className="muted">Password reset by email is coming soon. For now, email <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a> from the address on your account and we will help you get back in.</p>
      ) : (
        <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
          {mode === 'up' && <div className="field"><label htmlFor="su-name">Your name</label><input id="su-name" className="input" autoComplete="name" value={v.name} onChange={set('name')} required /></div>}
          <div className="field"><label htmlFor="su-email">Email</label><input id="su-email" className="input" type="email" autoComplete="email" value={v.email} onChange={set('email')} required /></div>
          <div className="field"><label htmlFor="su-pw">Password</label><input id="su-pw" className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={v.password} onChange={set('password')} required minLength={mode === 'up' ? 8 : undefined} />{mode === 'up' && <small className="faint">At least 8 characters.</small>}</div>
          <button className="btn primary lg" disabled={busy}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        </form>
      )}
      <div className="auth-links">
        {mode === 'in'
          ? <><span>New here? <a href="#" onClick={(e) => { e.preventDefault(); setMode('up') }}>Create an account</a></span><a href="#" onClick={(e) => { e.preventDefault(); setMode('reset') }}>Forgot password</a></>
          : <span>Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); setMode('in') }}>Sign in</a></span>}
      </div>
    </AuthFrame>
  )
}
