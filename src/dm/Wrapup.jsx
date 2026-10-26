import { useMemo, useState } from 'react'
import { Flag, Minus, Plus, Check } from 'lucide-react'
import { useTable, insertRow, updateRow, rpc, loadTable, errorText } from '../lib/data.js'
import { Modal, useToast, Loading } from '../ui/kit.jsx'
import { ENTITIES } from '../entities.js'
import { groupScenes } from './RunSheet.jsx'

const TITLES = new Set(['grand', 'marshal', 'brother', 'sister', 'sergeant', 'captain', 'elder', 'lord', 'lady', 'king', 'queen', 'father', 'mother', 'the', 'high', 'sir'])

/* Words that point at a record inside free text: the full name, the part before a comma, and a distinctive last name. */
function needles(name) {
  const n = (name || '').toLowerCase().trim()
  if (!n) return []
  const out = [n, n.split(',')[0].trim()]
  const words = n.split(',')[0].split(/\s+/).filter((w) => w.length >= 4 && !TITLES.has(w))
  if (words.length) out.push(words[words.length - 1])
  return [...new Set(out)]
}
const mentioned = (text, name) => needles(name).some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text))

export function buildRecap(blocks, events) {
  const done = blocks.filter((b) => b.completed)
  const lines = []
  for (const g of groupScenes(done)) {
    const titles = g.items.filter((b) => b.title && !/overview|dm note|reference/i.test(b.block_type)).map((b) => b.title)
    if (titles.length) lines.push(`${g.key}: ${titles.join('; ')}.`)
  }
  if (events.length) {
    lines.push('', 'From the table:')
    events.forEach((e) => lines.push(`${e.event_type && e.event_type !== 'Note' ? `${e.event_type}: ` : ''}${[e.subject, e.detail].filter(Boolean).join('. ')}`))
  }
  return lines.join('\n').trim()
}

function Step({ n, title, children, hint }) {
  return (
    <section className="wrap-step">
      <h3><span>{n}</span>{title}</h3>
      {hint && <p className="faint">{hint}</p>}
      {children}
    </section>
  )
}

export default function Wrapup(props) {
  const a = useTable('session_events'), b = useTable('npcs'), c = useTable('locations')
  const d = useTable('lore_entries'), e = useTable('reputations'), f = useTable('player_shared_content')
  const ready = [a, b, c, d, e, f].every((x) => !x.loading)
  if (!ready) return <Modal title={`Finish Session ${props.session.number}`} onClose={props.onClose}><Loading /></Modal>
  return <WrapupForm {...props} />
}

