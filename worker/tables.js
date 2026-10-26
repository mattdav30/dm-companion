/* Generic table API: /api/c/:cid/t/:table[/:id][?key=field]
   The DM can read and write every kind of record in their campaign.
   Players can only touch the few kinds the player companion writes directly. */
import { body, fail, json } from './lib.js'
import { KINDS, list, get, findBy, insert, update, remove } from './store.js'
import { MEMBER_TABLES, memberTable } from './campaigns.js'

/* What players may do through this API. Everything else goes through named actions (rpc.js). */
const PLAYER = {
  world_map_annotations: {
    read: (r, u) => r.visibility === 'party' || r.created_by === u.id,
    insert: (v) => ['party', 'private'].includes(v.visibility || 'private'),
    write: (r, u) => r.created_by === u.id,
  },
  party_tracker: { read: () => true, insert: () => true, write: () => true },
  player_notes: { read: (r, u) => r.author_id === u.id || r.scope === 'party', write: (r, u) => r.author_id === u.id, noInsert: true },
  player_entries: { read: (r, u) => r.author_id === u.id || r.scope === 'party', write: (r, u) => r.author_id === u.id, noInsert: true },
  player_bookmarks: { read: (r, u) => r.user_id === u.id, insert: () => true, write: (r, u) => r.user_id === u.id },
}

/* Even the DM never sees a player's private notes or private map marks. */
const DM_PRIVACY = {
  player_notes: (r, u) => r.scope === 'party' || r.author_id === u.id,
  player_entries: (r, u) => r.scope === 'party' || r.author_id === u.id,
  world_map_annotations: (r, u) => r.visibility !== 'private' || r.created_by === u.id,
  player_bookmarks: (r, u) => r.user_id === u.id,
}

/* Who wrote it is set by the server, never trusted from the browser. */
function stamp(table, values, user, isNew) {
  const v = { ...values }
  if (table === 'world_map_annotations') { if (isNew) v.created_by = user.id; else delete v.created_by }
  if (table === 'party_tracker') { if (isNew) v.created_by = user.id; else delete v.created_by }
  if (table === 'player_notes' || table === 'player_entries') { if (isNew) v.author_id = user.id; else delete v.author_id }
  if (table === 'player_bookmarks') { if (isNew) v.user_id = user.id; else delete v.user_id }
  return v
}

export async function handleTable(request, env, cid, table, idPart, url, user, mem) {
  const method = request.method
  const isDm = mem.role === 'dm'

  if (MEMBER_TABLES.has(table)) {
    if (!isDm) fail(403, 'Only the Dungeon Master can do that')
    return memberTable(request, env, cid, table, idPart ? Number(idPart) : null, user)
  }
  if (!KINDS.has(table)) fail(404, 'Unknown table')

  const rule = PLAYER[table]
  if (!isDm && !rule) fail(403, 'Only the Dungeon Master can see that')
  const visible = (r) => (isDm ? (DM_PRIVACY[table] ? DM_PRIVACY[table](r, user) : true) : rule.read(r, user))

  if (method === 'GET' && !idPart) {
    const rows = await list(env, cid, table)
    return json(rows.filter(visible))
  }

  if (method === 'POST' && !idPart) {
    const values = await body(request)
    if (!isDm && (rule.noInsert || !rule.insert(values, user))) fail(403, 'You cannot add that')
    const row = await insert(env, cid, table, stamp(table, values, user, true), user.id)
    return json(row)
  }

  if (!idPart) fail(405, 'That action is not available')
  const key = url.searchParams.get('key') || 'id'
  const row = await findBy(env, cid, table, key, key === 'id' ? Number(idPart) : decodeURIComponent(idPart))
  if (!row || !visible(row)) fail(404, 'That record no longer exists')
  if (isDm && DM_PRIVACY[table] && method !== 'GET') {
    // The DM can tidy up shared player content but not rewrite it in the player's name.
    const own = (row.author_id || row.created_by || row.user_id) === user.id || !(row.author_id || row.created_by || row.user_id)
    if (method === 'PATCH' && !own && table !== 'world_map_annotations') fail(403, 'Only the author can edit that')
  }
  if (!isDm && method !== 'GET' && !rule.write(row, user)) fail(403, 'Only the author can change that')

  if (method === 'GET') return json(row)
  if (method === 'PATCH') {
    const values = stamp(table, await body(request), user, false)
    if (!isDm && table === 'world_map_annotations' && values.visibility && !['party', 'private'].includes(values.visibility)) fail(403, 'Choose party or private')
    return json(await update(env, cid, table, row, values))
  }
  if (method === 'DELETE') {
    await remove(env, cid, table, row.id)
    return json({ ok: true })
  }
  fail(405, 'That action is not available')
}

/* A full JSON backup of one campaign, for the DM. */
export async function exportCampaign(env, cid, user) {
  const camp = await env.DB.prepare('SELECT id, name, subtitle, created_at, updated_at FROM campaigns WHERE id = ?').bind(cid).first()
  const tables = {}
  const { results } = await env.DB.prepare('SELECT * FROM records WHERE campaign_id = ? ORDER BY kind, id').bind(cid).all()
  for (const r of results) {
    let data = {}
    try { data = JSON.parse(r.data) } catch { /* keep empty */ }
    const row = { ...data, id: r.id, created_at: r.created_at, updated_at: r.updated_at }
    if (DM_PRIVACY[r.kind] && !DM_PRIVACY[r.kind](row, user)) continue
    ;(tables[r.kind] ||= []).push(row)
  }
  for (const t of ['campaign_members', 'player_invites', 'player_profiles']) {
    const { results: rows } = await env.DB.prepare(`SELECT * FROM ${t} WHERE campaign_id = ?`).bind(cid).all()
    tables[t] = rows
  }
  return { app: 'dm-companion', version: 1, exported_at: new Date().toISOString(), campaign: camp, tables }
}

export { get }
