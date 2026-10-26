import { useMemo, useState } from 'react'
import { useSearchParams } from '../lib/router.jsx'
import { BookOpen, Network, Plus } from 'lucide-react'
import { useTable, loadTable, insertRow, updateRow, rpc, errorText } from '../lib/data.js'
import { Modal, RecordForm, useToast, Loading } from '../ui/kit.jsx'
import { ENTITIES } from '../entities.js'
import { useCampaign } from '../lib/campaign.jsx'
import LoreBook from './LoreBook.jsx'
import Society from './Society.jsx'

const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60)

const NODE_FIELDS = (parents) => [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'glyph', label: 'Emblem letters', type: 'text', placeholder: 'One or two letters, or a symbol' },
  { key: 'node_type', label: 'Kind', type: 'select', options: ['people', 'faction', 'faith', 'other'] },
  { key: 'parent_slug', label: 'Belongs to', type: 'select', options: parents },
  { key: 'level1', label: 'Knowledge I (heard of)', type: 'textarea' },
  { key: 'level2', label: 'Knowledge II (known)', type: 'textarea' },
  { key: 'level3', label: 'Knowledge III (understood)', type: 'textarea' },
  { key: 'level4', label: 'Knowledge IV (deep knowledge)', type: 'textarea' },
  { key: 'notes', label: 'DM notes', type: 'textarea', dm: true },
]

/* True when `slug` sits somewhere under `root` through parent_slug. */
function descends(rows, slug, root) {
  if (!root) return false
  const by = Object.fromEntries(rows.map((r) => [r.slug, r]))
  for (let x = by[slug]?.parent_slug, i = 0; x && i < 50; x = by[x]?.parent_slug, i++) if (x === root) return true
  return false
}

