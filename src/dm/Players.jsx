import { useState } from 'react'
import { useNavigate } from '../lib/router.jsx'
import { Plus, Copy, Trash2, Eye, KeyRound } from 'lucide-react'
import { useTable, insertRow, updateRow, deleteRow, rpc, loadTable, errorText } from '../lib/data.js'
import { Panel, Badge, Toggle, Modal, useToast } from '../ui/kit.jsx'
import { Portrait } from '../ui/art.jsx'

function code() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

export default function Players() {
  const toast = useToast()
  const nav = useNavigate()
  const { rows: members } = useTable('campaign_members')
  const { rows: invites } = useTable('player_invites')
  const { rows: shares } = useTable('player_shared_content')
  const { rows: chars } = useTable('characters')
  const { rows: profiles } = useTable('player_profiles')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [handout, setHandout] = useState(null)
  const charName = (id) => chars.find((c) => c.id === id)?.name
  const players = members.filter((m) => m.role === 'player')

  const safe = (p, msg) => p.then(() => msg && toast(msg)).catch((e) => toast(errorText(e), 'error'))

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Table and companions</div>
          <h1 className="h-page">Players</h1>
        </div>
        <div className="spacer" />
        <button className="btn gold" onClick={() => nav('/player-view')}><Eye /> Preview player view</button>
        <button className="btn primary" onClick={() => setInviteOpen(true)}><KeyRound /> New invite code</button>
      </div>

      <div className="grid-2">
        <Panel title="Party members" bodyClass={null}>
          {players.length === 0 && <div className="empty">No players have joined yet.</div>}
          {players.map((m) => (
            <div key={m.id} className="rec-item member-row" style={{ cursor: 'default', alignItems: 'center' }}>
              <Portrait name={charName(m.character_id) || m.display_name} size="sm" url={profiles.find((p) => p.user_id === m.user_id)?.avatar_url || chars.find((c) => c.id === m.character_id)?.portrait_url} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4>{m.display_name || 'Player'}</h4>
                <p>{charName(m.character_id) || 'No character linked'}</p>
              </div>
              <select className="select member-char" value={m.character_id ?? ''} onChange={(e) => safe(updateRow('campaign_members', m.id, { character_id: e.target.value ? Number(e.target.value) : null }), 'Character linked')}>
                <option value="">No character</option>
                {chars.map((c) => <option key={c.id} value={c.id}>{c.name.split(',')[0]}</option>)}
              </select>
              <span className="row" style={{ gap: 6 }} title="Active"><Toggle on={m.active} onChange={(v) => safe(updateRow('campaign_members', m.id, { active: v }), v ? 'Player enabled' : 'Player disabled')} /></span>
            </div>
          ))}
        </Panel>

        <Panel title="Invite codes" bodyClass={null}>
          {invites.length === 0 && <div className="empty">No invites yet. Create a code and send it to a player.</div>}
          {invites.map((i) => (
            <div key={i.id} className="rec-item" style={{ cursor: 'default', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: '.12em' }}>{i.code}</h4>
                <p>{i.label || 'Invite'}{i.character_id ? ` · ${charName(i.character_id)}` : ''}</p>
              </div>
              {i.claimed_by ? <Badge tone="grey">Claimed</Badge> : <Badge tone={i.active ? 'green' : 'grey'}>{i.active ? 'Open' : 'Closed'}</Badge>}
              <button className="btn sm icon ghost" title="Copy code" onClick={() => navigator.clipboard?.writeText(i.code).then(() => toast('Code copied'))}><Copy /></button>
              {!i.claimed_by && <Toggle on={i.active} onChange={(v) => safe(updateRow('player_invites', i.id, { active: v }))} />}
              <button className="btn sm icon ghost" title="Delete" onClick={() => confirm('Delete this invite?') && safe(deleteRow('player_invites', i.id), 'Invite deleted')}><Trash2 /></button>
            </div>
          ))}
          <div className="panel-body faint" style={{ fontSize: 14.5 }}>Players create an account on the sign-in page, then enter the code to join.</div>
        </Panel>
      </div>

      <Panel title="Shared with players" style={{ marginTop: 16 }} bodyClass={null} action={<button className="link" onClick={() => setHandout({ content_type: 'handout', title: '', subtitle: '', body: '', audience: 'party', audience_character_id: '' })}><Plus size={16} /> New handout</button>}>
        <div className="panel-body faint" style={{ fontSize: 14.5, paddingBottom: 0 }}>Use Share on any NPC, location or item to add it here. Only published entries reach the players.</div>
        <div style={{ padding: '8px 0' }}>
          {shares.map((s) => (
            <div key={s.id} className="rec-item" style={{ cursor: 'default', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4>{s.title}</h4>
                <p>{[s.subtitle, s.audience === 'character' ? `Only ${charName(s.audience_character_id) || 'one character'}` : 'Whole party'].filter(Boolean).join(' · ')}</p>
              </div>
              <Badge tone="grey">{s.content_type}</Badge>
              <span className="row muted" style={{ gap: 8, fontSize: 14.5 }}><span className="shared-state">Published</span> <Toggle on={s.published} onChange={(v) => safe(updateRow('player_shared_content', s.id, { published: v }), v ? 'Published' : 'Hidden from players')} /></span>
              <button className="btn sm icon ghost" title="Remove" onClick={() => confirm(`Remove “${s.title}” from the players' codex?`) && safe(deleteRow('player_shared_content', s.id), 'Removed')}><Trash2 /></button>
            </div>
          ))}
        </div>
      </Panel>

      {inviteOpen && <InviteModal chars={chars} onClose={() => setInviteOpen(false)} />}
      {handout && <HandoutModal chars={chars} initial={handout} onClose={() => setHandout(null)} />}
    </div>
  )
}

function InviteModal({ chars, onClose }) {
  const toast = useToast()
  const [v, setV] = useState({ code: code(), label: '', character_id: '' })
  async function save() {
    try {
      await insertRow('player_invites', { code: v.code, label: v.label || null, character_id: v.character_id ? Number(v.character_id) : null, active: true })
      toast(`Invite ${v.code} created`)
      onClose()
    } catch (e) { toast(errorText(e), 'error') }
  }
  return (
    <Modal title="New invite code" onClose={onClose} width={560} footer={<><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Create invite</button></>}>
      <div className="form-grid">
        <div className="field"><label>Code</label><input className="input" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} /></div>
        <div className="field"><label>Label</label><input className="input" placeholder="Player name" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} /></div>
        <div className="field full"><label>Character</label><select className="select" value={v.character_id} onChange={(e) => setV({ ...v, character_id: e.target.value })}><option value="">Choose later</option>{chars.map((c) => <option key={c.id} value={c.id}>{c.name.split(',')[0]}</option>)}</select></div>
      </div>
    </Modal>
  )
}

