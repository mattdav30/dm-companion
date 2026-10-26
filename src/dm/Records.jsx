import { useMemo, useState } from 'react'
import { useSearchParams } from '../lib/router.jsx'
import { Plus, Pencil, Trash2, Share2, Search, ImagePlus, ChevronDown, ChevronRight } from 'lucide-react'
import { resizeImage, uploadArt, pickFile } from '../lib/upload.js'
import { useTable, insertRow, updateRow, deleteRow, rpc, loadTable, errorText } from '../lib/data.js'
import { Panel, Badge, Modal, RecordForm, useToast, Loading, Toggle, clickable } from '../ui/kit.jsx'
import { Portrait } from '../ui/art.jsx'

function badgesFor(ent, r) {
  return (ent.badges || []).map((b, i) => {
    if (typeof b === 'function') {
      const [text, t] = b(r)
      return <Badge key={i} tone={t}>{text}</Badge>
    }
    return r[b] ? <Badge key={i}>{r[b]}</Badge> : null
  })
}

export function RecordEditor({ ent, row, onClose, onSaved }) {
  const toast = useToast()
  const [values, setValues] = useState(() => {
    const v = {}
    ent.fields.forEach((f) => (v[f.key] = row ? row[f.key] : f.type === 'bool' ? false : null))
    return v
  })
  const [busy, setBusy] = useState(false)
  async function save() {
    const missing = ent.fields.find((f) => f.required && !values[f.key])
    if (missing) return toast(`${missing.label} is required`, 'error')
    setBusy(true)
    try {
      const saved = row ? await updateRow(ent.table, row.id, values) : await insertRow(ent.table, values)
      toast(row ? 'Saved' : `${ent.singular[0].toUpperCase() + ent.singular.slice(1)} created`)
      onSaved?.(saved)
      onClose()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={row ? `Edit ${ent.singular}` : `New ${ent.singular}`}
      onClose={onClose}
      width={820}
      footer={
        <>
          <span className="faint" style={{ fontSize: 14 }}>Fields marked DM only stay hidden from players.</span>
          <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <RecordForm fields={ent.fields} values={values} setValues={setValues} />
    </Modal>
  )
}

export function Detail({ ent, row, onEdit, onDelete, extra }) {
  const toast = useToast()
  async function share() {
    const s = ent.share
    const metadata = {}
    s.meta.forEach((k) => row[k] && (metadata[k] = row[k]))
    if (row.portrait_url) metadata.portrait_url = row.portrait_url
    try {
      await rpc('publish_player_content', {
        p_content_type: s.type, p_source_id: row.id, p_title: ent.titleOf(row), p_subtitle: row[s.subtitle] || '',
        p_body: row[s.body] || '', p_metadata: metadata, p_audience: 'party', p_audience_character_id: null,
      })
      loadTable('player_shared_content', true)
      toast(`Shared with the party: ${ent.titleOf(row)}`)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  async function uploadPortrait() {
    const file = await pickFile()
    if (!file) return
    try {
      toast('Uploading portrait…')
      const blob = await resizeImage(file, 512, true)
      const url = await uploadArt(`portraits/${ent.table}-${row.id}-${Date.now()}.webp`, blob)
      await updateRow(ent.table, row.id, { portrait_url: url })
      toast('Portrait saved')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  const shown = ent.fields.filter((f) => f.type !== 'bool' && row[f.key] != null && row[f.key] !== '' && f.key !== 'name' && f.key !== 'title')
  return (
    <Panel framed className="rec-detail" bodyClass={null}>
      <div className="detail-head">
        {ent.portrait && (
          <button className="portrait-btn" onClick={uploadPortrait} title="Upload a portrait">
            <Portrait name={ent.titleOf(row)} size="lg" url={row.portrait_url} />
            <span><ImagePlus size={14} /> Portrait</span>
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{ent.subtitleOf(row) || ent.singular}</div>
          <h2>{ent.titleOf(row)}</h2>
          <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>{badgesFor(ent, row)}</div>
        </div>
        <div className="detail-actions">
          {extra}
          {ent.share && <button className="btn gold sm" onClick={share} title="Publish to the players' codex"><Share2 /> Share</button>}
          <button className="btn sm" onClick={onEdit}><Pencil /> Edit</button>
          <button className="btn sm danger icon" onClick={onDelete} title="Delete"><Trash2 /></button>
        </div>
      </div>
      <dl className="detail-body">
        {shown.length === 0 && <div className="full empty">Nothing written yet. Use Edit to fill in the record.</div>}
        {shown.map((f) => (
          <div key={f.key} className={`fact ${f.dm ? 'dm' : ''} ${f.type === 'textarea' ? 'full' : ''}`}>
            <dt>{f.label}{f.dm && <Badge dm />}</dt>
            <dd>{String(row[f.key])}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

/* Keyed by table so filters, search and open editors never leak from one list to another. */
export default function Records(props) {
  return <RecordsList key={props.ent.table} {...props} />
}

function RecordsList({ ent, headerExtra }) {
  const { rows, loading, error } = useTable(ent.table)
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [flt, setFlt] = useState('')
  const [editing, setEditing] = useState(null) // row | 'new'
  const toast = useToast()
  const selectedId = params.get('id')

  const chipKey = ent.chips || null
  const chips = useMemo(() => {
    if (!chipKey) return []
    const count = {}
    rows.forEach((r) => { const k = r[chipKey]; if (k) count[k] = (count[k] || 0) + 1 })
    const order = ent.chipOrder || []
    return Object.entries(count).sort((a, b) => {
      const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0])
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b[1] - a[1] || a[0].localeCompare(b[0])
    })
  }, [rows, chipKey, ent.chipOrder])

  const filters = useMemo(() => {
    if (!ent.filter || chipKey) return []
    return [...new Set(rows.map((r) => r[ent.filter]).filter(Boolean))].sort()
  }, [rows, ent.filter, chipKey])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const key = chipKey || ent.filter
    return rows.filter((r) => {
      if (flt && r[key] !== flt) return false
      if (!s) return true
      return Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(s))
    }).sort((a, b) => (ent.sortOf ? ent.sortOf(a, b) : 0))
  }, [rows, q, flt, ent, chipKey])

  const groups = useMemo(() => {
    if (!ent.groupOf) return null
    const m = new Map()
    list.forEach((r) => { const g = ent.groupOf(r, flt) || 'Other'; if (!m.has(g)) m.set(g, []); m.get(g).push(r) })
    return [...m.entries()].sort((a, b) => (a[0] === 'Other') - (b[0] === 'Other') || b[1].length - a[1].length || a[0].localeCompare(b[0]))
  }, [list, ent, flt])
  const [closed, setClosed] = useState({})

  const selected = rows.find((r) => String(r.id) === selectedId) || (selectedId ? null : list[0])
  const select = (id) => {
    const p = new URLSearchParams(params)
    if (id != null) p.set('id', String(id))
    else p.delete('id')
    setParams(p, { replace: true })
  }

  async function remove(row) {
    if (!confirm(`Delete “${ent.titleOf(row)}”? This cannot be undone.`)) return
    try {
      await deleteRow(ent.table, row.id)
      toast('Deleted')
      select(null)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{ent.eyebrow}</div>
          <h1 className="h-page">{ent.title}</h1>
        </div>
        <span className="sub">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>
        <div className="spacer" />
        {headerExtra}
        <button className="btn primary" onClick={() => setEditing('new')}><Plus /> New {ent.singular}</button>
      </div>
      {error && <Panel><div className="muted">Could not load: {errorText(error)}</div></Panel>}
      <div className="records">
        <Panel className="rec-list" bodyClass={null}>
          <div className="rec-tools">
            <div className="search" style={{ flex: 1, maxWidth: 'none' }}>
              <Search />
              <input className="input" placeholder={`Search ${ent.title.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 38 }} />
            </div>
            {filters.length > 1 && (
              <select className="select" value={flt} onChange={(e) => setFlt(e.target.value)}>
                <option value="">All</option>
                {filters.map((f) => <option key={f}>{f}</option>)}
              </select>
            )}
            {chips.length > 1 && (
              <div className="chip-row">
                <button className={`chip ${!flt ? 'on' : ''}`} onClick={() => setFlt('')}>All <i>{rows.length}</i></button>
                {chips.map(([c, n]) => <button key={c} className={`chip ${flt === c ? 'on' : ''}`} onClick={() => setFlt(flt === c ? '' : c)}>{c} <i>{n}</i></button>)}
              </div>
            )}
          </div>
          {loading && <Loading />}
          {!loading && list.length === 0 && <div className="empty">{rows.length ? 'Nothing matches.' : 'No entries yet.'}</div>}
          {(groups || [[null, list]]).map(([g, items]) => {
            const shut = g && closed[g] && !(q.trim() && items.length)
            return (
              <div key={g || 'all'} className="rec-group">
                {g && (
                  <button className="rec-group-head" onClick={() => setClosed((c) => ({ ...c, [g]: !c[g] }))}>
                    {shut ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    <span>{g}</span><i>{items.length}</i>
                  </button>
                )}
                {!shut && items.map((r) => (
                  <div key={r.id} className={`rec-item compact ${selected?.id === r.id ? 'on' : ''}`} {...clickable(() => select(r.id))}>
                    {ent.portrait && <Portrait name={ent.titleOf(r)} size="sm" url={r.portrait_url} />}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h4>{ent.titleOf(r)}</h4>
                      {(ent.lineOf || ent.subtitleOf)(r) && <p className="rec-line">{(ent.lineOf || ent.subtitleOf)(r)}</p>}
                    </div>
                    {ent.dotOf && ent.dotOf(r) && <span className={`rec-dot ${ent.dotOf(r).tone}`} title={ent.dotOf(r).label} />}
                  </div>
                ))}
              </div>
            )
          })}
        </Panel>
        <div>
          {selected ? (
            <Detail
              ent={ent}
              row={selected}
              onEdit={() => setEditing(selected)}
              onDelete={() => remove(selected)}
              extra={ent.table === 'lore_entries' && (
                <span className="row" style={{ gap: 8, fontSize: 15 }}>
                  <span className="muted">Players see it</span>
                  <Toggle on={selected.revealed} onChange={async (v) => { try { await updateRow('lore_entries', selected.id, { revealed: v }); toast(v ? 'Revealed to players' : 'Hidden from players') } catch (e) { toast(errorText(e), 'error') } }} />
                </span>
              )}
            />
          ) : (
            !loading && <Panel><div className="empty">Select an entry, or create a new one.</div></Panel>
          )}
        </div>
      </div>
      {editing && (
        <RecordEditor
          ent={ent}
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(r) => r && select(r.id)}
        />
      )}
      <datalist id="loc-areas">
        {[...new Set(rows.map((r) => r.area).filter(Boolean))].sort().map((a) => <option key={a} value={a} />)}
      </datalist>
      <datalist id="thread-cats">
        {['Main Plot', 'Faction', 'Character Arc', 'NPC Arc', 'Romance', 'Investigation', 'Logistics', 'Campaign Structure'].map((c) => <option key={c} value={c} />)}
      </datalist>
    </div>
  )
}

export function Tabbed({ tabs, title, eyebrow }) {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || tabs[0].key
  const cur = tabs.find((t) => t.key === tab) || tabs[0]
  return (
    <div>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={t.key === cur.key ? 'on' : ''} onClick={() => setParams({ tab: t.key })}>{t.label}</button>
        ))}
      </div>
      <div key={cur.key}>{cur.render()}</div>
    </div>
  )
}
