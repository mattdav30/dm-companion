import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from '../lib/router.jsx'
import { Plus, Pencil, Trash2, CalendarDays, ScrollText, MapPin, Mail, Play, Flag, Sparkles } from 'lucide-react'
import SessionEmail from './SessionEmail.jsx'
import RunSheet from './RunSheet.jsx'
import BeatsModal, { useBeats } from './Beats.jsx'
import Wrapup from './Wrapup.jsx'
import { useTable, insertRow, updateRow, deleteRow, loadTable, rpc, errorText } from '../lib/data.js'
import { Panel, Badge, Modal, RecordForm, useToast, Toggle, Loading } from '../ui/kit.jsx'
import { BLOCK_TYPES } from '../entities.js'

const SESSION_FIELDS = [
  { key: 'number', label: 'Session number', type: 'number', required: true },
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'In Progress', 'Completed'] },
  { key: 'planned_date', label: 'Date', type: 'text', placeholder: 'e.g. 4 October 2026' },
  { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g. Greyhollow Pass', full: true },
  { key: 'summary', label: 'Summary', type: 'textarea' },
  { key: 'prep', label: 'Prep', type: 'textarea', dm: true },
  { key: 'outcome', label: 'Outcome', type: 'textarea' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

function BlockEditor({ block, sessionNumber, scenes, nextPos, onClose }) {
  const toast = useToast()
  const [v, setV] = useState(() => ({
    scene_title: block?.scene_title || scenes[scenes.length - 1] || 'Opening',
    block_type: block?.block_type || 'Narration',
    title: block?.title || '',
    content: block?.content || '',
    dm_only: block ? !!block.dm_only : false,
  }))
  const fields = [
    { key: 'scene_title', label: 'Scene', type: 'text', list: 'scene-list' },
    { key: 'block_type', label: 'Block type', type: 'select', options: Object.keys(BLOCK_TYPES) },
    { key: 'title', label: 'Title', type: 'text', full: true },
    { key: 'content', label: 'Content', type: 'textarea' },
    { key: 'dm_only', label: 'DM only', type: 'bool' },
  ]
  async function save() {
    const payload = { ...v, dm_only: v.dm_only ? 1 : 0 }
    try {
      if (block) await updateRow('session_blocks', block.id, payload)
      else await insertRow('session_blocks', { ...payload, session_number: sessionNumber, position: nextPos, completed: 0 })
      onClose()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  return (
    <Modal title={block ? 'Edit block' : 'New block'} onClose={onClose} footer={<><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <RecordForm fields={fields} values={v} setValues={setV} />
      <datalist id="scene-list">{scenes.map((s) => <option key={s} value={s} />)}</datalist>
    </Modal>
  )
}

export default function Sessions() {
  const toast = useToast()
  const { rows: sessions, loading } = useTable('sessions')
  const { rows: blocks } = useTable('session_blocks')
  const [params, setParams] = useSearchParams()
  const [edit, setEdit] = useState(null)
  const [mailFor, setMailFor] = useState(null)
  const [blockEdit, setBlockEdit] = useState(null)
  const [tab, setTab] = useState('run')
  const [hideDone, setHideDone] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [beatsOpen, setBeatsOpen] = useState(false)
  const [wrap, setWrap] = useState(false)
  const nav = useNavigate()
  const { rows: events } = useTable('session_events')

  const sorted = useMemo(() => [...sessions].sort((a, b) => a.number - b.number), [sessions])
  const defaultSession = sorted.find((s) => !/complete/i.test(s.status || '')) || sorted[sorted.length - 1]
  const n = params.get('n')
  const cur = sorted.find((s) => String(s.number) === n) || defaultSession
  useEffect(() => { setTypeFilter('') }, [cur?.number])

  const sBlocks = useMemo(() => blocks.filter((b) => b.session_number === cur?.number).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id), [blocks, cur])
  const shownBlocks = sBlocks.filter((b) => (!hideDone || !b.completed) && (!typeFilter || b.block_type === typeFilter))
  const sceneNames = [...new Set(sBlocks.map((b) => b.scene_title).filter(Boolean))]
  const types = [...new Set(sBlocks.map((b) => b.block_type).filter(Boolean))]
  const done = sBlocks.filter((b) => b.completed).length
  const beats = useBeats(cur, sBlocks)
  const newBeats = beats.filter((b) => !b.added).length
  const sEvents = events.filter((e) => e.session_number === cur?.number).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const isDone = /complete/i.test(cur?.status || '')

  async function move(b, dir) {
    // Swap with the nearest visible block in the same scene, then renumber the session in order.
    const same = shownBlocks.filter((x) => (x.scene_title || '') === (b.scene_title || ''))
    const other = same[same.indexOf(b) + dir]
    if (!other) return
    const list = [...sBlocks]
    const ia = list.indexOf(b), ib = list.indexOf(other)
    list[ia] = other; list[ib] = b
    try {
      await Promise.all(list.map((x, i) => (x.position !== i + 1 ? updateRow('session_blocks', x.id, { position: i + 1 }) : null)).filter(Boolean))
    } catch (e) { toast(errorText(e), 'error') }
  }
  async function removeBlock(b) {
    if (!confirm(`Delete block “${b.title || b.block_type}”?`)) return
    try { await deleteRow('session_blocks', b.id) } catch (e) { toast(errorText(e), 'error') }
  }
  async function removeSession() {
    if (!confirm(`Delete Session ${cur.number}: ${cur.title}? Its blocks stay in the database.`)) return
    try { await deleteRow('sessions', cur.id); setParams({}) } catch (e) { toast(errorText(e), 'error') }
  }

  if (loading) return <Loading />

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Session command</div>
          <h1 className="h-page">Sessions</h1>
        </div>
        <span className="sub">{sorted.filter((s) => /complete/i.test(s.status)).length} completed · {sorted.filter((s) => !/complete/i.test(s.status)).length} planned</span>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setEdit('new')}><Plus /> New session</button>
      </div>
      <div className="sess-layout">
        <Panel className="sess-nav" bodyClass={null}>
          {sorted.map((s) => (
            <button key={s.id} className={cur?.id === s.id ? 'on' : ''} onClick={() => setParams({ n: String(s.number) })}>
              <span className={`sess-num ${/complete/i.test(s.status) ? 'done' : ''}`}>{s.number}</span>
              <span style={{ minWidth: 0 }}>
                <b>{s.title}</b>
                <small>{s.status}{s.planned_date ? ` · ${s.planned_date}` : ''}</small>
              </span>
            </button>
          ))}
        </Panel>

        {cur ? (
          <div className="stack">
            <Panel framed bodyClass={null}>
              <div className="detail-head">
                <div className="sess-num" style={{ width: 64, height: 64, fontSize: 24 }}>{cur.number}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow">Session {cur.number}</div>
                  <h2>{cur.title}</h2>
                  <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
                    <Badge>{cur.status}</Badge>
                    {cur.planned_date && <span className="muted row" style={{ gap: 6, fontSize: 15 }}><CalendarDays size={15} /> {cur.planned_date}</span>}
                    {cur.location && <span className="muted row" style={{ gap: 6, fontSize: 15 }}><MapPin size={15} /> {cur.location}</span>}
                    <span className="muted" style={{ fontSize: 15 }}>{sBlocks.length} blocks · {done} done</span>
                  </div>
                </div>
                <div className="detail-actions">
                  <button className="btn sm primary" onClick={() => nav(`/play?n=${cur.number}`)} title="Full-screen view for game night"><Play /> Play</button>
                  {!isDone && <button className="btn sm gold" onClick={() => setWrap(true)} title="Wrap up after the game"><Flag /> Finish</button>}
                  {!isDone && <button className="btn sm" onClick={() => setMailFor(cur)} title="Email the players about this session"><Mail /> <span className="btn-label">Email players</span></button>}
                  <button className="btn sm" onClick={() => setEdit(cur)}><Pencil /> Edit</button>
                  <button className="btn sm danger icon" onClick={removeSession} title="Delete session"><Trash2 /></button>
                </div>
              </div>
              {sBlocks.length > 0 && (
                <div style={{ height: 4, background: 'var(--line-soft)' }}>
                  <div style={{ height: '100%', width: `${(done / sBlocks.length) * 100}%`, background: 'linear-gradient(90deg, var(--blood-2), var(--gold))' }} />
                </div>
              )}
            </Panel>

            <div className="tabs" style={{ marginBottom: 0 }}>
              <button className={tab === 'run' ? 'on' : ''} onClick={() => setTab('run')}>Run sheet</button>
              <button className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>Summary &amp; prep</button>
            </div>

            {tab === 'notes' && (
              <Panel>
                <dl className="detail-body" style={{ padding: 0 }}>
                  {SESSION_FIELDS.filter((f) => f.type === 'textarea').map((f) => (
                    <div key={f.key} className={`fact full ${f.dm ? 'dm' : ''}`}>
                      <dt>{f.label}</dt>
                      <dd>{cur[f.key] || <span className="faint">Nothing written yet.</span>}</dd>
                    </div>
                  ))}
                </dl>
                {sEvents.length > 0 && (
                  <div className="fact full" style={{ marginTop: 14 }}>
                    <dt>Table log</dt>
                    <dd>{sEvents.map((e) => <div key={e.id}><b>{e.event_type || 'Note'}:</b> {[e.subject, e.detail].filter(Boolean).join('. ')}</div>)}</dd>
                  </div>
                )}
              </Panel>
            )}

            {tab === 'run' && (
              <div>
                <div className="row wrap" style={{ gap: 12, marginBottom: 6 }}>
                  <select className="select" style={{ width: 'auto', height: 36 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="">All block types</option>
                    {types.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <span className="row muted" style={{ gap: 8, fontSize: 15.5 }}><Toggle on={hideDone} onChange={setHideDone} /> Hide completed</span>
                  <div style={{ flex: 1 }} />
                  {!isDone && <button className={`btn sm ${newBeats ? 'beats-ready' : ''}`} onClick={() => setBeatsOpen(true)} title="Turn NPC, thread and relationship next beats aimed at this session into blocks"><Sparkles /> Pull in beats{newBeats ? ` (${newBeats})` : ''}</button>}
                  <button className="btn gold sm" onClick={() => setBlockEdit('new')}><Plus /> Add block</button>
                </div>
                {sBlocks.length === 0 && (
                  <Panel><div className="empty"><ScrollText size={28} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.5 }} />No run sheet yet. Add scenes, read-aloud text and encounters as blocks{newBeats ? ', or pull in the beats already aimed at this session' : ''}.</div></Panel>
                )}
                <RunSheet key={cur.number} all={sBlocks} blocks={shownBlocks} onEdit={setBlockEdit} onMove={move} onRemove={removeBlock} />
              </div>
            )}
          </div>
        ) : (
          <Panel><div className="empty">No sessions yet.</div></Panel>
        )}
      </div>

      {beatsOpen && <BeatsModal session={cur} blocks={sBlocks} beats={beats} onClose={() => setBeatsOpen(false)} />}
      {wrap && <Wrapup session={cur} sessions={sorted} blocks={sBlocks} onClose={() => setWrap(false)} />}
      {mailFor && <SessionEmail session={mailFor} onClose={() => setMailFor(null)} />}
      {edit && <SessionEditor taken={sorted.map((s) => s.number)} row={edit === 'new' ? null : edit} nextNumber={(sorted[sorted.length - 1]?.number ?? -1) + 1} onClose={() => setEdit(null)} onSaved={(r) => setParams({ n: String(r.number) })} />}
      {blockEdit && (
        <BlockEditor
          block={blockEdit === 'new' ? null : blockEdit}
          sessionNumber={cur.number}
          scenes={sceneNames}
          nextPos={(sBlocks[sBlocks.length - 1]?.position ?? 0) + 1}
          onClose={() => setBlockEdit(null)}
        />
      )}
    </div>
  )
}

function SessionEditor({ row, nextNumber, taken = [], onClose, onSaved }) {
  const toast = useToast()
  const [v, setV] = useState(() => (row ? { ...row } : { number: nextNumber, title: '', status: 'Planned' }))
  async function save() {
    if (v.number == null || v.number === '' || !v.title) return toast('Number and title are required', 'error')
    const payload = {}
    SESSION_FIELDS.forEach((f) => (payload[f.key] = v[f.key] ?? null))
    payload.number = Number(payload.number)
    const moved = row && payload.number !== row.number
    if ((!row || moved) && taken.includes(payload.number)) return toast(`Session ${payload.number} already exists`, 'error')
    try {
      const saved = row ? await updateRow('sessions', row.id, payload) : await insertRow('sessions', payload)
      if (moved) {
        // Blocks, the table log and combat rows hang off the session number, so they move with it.
        await rpc('renumber_session', { from: row.number, to: payload.number })
        for (const t of ['session_blocks', 'session_events', 'initiative']) loadTable(t, true)
      }
      onSaved(saved)
      onClose()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  return (
    <Modal title={row ? `Edit session ${row.number}` : 'New session'} onClose={onClose} width={820} footer={<><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <RecordForm fields={SESSION_FIELDS} values={v} setValues={setV} />
    </Modal>
  )
}
