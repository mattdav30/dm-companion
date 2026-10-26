import { useMemo, useState } from 'react'
import { User, Sparkles, HeartHandshake } from 'lucide-react'
import { useTable, insertRow, loadTable, errorText } from '../lib/data.js'
import { Modal, useToast } from '../ui/kit.jsx'

const SCENE = 'Beats to land'
const closed = (s) => /resolv|closed|complete|dead|done|abandon/i.test(s || '')

/* Next beats aimed at this session, from NPCs, threads and relationships. */
export function useBeats(session, blocks) {
  const { rows: npcs } = useTable('npcs')
  const { rows: threads } = useTable('threads')
  const { rows: rels } = useTable('relationships')
  return useMemo(() => {
    if (!session) return []
    const n = session.number
    const have = new Set(blocks.map((b) => `${b.block_type}|${(b.title || '').toLowerCase()}`))
    const out = []
    npcs.filter((r) => Number(r.target_session) === n && r.next_beat && !closed(r.status)).forEach((r) =>
      out.push({ key: `npc-${r.id}`, icon: User, from: 'NPC', block_type: 'NPC', title: r.name, content: [r.next_beat, r.current_location && `Where: ${r.current_location}`].filter(Boolean).join('\n') }))
    threads.filter((r) => Number(r.target_session) === n && r.next_beat && !closed(r.status)).forEach((r) =>
      out.push({ key: `thr-${r.id}`, icon: Sparkles, from: 'Thread', block_type: 'Story Beat', title: r.title, content: r.next_beat }))
    rels.filter((r) => Number(r.target_session) === n && r.next_beat).forEach((r) =>
      out.push({ key: `rel-${r.id}`, icon: HeartHandshake, from: 'Relationship', block_type: 'Character Arc', title: `${r.person_a} and ${r.person_b}`, content: r.next_beat }))
    return out.map((b) => ({ ...b, added: have.has(`${b.block_type}|${b.title.toLowerCase()}`) }))
  }, [session, blocks, npcs, threads, rels])
}

export default function BeatsModal({ session, blocks, beats, onClose }) {
  const toast = useToast()
  const fresh = beats.filter((b) => !b.added)
  const [pick, setPick] = useState(() => Object.fromEntries(fresh.map((b) => [b.key, true])))
  const [busy, setBusy] = useState(false)
  async function add() {
    const chosen = fresh.filter((b) => pick[b.key])
    if (!chosen.length) return onClose()
    setBusy(true)
    try {
      let pos = (blocks[blocks.length - 1]?.position ?? 0) + 1
      for (const b of chosen) {
        await insertRow('session_blocks', { session_number: session.number, position: pos++, scene_title: SCENE, block_type: b.block_type, title: b.title, content: b.content, dm_only: 1, completed: 0 })
      }
      loadTable('session_blocks', true)
      toast(`Added ${chosen.length} beat${chosen.length === 1 ? '' : 's'} to the run sheet`)
      onClose()
    } catch (e) { toast(errorText(e), 'error'); setBusy(false) }
  }
  return (
    <Modal title={`Beats aimed at Session ${session.number}`} onClose={onClose} width={680}
      footer={<><span className="faint" style={{ fontSize: 14 }}>They land in a scene called “{SCENE}”, marked DM only.</span><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !fresh.some((b) => pick[b.key])} onClick={add}>{busy ? 'Adding…' : 'Add to run sheet'}</button></>}>
      {beats.length === 0 && <div className="empty">No NPC, thread or relationship has a next beat with target session {session.number}. Set “Target session” and “Next beat” on those records and they show up here.</div>}
      <div className="beat-list">
        {beats.map((b) => {
          const Icon = b.icon
          return (
            <label key={b.key} className={`beat-pick ${b.added ? 'added' : ''}`}>
              <input type="checkbox" disabled={b.added} checked={b.added || !!pick[b.key]} onChange={(e) => setPick({ ...pick, [b.key]: e.target.checked })} />
              <Icon className="beat-icon" />
              <span><b>{b.title}</b><small>{b.from}{b.added ? ' · already on the run sheet' : ''}</small><em>{b.content}</em></span>
            </label>
          )
        })}
      </div>
    </Modal>
  )
}
