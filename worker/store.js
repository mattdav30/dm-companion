/* Campaign records: every kind of campaign content is a JSON row in `records`. */
import { fail, now } from './lib.js'

export const KINDS = new Set([
  'characters', 'npcs', 'relationships', 'relationship_history', 'locations', 'items', 'threads', 'choices', 'consequences',
  'quick_notes', 'inbox', 'secrets', 'party_inventory', 'music', 'initiative', 'random_tables', 'random_table_entries',
  'spotlights', 'session_templates', 'maps', 'sessions', 'session_blocks', 'session_events', 'campaign_overview', 'meta',
  'lore_entries', 'society_nodes', 'society_edges', 'reputations', 'reputation_events', 'world_map_annotations',
  'player_shared_content', 'player_notes', 'party_tracker', 'player_entries', 'player_bookmarks',
])

/* Fields that must be unique inside a campaign. Text values compare without case. */
const UNIQUE = {
  lore_entries: 'slug', society_nodes: 'slug', meta: 'key', reputations: 'subject_key', sessions: 'number',
  npcs: 'name', characters: 'name', locations: 'name', items: 'name', threads: 'title', maps: 'name',
}
const LABEL = { slug: 'slug', key: 'key', subject_key: 'key', number: 'number', name: 'name', title: 'title' }

/* Default sort for each kind, matching the old app. */
const ORDER = {
  sessions: ['number', true], session_blocks: ['position', true], campaign_overview: ['position', true],
  lore_entries: ['sort_order', true], quick_notes: ['created_at', false], inbox: ['created_at', false],
  initiative: ['position', true], player_shared_content: ['updated_at', false], reputation_events: ['created_at', false],
  meta: ['key', true],
}

const RESERVED = new Set(['id', 'campaign_id', 'created_at', 'updated_at'])

export function out(r) {
  let data = {}
  try { data = JSON.parse(r.data || '{}') } catch { data = {} }
  return { ...data, id: r.id, campaign_id: r.campaign_id, created_at: r.created_at, updated_at: r.updated_at }
}

function cmp(a, b) {
  if (a === b) return 0
  if (a === null || a === undefined || a === '') return 1
  if (b === null || b === undefined || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const na = Number(a), nb = Number(b)
  if (typeof a !== 'boolean' && Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== '' && String(b).trim() !== '') return na - nb
  return String(a).localeCompare(String(b))
}

export function sortRows(kind, rows) {
  const [col, asc] = ORDER[kind] || ['id', true]
  return rows.sort((x, y) => {
    const c = cmp(x[col], y[col])
    return (asc ? c : -c) || x.id - y.id
  })
}

export async function list(env, cid, kind) {
  const { results } = await env.DB.prepare('SELECT * FROM records WHERE campaign_id = ? AND kind = ?').bind(cid, kind).all()
  return sortRows(kind, results.map(out))
}

export async function get(env, cid, kind, id) {
  const r = await env.DB.prepare('SELECT * FROM records WHERE campaign_id = ? AND kind = ? AND id = ?').bind(cid, kind, id).first()
  return r ? out(r) : null
}

/* Find one row by a field other than id (slug, key, subject_key). */
export async function findBy(env, cid, kind, field, value) {
  if (field === 'id') return get(env, cid, kind, Number(value))
  if (!/^[a-z_]+$/.test(field)) fail(400, 'Unknown field')
  const r = await env.DB.prepare(`SELECT * FROM records WHERE campaign_id = ? AND kind = ? AND json_extract(data, '$.${field}') = ? LIMIT 1`)
    .bind(cid, kind, value).first()
  return r ? out(r) : null
}

/* The identifying field (name, title, slug, number) is required, and a record stays a sensible size. */
function checkShape(kind, values, isNew) {
  const field = UNIQUE[kind]
  if (field && (isNew || field in values)) {
    const v = values[field]
    if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) fail(400, `A ${LABEL[field] || field} is required`)
  }
  if (JSON.stringify(values).length > 400000) fail(413, 'That entry is too long to save')
}

async function checkUnique(env, cid, kind, values, exceptId) {
  const field = UNIQUE[kind]
  if (!field || !(field in values)) return
  const v = values[field]
  if (v === null || v === undefined || v === '') return
  const text = typeof v === 'string'
  const sql = text
    ? `SELECT id FROM records WHERE campaign_id = ? AND kind = ? AND lower(json_extract(data, '$.${field}')) = lower(?) AND id <> ? LIMIT 1`
    : `SELECT id FROM records WHERE campaign_id = ? AND kind = ? AND json_extract(data, '$.${field}') = ? AND id <> ? LIMIT 1`
  const hit = await env.DB.prepare(sql).bind(cid, kind, text ? v.trim() : v, exceptId || 0).first()
  if (hit) fail(409, `Something with that ${LABEL[field] || field} already exists in this campaign`)
}

function split(values) {
  const data = {}
  for (const [k, v] of Object.entries(values || {})) if (!RESERVED.has(k)) data[k] = v
  return data
}

export async function insert(env, cid, kind, values, authorId) {
  const data = split(values)
  checkShape(kind, data, true)
  await checkUnique(env, cid, kind, data, 0)
  const t = now()
  const created = typeof values?.created_at === 'string' && values.created_at ? values.created_at : t
  const r = await env.DB.prepare('INSERT INTO records (campaign_id, kind, author_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(cid, kind, authorId || null, JSON.stringify(data), created, t).first()
  await touch(env, cid)
  return out(r)
}

export async function update(env, cid, kind, row, values) {
  const data = split(values)
  checkShape(kind, data, false)
  await checkUnique(env, cid, kind, data, row.id)
  const merged = { ...split(row), ...data }
  const created = typeof values?.created_at === 'string' && values.created_at ? values.created_at : row.created_at
  const r = await env.DB.prepare('UPDATE records SET data = ?, created_at = ?, updated_at = ? WHERE id = ? AND campaign_id = ? RETURNING *')
    .bind(JSON.stringify(merged), created, now(), row.id, cid).first()
  await touch(env, cid)
  return out(r)
}

export async function remove(env, cid, kind, id) {
  await env.DB.prepare('DELETE FROM records WHERE id = ? AND campaign_id = ? AND kind = ?').bind(id, cid, kind).run()
  await touch(env, cid)
}

/* Keep the campaign's updated time fresh so the campaign list sorts by recent use. */
async function touch(env, cid) {
  await env.DB.prepare('UPDATE campaigns SET updated_at = ? WHERE id = ?').bind(now(), cid).run()
}
