import { useState } from 'react'
import { Save, Trash2, Map as MapIcon, Download, TriangleAlert } from 'lucide-react'
import { api } from '../lib/api.js'
import { useTable, insertRow, updateRow, errorText } from '../lib/data.js'
import { useCampaign } from '../lib/campaign.jsx'
import { Panel, Modal, useToast } from '../ui/kit.jsx'
import { useNavigate } from '../lib/router.jsx'
import { BackupButton } from '../ui/TopTools.jsx'

export default function CampaignSettings() {
  const { campaign, refresh } = useCampaign()
  const toast = useToast()
  const nav = useNavigate()
  const [v, setV] = useState({ name: campaign.name, subtitle: campaign.subtitle || '' })
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState(false)
  const { rows: meta } = useTable('meta')
  const kmRow = meta.find((m) => m.key === 'map_width_km')
  const [km, setKm] = useState('')

  async function save(e) {
    e?.preventDefault()
    if (!v.name.trim()) return toast('Give the campaign a name', 'error')
    setBusy(true)
    try {
      await api.patch(`/campaigns/${campaign.id}`, v)
      await refresh()
      toast('Campaign saved')
    } catch (err) { toast(errorText(err), 'error') } finally { setBusy(false) }
  }

  async function saveKm() {
    const n = Number(km)
    if (!n || n < 1) return toast('Enter the width of the world map in kilometres', 'error')
    try {
      if (kmRow) await updateRow('meta', kmRow.id, { value: String(n) })
      else await insertRow('meta', { key: 'map_width_km', value: String(n) })
      setKm('')
      toast('Map scale saved')
    } catch (err) { toast(errorText(err), 'error') }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div><div className="eyebrow">Behind the screen</div><h1 className="h-page">Campaign settings</h1></div>
      </div>

      <Panel title="Details">
        <form onSubmit={save} className="form-grid">
          <div className="field full"><label htmlFor="cs-name">Campaign name</label><input id="cs-name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
          <div className="field full"><label htmlFor="cs-sub">Tagline</label><input id="cs-sub" className="input" placeholder="Shown under the name on the dashboards" value={v.subtitle} onChange={(e) => setV({ ...v, subtitle: e.target.value })} /></div>
        </form>
        <button className="btn primary" style={{ marginTop: 16 }} onClick={save} disabled={busy}><Save /> {busy ? 'Saving…' : 'Save details'}</button>
      </Panel>

      <Panel title="World map" style={{ marginTop: 18 }}>
        <p className="muted" style={{ marginTop: 0 }}>Upload the main map from the World Map page, then set its real width so the scale bar is accurate.</p>
        <div className="row wrap" style={{ gap: 10 }}>
          <button className="btn" onClick={() => nav('/map')}><MapIcon /> Open the world map</button>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" style={{ width: 170 }} type="number" min="1" placeholder={kmRow ? `${kmRow.value} km wide` : 'Width in km'} value={km} onChange={(e) => setKm(e.target.value)} />
            <button className="btn" onClick={saveKm} disabled={!km}>Save scale</button>
          </div>
        </div>
      </Panel>

      <Panel title="Backup" style={{ marginTop: 18 }}>
        <p className="muted" style={{ marginTop: 0 }}>Download everything in this campaign as one file. Keep a copy before big changes.</p>
        <div className="row"><Download size={16} className="faint" /><BackupButton /></div>
      </Panel>

      <Panel title="Danger zone" className="danger-zone" style={{ marginTop: 18 }}>
        <p className="muted" style={{ marginTop: 0 }}>Deleting the campaign removes every session, record, map, picture and player link for good. Players lose access straight away.</p>
        <button className="btn danger" onClick={() => setDel(true)}><Trash2 /> Delete this campaign</button>
      </Panel>

      {del && <DeleteCampaign campaign={campaign} onClose={() => setDel(false)} />}
    </div>
  )
}

function DeleteCampaign({ campaign, onClose }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    try {
      await api.del(`/campaigns/${campaign.id}`, { confirm: text })
      location.href = '/'
    } catch (e) { toast(errorText(e), 'error'); setBusy(false) }
  }
  return (
    <Modal title="Delete campaign" onClose={onClose} footer={<><button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button><button className="btn danger" onClick={go} disabled={busy || text !== campaign.name}><Trash2 /> {busy ? 'Deleting…' : 'Delete for good'}</button></>}>
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <TriangleAlert className="danger-ic" />
        <p style={{ margin: 0 }}>This cannot be undone. Type <b>{campaign.name}</b> to confirm.</p>
      </div>
      <input className="input" style={{ marginTop: 14 }} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
    </Modal>
  )
}