export default function DmLore() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'society' ? 'society' : 'lore'
  const toast = useToast()
  const lore = useTable('lore_entries')
  const nodesT = useTable('society_nodes')
  const edgesT = useTable('society_edges')
  const repsT = useTable('reputations')
  const eventsT = useTable('reputation_events')
  const [editLore, setEditLore] = useState(null)
  const [editNode, setEditNode] = useState(null)

  const fail = (e) => toast(errorText(e), 'error')

  async function toggleLore(e) {
    try {
      await rpc('set_lore_revealed', { p_slug: e.slug, p_revealed: e.revealed === false })
      await loadTable('lore_entries', true)
      toast(e.revealed === false ? `${e.title} is now in the players' book` : `${e.title} is hidden from players`)
    } catch (err) { fail(err) }
  }
  function newLore(cat) {
    const max = Math.max(0, ...lore.rows.filter((r) => r.category === cat).map((r) => r.sort_order || 0))
    setEditLore({ values: { category: cat || '', revealed: false, sort_order: max + 10 } })
  }
  async function saveLore() {
    const v = { ...editLore.values }
    if (!v.title?.trim()) return toast('Give the entry a title', 'error')
    if (!v.body?.trim()) v.body = ''
    if (!v.slug?.trim()) v.slug = slugify(v.title)
    try {
      if (editLore.row) await updateRow('lore_entries', editLore.row.id, v)
      else await insertRow('lore_entries', v)
      await loadTable('lore_entries', true)
      setEditLore(null)
      toast('Entry saved')
    } catch (err) { fail(err) }
  }

  const nodes = useMemo(() => nodesT.rows.map((n) => ({ ...n, knowledge: [n.level1, n.level2, n.level3, n.level4] })), [nodesT.rows])
  async function setLevel(n, level) {
    try {
      await rpc('set_society_level', { p_slug: n.slug, p_level: level })
      await loadTable('society_nodes', true)
    } catch (err) { fail(err) }
  }
  async function adjust(key, delta, reason, session) {
    try {
      await rpc('adjust_reputation', { p_subject_key: key, p_delta: delta, p_reason: reason || 'Adjusted by the DM', p_session: session })
      await Promise.all([loadTable('reputations', true), loadTable('reputation_events', true)])
      return true
    } catch (err) { fail(err); return false }
  }
  async function saveNode() {
    const v = { ...editNode.values }
    if (!v.name?.trim()) return toast('Give the society a name', 'error')
    for (const k of ['level1', 'level2', 'level3', 'level4', 'parent_slug', 'glyph', 'notes']) if (v[k] === '') v[k] = null
    try {
      if (editNode.row) {
        const { knowledge, ...clean } = v
        await updateRow('society_nodes', editNode.row.id, clean)
        const rep = repsT.rows.find((r) => r.subject_key === editNode.row.slug)
        if (rep && rep.display_name !== v.name) await updateRow('reputations', rep.id, { display_name: v.name })
      } else {
        const slug = slugify(v.name) || 'society-' + Date.now()
        await insertRow('society_nodes', { ...v, slug, node_type: v.node_type || 'faction', current_level: 0, x: 50, y: 50 })
        await insertRow('reputations', { subject_type: v.node_type === 'people' ? 'people' : 'faction', subject_key: slug, display_name: v.name, score: 0 })
      }
      await Promise.all([loadTable('society_nodes', true), loadTable('reputations', true)])
      setEditNode(null)
      toast('Society saved')
    } catch (err) { fail(err) }
  }

  const { campaign } = useCampaign()
  const loading = tab === 'lore' ? lore.loading : nodesT.loading || repsT.loading
  const revealed = lore.rows.filter((r) => r.revealed).length
  const known = nodesT.rows.filter((n) => n.current_level > 0).length

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{tab === 'lore' ? `The encyclopedia of ${campaign.name}` : 'Peoples, powers and standing'}</div>
          <h1 className="h-page">{tab === 'lore' ? 'Lore Book' : 'Society'}</h1>
        </div>
        <div className="sub">{tab === 'lore' ? `${revealed} of ${lore.rows.length} entries visible to players` : `${known} of ${nodesT.rows.length} societies known to the party`}</div>
        <div className="spacer" />
        <div className="seg">
          <button className={tab === 'lore' ? 'on' : ''} onClick={() => setParams({ tab: 'lore' })}><BookOpen /> Lore Book</button>
          <button className={tab === 'society' ? 'on' : ''} onClick={() => setParams({ tab: 'society' })}><Network /> Society</button>
        </div>
        {tab === 'society' && <button className="btn primary" onClick={() => setEditNode({ values: { node_type: 'faction' } })}><Plus /> New society</button>}
      </div>

      {loading ? <Loading /> : tab === 'lore' ? (
        <LoreBook
          entries={lore.rows}
          dm
          openId={params.get('id')}
          onToggle={toggleLore}
          onEdit={(e) => setEditLore({ row: e, values: { ...e } })}
          onNew={newLore}
        />
      ) : (
        <Society
          nodes={nodes}
          edges={edgesT.rows}
          reps={repsT.rows}
          events={eventsT.rows}
          dm
          onLevel={setLevel}
          onAdjust={adjust}
          onEdit={(n) => setEditNode({ row: n, values: { ...n } })}
        />
      )}

      {editLore && (
        <Modal title={editLore.row ? 'Edit lore entry' : 'New lore entry'} onClose={() => setEditLore(null)} width={820}
          footer={<><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setEditLore(null)}>Cancel</button><button className="btn primary" onClick={saveLore}>Save entry</button></>}>
          <RecordForm fields={ENTITIES.lore_entries.fields.map((f) => (f.key === 'slug' ? { ...f, required: false, placeholder: 'Made from the title if left empty' } : f))} values={editLore.values} setValues={(fn) => setEditLore((s) => ({ ...s, values: typeof fn === 'function' ? fn(s.values) : fn }))} />
        </Modal>
      )}
      {editNode && (
        <Modal title={editNode.row ? 'Edit society' : 'New society'} onClose={() => setEditNode(null)} width={820}
          footer={<><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setEditNode(null)}>Cancel</button><button className="btn primary" onClick={saveNode}>Save society</button></>}>
          <RecordForm fields={NODE_FIELDS(nodesT.rows.filter((n) => n.slug !== editNode.row?.slug && !descends(nodesT.rows, n.slug, editNode.row?.slug)).map((n) => n.slug))} values={editNode.values} setValues={(fn) => setEditNode((s) => ({ ...s, values: typeof fn === 'function' ? fn(s.values) : fn }))} />
          {!editNode.row && <div className="faint" style={{ marginTop: 10, fontSize: 14 }}>New societies start hidden from players with neutral reputation. Set Belongs to so the society sits under its people or faith in the tree.</div>}
        </Modal>
      )}
    </div>
  )
}