function HandoutModal({ chars, initial, onClose }) {
  const toast = useToast()
  const [v, setV] = useState(initial)
  async function save() {
    if (!v.title) return toast('A title is required', 'error')
    try {
      await rpc('publish_player_content', {
        p_content_type: v.content_type || 'handout', p_source_id: null, p_title: v.title, p_subtitle: v.subtitle || '', p_body: v.body || '', p_metadata: {},
        p_audience: v.audience_character_id ? 'character' : 'party', p_audience_character_id: v.audience_character_id ? Number(v.audience_character_id) : null,
      })
      loadTable('player_shared_content', true)
      toast('Handout published')
      onClose()
    } catch (e) { toast(errorText(e), 'error') }
  }
  return (
    <Modal title="New handout" onClose={onClose} width={720} footer={<><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Publish</button></>}>
      <div className="form-grid">
        <div className="field"><label>Title</label><input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
        <div className="field"><label>Subtitle</label><input className="input" value={v.subtitle} onChange={(e) => setV({ ...v, subtitle: e.target.value })} /></div>
        <div className="field"><label>Type</label><select className="select" value={v.content_type} onChange={(e) => setV({ ...v, content_type: e.target.value })}>{['handout', 'letter', 'rumour', 'npc', 'location', 'item'].map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label>Audience</label><select className="select" value={v.audience_character_id} onChange={(e) => setV({ ...v, audience_character_id: e.target.value })}><option value="">Whole party</option>{chars.map((c) => <option key={c.id} value={c.id}>Only {c.name.split(',')[0]}</option>)}</select></div>
        <div className="field full"><label>Text</label><textarea className="textarea" style={{ minHeight: 200 }} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></div>
      </div>
    </Modal>
  )
}