function WrapupForm({ session, sessions, blocks, onClose, onDone }) {
  const toast = useToast()
  const { rows: events } = useTable('session_events')
  const { rows: npcs } = useTable('npcs')
  const { rows: locs } = useTable('locations')
  const { rows: lore } = useTable('lore_entries')
  const { rows: reps } = useTable('reputations')
  const { rows: shared } = useTable('player_shared_content')
  const n = session.number
  const sEvents = useMemo(() => events.filter((e) => e.session_number === n).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))), [events, n])
  const played = useMemo(() => [...blocks.filter((b) => b.completed).map((b) => `${b.title || ''} ${b.content || ''}`), ...sEvents.map((e) => `${e.subject || ''} ${e.detail || ''}`)].join('\n'), [blocks, sEvents])
  const unfinished = blocks.filter((b) => !b.completed)
  const isShared = (type, id) => shared.some((s) => s.content_type === type && s.source_id === id && s.published)

  const metNpcs = useMemo(() => npcs.filter((r) => mentioned(played, r.name)), [npcs, played])
  const metLocs = useMemo(() => locs.filter((r) => mentioned(played, r.name)), [locs, played])
  const loreHits = useMemo(() => lore.filter((l) => l.revealed === false && mentioned(played, l.title)), [lore, played])

  const [recap, setRecap] = useState(() => session.outcome || buildRecap(blocks, sEvents))
  const [share, setShare] = useState(() => Object.fromEntries([...metNpcs.map((r) => [`npc-${r.id}`, !isShared('npc', r.id)]), ...metLocs.map((r) => [`location-${r.id}`, !isShared('location', r.id)])]))
  const [extraNpc, setExtraNpc] = useState([])
  const [reveal, setReveal] = useState(() => Object.fromEntries(loreHits.map((l) => [l.slug, true])))
  const [extraLore, setExtraLore] = useState([])
  const [deltas, setDeltas] = useState({})
  const [repReason, setRepReason] = useState(`Session ${n}`)
  const [carry, setCarry] = useState(unfinished.length ? 'next' : 'leave')
  const [complete, setComplete] = useState(true)
  const [busy, setBusy] = useState(false)

  const npcList = [...metNpcs, ...npcs.filter((r) => extraNpc.includes(`npc-${r.id}`) && !metNpcs.includes(r))]
  const locList = [...metLocs, ...locs.filter((r) => extraNpc.includes(`location-${r.id}`) && !metLocs.includes(r))]
  const loreList = [...loreHits, ...lore.filter((l) => extraLore.includes(l.slug) && !loreHits.includes(l))]
  const next = sessions.find((s) => s.number === n + 1)
  const bump = (k, d) => setDeltas({ ...deltas, [k]: Math.max(-50, Math.min(50, (deltas[k] || 0) + d)) })

  async function publish(entKey, row) {
    const ent = ENTITIES[entKey]
    const s = ent.share
    const metadata = {}
    s.meta.forEach((k) => row[k] && (metadata[k] = row[k]))
    if (row.portrait_url) metadata.portrait_url = row.portrait_url
    await rpc('publish_player_content', {
      p_content_type: s.type, p_source_id: row.id, p_title: ent.titleOf(row), p_subtitle: row[s.subtitle] || '',
      p_body: row[s.body] || '', p_metadata: metadata, p_audience: 'party', p_audience_character_id: null,
    })
  }

  async function finish() {
    setBusy(true)
    const did = []
    try {
      const patch = { outcome: recap }
      if (complete) patch.status = 'Completed'
      await updateRow('sessions', session.id, patch)
      did.push(complete ? 'marked completed' : 'recap saved')

      const toShare = [...npcList.map((r) => ['npcs', r, `npc-${r.id}`]), ...locList.map((r) => ['locations', r, `location-${r.id}`])].filter(([, , k]) => share[k])
      for (const [t, r] of toShare) await publish(t, r)
      if (toShare.length) { did.push(`${toShare.length} shared`); loadTable('player_shared_content', true) }

      const toReveal = loreList.filter((l) => reveal[l.slug])
      for (const l of toReveal) await rpc('set_lore_revealed', { p_slug: l.slug, p_revealed: true })
      if (toReveal.length) { did.push(`${toReveal.length} lore revealed`); loadTable('lore_entries', true) }

      const repChanges = Object.entries(deltas).filter(([, d]) => d)
      for (const [k, d] of repChanges) await rpc('adjust_reputation', { p_subject_key: k, p_delta: d, p_reason: repReason || `Session ${n}`, p_session: n })
      if (repChanges.length) { did.push(`${repChanges.length} reputation change${repChanges.length === 1 ? '' : 's'}`); loadTable('reputations', true); loadTable('reputation_events', true) }

      if (carry === 'next' && unfinished.length) {
        let target = next
        if (!target) target = await insertRow('sessions', { number: n + 1, title: 'To be named', status: 'Planned' })
        const existing = (await loadTable('session_blocks', true)).filter((b) => b.session_number === n + 1)
        let pos = Math.min(0, ...existing.map((b) => b.position ?? 0)) - unfinished.length
        for (const b of unfinished) await updateRow('session_blocks', b.id, { session_number: n + 1, position: pos++, scene_title: `Carried from Session ${n}: ${b.scene_title || 'Unsorted'}` })
        did.push(`${unfinished.length} block${unfinished.length === 1 ? '' : 's'} moved to Session ${n + 1}`)
        loadTable('sessions', true)
      }
      toast(`Session ${n} wrapped up: ${did.join(', ')}`)
      onDone?.()
      onClose()
    } catch (e) {
      toast(`${errorText(e)}${did.length ? ` (done so far: ${did.join(', ')})` : ''}`, 'error')
      setBusy(false)
    }
  }

  const unsharedNpcs = npcs.filter((r) => !npcList.includes(r))
  const unsharedLocs = locs.filter((r) => !locList.includes(r))
  const hiddenLore = lore.filter((l) => l.revealed === false && !loreList.includes(l))

  return (
    <Modal title={`Finish Session ${n}: ${session.title}`} onClose={onClose} width={860}
      footer={<>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} /> Mark the session completed</label>
        <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={finish}><Flag /> {busy ? 'Wrapping up…' : 'Finish session'}</button>
      </>}>
      <div className="wrapup">
        <Step n="1" title="What happened" hint="Built from the blocks you ticked and the table log. Edit freely. Saved as the session outcome.">
          <textarea className="input" rows={8} style={{ height: "auto", minHeight: 170, resize: "vertical" }} value={recap} onChange={(e) => setRecap(e.target.value)} />
          <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setRecap(buildRecap(blocks, sEvents))}>Rebuild from the run sheet</button>
        </Step>

        <Step n="2" title="Who and where the party met" hint="Found by name in what you played. Ticked ones get shared to the players' codex.">
          <div className="wrap-picks">
            {[...npcList.map((r) => ['npc', r, r.name, r.role]), ...locList.map((r) => ['location', r, r.name, r.place_type])].map(([t, r, name, sub]) => {
              const k = `${t}-${r.id}`
              const already = isShared(t, r.id)
              return (
                <label key={k} className={`wrap-pick ${share[k] ? 'on' : ''}`}>
                  <input type="checkbox" checked={!!share[k]} onChange={(e) => setShare({ ...share, [k]: e.target.checked })} />
                  <span><b>{name}</b><small>{t === 'npc' ? 'NPC' : 'Location'}{sub ? ` · ${sub}` : ''}{already ? ' · already shared, ticking updates it' : ''}</small></span>
                </label>
              )
            })}
            {!npcList.length && !locList.length && <div className="faint">Nobody matched by name. Add them below.</div>}
          </div>
          <select className="select" value="" onChange={(e) => { const k = e.target.value; if (k) { setExtraNpc([...extraNpc, k]); setShare({ ...share, [k]: true }) } }}>
            <option value="">Add someone or somewhere else…</option>
            <optgroup label="NPCs">{unsharedNpcs.map((r) => <option key={r.id} value={`npc-${r.id}`}>{r.name}</option>)}</optgroup>
            <optgroup label="Locations">{unsharedLocs.map((r) => <option key={r.id} value={`location-${r.id}`}>{r.name}</option>)}</optgroup>
          </select>
        </Step>

        <Step n="3" title="Lore the party learned" hint="Hidden Lore Book entries mentioned in play. Ticked ones open in the players' book.">
          <div className="wrap-picks">
            {loreList.map((l) => (
              <label key={l.slug} className={`wrap-pick ${reveal[l.slug] ? 'on' : ''}`}>
                <input type="checkbox" checked={!!reveal[l.slug]} onChange={(e) => setReveal({ ...reveal, [l.slug]: e.target.checked })} />
                <span><b>{l.title}</b><small>{l.category}</small></span>
              </label>
            ))}
            {!loreList.length && <div className="faint">No hidden entries matched. Add one below if needed.</div>}
          </div>
          {hiddenLore.length > 0 && (
            <select className="select" value="" onChange={(e) => { const s = e.target.value; if (s) { setExtraLore([...extraLore, s]); setReveal({ ...reveal, [s]: true }) } }}>
              <option value="">Reveal another hidden entry…</option>
              {hiddenLore.map((l) => <option key={l.slug} value={l.slug}>{l.title}</option>)}
            </select>
          )}
        </Step>

        <Step n="4" title="Reputation" hint="Changes land in the reputation log against this session.">
          <input className="input" value={repReason} onChange={(e) => setRepReason(e.target.value)} placeholder="Reason" style={{ marginBottom: 10 }} />
          <div className="wrap-reps">
            {[...reps].sort((a, b) => (a.subject_key === 'overall' ? -1 : b.subject_key === 'overall' ? 1 : String(a.display_name).localeCompare(String(b.display_name)))).map((r) => {
              const d = deltas[r.subject_key] || 0
              return (
                <div key={r.subject_key} className={`wrap-rep ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}>
                  <span className="wrap-rep-name">{r.display_name}<small>{r.score}{d ? ` → ${Math.max(-100, Math.min(100, r.score + d))}` : ''}</small></span>
                  <button className="btn sm icon" onClick={() => bump(r.subject_key, -5)} title="Lower by 5"><Minus /></button>
                  <b className="wrap-rep-d">{d > 0 ? `+${d}` : d}</b>
                  <button className="btn sm icon" onClick={() => bump(r.subject_key, 5)} title="Raise by 5"><Plus /></button>
                </div>
              )
            })}
          </div>
        </Step>

        <Step n="5" title="Unfinished blocks" hint={unfinished.length ? `${unfinished.length} block${unfinished.length === 1 ? '' : 's'} were never ticked.` : 'Everything on the run sheet was ticked.'}>
          {unfinished.length > 0 && (
            <div className="seg">
              <button className={carry === 'next' ? 'on' : ''} onClick={() => setCarry('next')}>{carry === 'next' && <Check size={14} />} Move to Session {n + 1}{next ? '' : ' (creates it)'}</button>
              <button className={carry === 'leave' ? 'on' : ''} onClick={() => setCarry('leave')}>{carry === 'leave' && <Check size={14} />} Leave them here</button>
            </div>
          )}
        </Step>
      </div>
    </Modal>
  )
}
