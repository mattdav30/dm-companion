import { useEffect, useMemo, useState } from 'react'
import { Mail, Copy, Check } from 'lucide-react'
import { rpc, errorText } from '../lib/data.js'
import { Modal, useToast } from '../ui/kit.jsx'

import { getCampaignId } from '../lib/data.js'

function draft(s, when, time) {
  const lines = [
    'Hi all,',
    '',
    'Our next session is coming up.',
    '',
    `Session ${s.number}: ${s.title}`,
    `When: ${[when || 'Date to be confirmed', time].filter(Boolean).join(', ')}`,
  ]
  if (s.location) lines.push(`The story picks up at: ${s.location}`)
  lines.push('', `Catch up on the party's notes, the codex and the Lore Book before we play: ${window.location.origin}/c/${getCampaignId()}`, '', 'See you there,', 'Your Dungeon Master')
  return lines.join('\n')
}

export default function SessionEmail({ session, onClose }) {
  const toast = useToast()
  const [people, setPeople] = useState(null)
  const [picked, setPicked] = useState({})
  const [when, setWhen] = useState(session.planned_date || '')
  const [time, setTime] = useState('')
  const [subject, setSubject] = useState(`Next session: Session ${session.number}, ${session.title}`)
  const [body, setBody] = useState(() => draft(session, session.planned_date, ''))
  const [edited, setEdited] = useState(false)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    rpc('dm_player_emails').then((rows) => {
      const list = (rows || []).filter((r) => r.email)
      setPeople(list)
      setPicked(Object.fromEntries(list.map((r) => [r.email, true])))
    }).catch((e) => { setPeople([]); toast(errorText(e), 'error') })
  }, [toast])
  useEffect(() => { if (!edited) setBody(draft(session, when, time)) }, [when, time, session, edited])

  const to = useMemo(() => (people || []).filter((p) => picked[p.email]).map((p) => p.email), [people, picked])
  const mailto = `mailto:?bcc=${encodeURIComponent(to.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1800) } catch { toast('Copy failed. Select the text and copy it by hand.', 'error') }
  }

  return (
    <Modal title="Email the players" onClose={onClose} width={720}
      footer={
        <>
          <button className="btn ghost" onClick={() => copy(to.join(', '), 'emails')}>{copied === 'emails' ? <Check /> : <Copy />} Copy addresses</button>
          <button className="btn ghost" onClick={() => copy(`${subject}\n\n${body}`, 'message')}>{copied === 'message' ? <Check /> : <Copy />} Copy message</button>
          <a className={`btn primary ${to.length ? '' : 'disabled'}`} style={{ marginLeft: 'auto' }} href={to.length ? mailto : undefined} onClick={(e) => { if (!to.length) e.preventDefault() }}><Mail /> Open in email app</a>
        </>
      }>
      <div className="email-form">
        <div className="field full">
          <label>Send to {people ? `(${to.length} of ${people.length})` : ''}</label>
          {people === null && <div className="muted">Loading player addresses…</div>}
          {people && people.length === 0 && <div className="muted">No players have joined yet. Invite them from the Players page.</div>}
          <div className="email-people">
            {(people || []).map((p) => (
              <label key={p.email} className={`email-person ${picked[p.email] ? 'on' : ''}`}>
                <input type="checkbox" checked={!!picked[p.email]} onChange={(e) => setPicked({ ...picked, [p.email]: e.target.checked })} />
                <span><b>{p.display_name || p.email}</b><small>{[p.character_name, p.email].filter(Boolean).join(' · ')}</small></span>
              </label>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <div className="field"><label>Date</label><input className="input" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Saturday 4 October" /></div>
          <div className="field"><label>Time</label><input className="input" value={time} onChange={(e) => setTime(e.target.value)} placeholder="6:30pm" /></div>
          <div className="field full"><label>Subject</label><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="field full"><label>Message</label><textarea className="input" rows={11} value={body} onChange={(e) => { setBody(e.target.value); setEdited(true) }} /></div>
        </div>
        <div className="faint" style={{ fontSize: 14, marginTop: 10 }}>Opens your own email app with the players in BCC, so nobody sees each other's address. Check the message, then press send.</div>
      </div>
    </Modal>
  )
}
