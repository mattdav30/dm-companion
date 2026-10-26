/* Named actions: /api/c/:cid/rpc/:name. These carry the rules that a plain table write cannot,
   such as what a player is allowed to see, or a DM change that touches several records. */
import { body, clean, fail, json, toInt } from './lib.js'
import { list, findBy, insert, update } from './store.js'
import { requireDm } from './campaigns.js'

const NOTE_SCOPES = ['private', 'party']

async function profiles(env, cid) {
  const { results } = await env.DB.prepare(
    `SELECT p.user_id, p.display_name, p.character_id, p.avatar_url, p.accent_color
       FROM player_profiles p JOIN campaign_members m ON m.campaign_id = p.campaign_id AND m.user_id = p.user_id
      WHERE p.campaign_id = ? AND m.active = 1 AND m.role = 'player'
      ORDER BY p.display_name`,
  ).bind(cid).all()
  return results
}

/* What one player (or the DM previewing a character) is allowed to see. */
async function playerData(env, cid, { userId, characterId, includeHidden = false, preview = false }) {
  const [shares, notes, tracker, entries, bookmarks, profs] = await Promise.all([
    list(env, cid, 'player_shared_content'),
    list(env, cid, 'player_notes'),
    list(env, cid, 'party_tracker'),
    list(env, cid, 'player_entries'),
    list(env, cid, 'player_bookmarks'),
    profiles(env, cid),
  ])
  const byNewest = (a, b) => (a.updated_at < b.updated_at ? 1 : -1)
  const canSee = (s) =>
    (includeHidden || s.published !== false) &&
    (s.audience !== 'character' || (characterId != null && Number(s.audience_character_id) === Number(characterId)))
  const mine = (r) => !preview && userId && r.author_id === userId
  return {
    shares: shares.filter(canSee).map((s) => ({ ...s, preview_hidden: s.published === false })).sort(byNewest),
    notes: notes.filter((n) => mine(n) || n.scope === 'party').sort(byNewest),
    tracker: tracker.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || byNewest(a, b)),
    entries: entries.filter((e) => mine(e) || e.scope === 'party').sort(byNewest),
    bookmarks: preview ? [] : bookmarks.filter((b) => b.user_id === userId),
    profiles: profs,
  }
}

/* The lore book and society map, cut down to what the party has learned. */
async function loreData(env, cid, includeHidden = false) {
  const [nodes, edges, reps, lore] = await Promise.all([
    list(env, cid, 'society_nodes'), list(env, cid, 'society_edges'), list(env, cid, 'reputations'), list(env, cid, 'lore_entries'),
  ])
  const level = (s) => Number(s.current_level) || 0
  const known = new Set(nodes.filter((s) => level(s) > 0).map((s) => s.slug))
  const societies = nodes.map((s) => ({
    slug: s.slug, name: !includeHidden && level(s) === 0 ? 'Unknown Society' : s.name, node_type: s.node_type || 'society',
    parent_slug: s.parent_slug || null, x: s.x ?? 50, y: s.y ?? 50, glyph: s.glyph || null,
    current_level: includeHidden ? 4 : level(s), actual_level: level(s), preview_hidden: includeHidden && level(s) < 4,
    knowledge: [1, 2, 3, 4].map((n) => (includeHidden || level(s) >= n ? s['level' + n] || null : null)),
  })).sort((a, b) => String(a.node_type).localeCompare(String(b.node_type)) || String(a.name).localeCompare(String(b.name)))
  return {
    societies,
    edges: edges.filter((e) => includeHidden || (e.visible !== false && known.has(e.from_slug) && known.has(e.to_slug))),
    reputations: reps
      .filter((r) => includeHidden || r.subject_key === 'overall' || known.has(r.subject_key))
      .map((r) => ({ subject_type: r.subject_type, subject_key: r.subject_key, display_name: r.display_name, score: Number(r.score) || 0 }))
      .sort((a, b) => (a.subject_type === 'overall' ? -1 : b.subject_type === 'overall' ? 1 : String(a.display_name).localeCompare(String(b.display_name)))),
    lore: lore
      .filter((l) => includeHidden || l.revealed !== false)
      .map((l) => ({ id: l.id, slug: l.slug, category: l.category, title: l.title, subtitle: l.subtitle, teaser: l.teaser, body: l.body, sort_order: l.sort_order, source_label: l.source_label, preview_hidden: l.revealed === false }))
      .sort((a, b) => String(a.category).localeCompare(String(b.category)) || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.title).localeCompare(String(b.title))),
  }
}

const PLAYER_ACTIONS = new Set(['player_data_snapshot', 'player_lore_snapshot', 'player_save_note_v2', 'player_save_entry', 'player_save_profile_v2'])

export async function handleRpc(request, env, cid, name, user, mem) {
  const a = await body(request)
  const isDm = mem.role === 'dm'
  if (!isDm && !PLAYER_ACTIONS.has(name)) fail(403, 'Only the Dungeon Master can do that')

  switch (name) {
    /* ---------- Player side ---------- */
    case 'player_data_snapshot': {
      const profile = await env.DB.prepare('SELECT * FROM player_profiles WHERE campaign_id = ? AND user_id = ?').bind(cid, user.id).first()
      const data = await playerData(env, cid, { userId: user.id, characterId: mem.character_id })
      return json({
        ...data,
        profile: profile || { user_id: user.id, display_name: mem.display_name || user.name, character_id: mem.character_id },
        member: { user_id: user.id, role: mem.role, character_id: mem.character_id, display_name: mem.display_name },
      })
    }
    case 'player_lore_snapshot':
      return json(await loreData(env, cid, false))

    case 'player_save_note_v2': {
      const p = a.payload || {}
      const scope = NOTE_SCOPES.includes(p.scope) ? p.scope : 'private'
      const values = {
        scope, category: clean(p.category, 40) || 'Note', session_number: toInt(p.session_number),
        title: clean(p.title, 200) || null, body: String(p.body ?? '').slice(0, 20000),
        linked_type: p.linked_type || null, linked_id: p.linked_id || null, pinned: !!p.pinned,
      }
      if (p.id) {
        const row = await findBy(env, cid, 'player_notes', 'id', Number(p.id))
        if (!row || row.author_id !== user.id) fail(404, 'Note not found')
        return json(await update(env, cid, 'player_notes', row, values))
      }
      return json(await insert(env, cid, 'player_notes', { ...values, author_id: user.id }, user.id))
    }

    case 'player_save_entry': {
      const type = a.new_entry_type
      if (!['npc', 'location'].includes(type)) fail(400, 'Choose a person or a place')
      const scope = NOTE_SCOPES.includes(a.new_scope) ? a.new_scope : 'private'
      const nm = clean(a.new_name, 200)
      if (!nm) fail(400, 'A name is required')
      const values = { entry_type: type, scope, name: nm, subtitle: clean(a.new_subtitle, 200) || null, body: String(a.new_body ?? '').slice(0, 20000) || null, metadata: a.new_metadata || {} }
      if (a.entry_id) {
        const row = await findBy(env, cid, 'player_entries', 'id', Number(a.entry_id))
        if (!row || row.author_id !== user.id) fail(404, 'Entry not found')
        return json(await update(env, cid, 'player_entries', row, values))
      }
      return json(await insert(env, cid, 'player_entries', { ...values, author_id: user.id }, user.id))
    }

    case 'player_save_profile_v2': {
      const p = a.payload || {}
      const fs = Math.max(0.85, Math.min(1.35, Number(p.font_scale) || 1))
      const avatar = clean(p.avatar_url, 500)
      if (avatar && !avatar.startsWith(`/api/c/${cid}/files/avatars/${user.id}/`)) fail(400, 'Upload the picture again')
      const display = clean(p.display_name, 80) || mem.display_name || user.name
      await env.DB.prepare(
        `INSERT INTO player_profiles (campaign_id, user_id, character_id, display_name, accent_color, background_preset, background_url, font_scale, avatar_url, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(campaign_id, user_id) DO UPDATE SET display_name = excluded.display_name, accent_color = excluded.accent_color,
           background_preset = excluded.background_preset, background_url = excluded.background_url, font_scale = excluded.font_scale,
           avatar_url = excluded.avatar_url, updated_at = excluded.updated_at`,
      ).bind(cid, user.id, mem.character_id, display, /^#[0-9a-f]{6}$/i.test(p.accent_color || '') ? p.accent_color : '#e0a84f',
        clean(p.background_preset, 40) || 'default', clean(p.background_url, 500) || null, fs, avatar || null).run()
      if (mem.role === 'player') await env.DB.prepare('UPDATE campaign_members SET display_name = ? WHERE campaign_id = ? AND user_id = ?').bind(display, cid, user.id).run()
      return json(await env.DB.prepare('SELECT * FROM player_profiles WHERE campaign_id = ? AND user_id = ?').bind(cid, user.id).first())
    }

    /* ---------- DM side ---------- */
    case 'dm_player_preview_data': {
      requireDm(mem)
      const charId = toInt(a.target_character_id)
      let profile = null
      if (charId != null) profile = await env.DB.prepare('SELECT * FROM player_profiles WHERE campaign_id = ? AND character_id = ? LIMIT 1').bind(cid, charId).first()
      const data = await playerData(env, cid, { characterId: charId, includeHidden: !!a.include_hidden, preview: true })
      return json({ ...data, profile })
    }
    case 'dm_player_preview_lore':
      return json(await loreData(env, cid, !!a.include_hidden))

    case 'dm_player_emails': {
      const { results } = await env.DB.prepare(
        `SELECT COALESCE(m.display_name, u.name) AS display_name, u.email, m.character_id
           FROM campaign_members m JOIN users u ON u.id = m.user_id
          WHERE m.campaign_id = ? AND m.role = 'player' AND m.active = 1 ORDER BY display_name`,
      ).bind(cid).all()
      return json(results)
    }

    case 'publish_player_content': {
      const type = clean(a.p_content_type, 40)
      const title = clean(a.p_title, 300)
      if (!type || !title) fail(400, 'Type and title are required')
      const audience = a.p_audience === 'character' ? 'character' : 'party'
      const charId = audience === 'character' ? toInt(a.p_audience_character_id) : null
      if (audience === 'character' && charId == null) fail(400, 'Choose a character')
      const sourceId = toInt(a.p_source_id)
      const values = {
        content_type: type, source_id: sourceId, title, subtitle: clean(a.p_subtitle, 300) || null,
        body: String(a.p_body ?? '').slice(0, 50000) || null, metadata: a.p_metadata && typeof a.p_metadata === 'object' ? a.p_metadata : {},
        audience, audience_character_id: charId, published: true, published_at: new Date().toISOString(),
      }
      // Sharing the same record again refreshes it. Free-standing handouts are always new.
      let existing = null
      if (sourceId != null) {
        const all = await list(env, cid, 'player_shared_content')
        existing = all.find((s) => s.content_type === type && s.source_id === sourceId && s.audience === audience && (s.audience_character_id ?? null) === charId)
      }
      return json(existing ? await update(env, cid, 'player_shared_content', existing, values) : await insert(env, cid, 'player_shared_content', values, user.id))
    }

    case 'set_lore_revealed': {
      const row = await findBy(env, cid, 'lore_entries', 'slug', clean(a.p_slug, 200))
      if (!row) fail(404, 'Lore entry not found')
      await update(env, cid, 'lore_entries', row, { revealed: !!a.p_revealed })
      return json(null)
    }

    case 'set_society_level': {
      const row = await findBy(env, cid, 'society_nodes', 'slug', clean(a.p_slug, 200))
      if (!row) fail(404, 'Society not found')
      await update(env, cid, 'society_nodes', row, { current_level: Math.max(0, Math.min(4, toInt(a.p_level) ?? 0)) })
      return json(null)
    }

    case 'adjust_reputation': {
      const key = clean(a.p_subject_key, 200)
      const row = await findBy(env, cid, 'reputations', 'subject_key', key)
      if (!row) fail(404, 'Reputation subject not found')
      const delta = toInt(a.p_delta) || 0
      const score = Math.max(-100, Math.min(100, (Number(row.score) || 0) + delta))
      await update(env, cid, 'reputations', row, { score })
      await insert(env, cid, 'reputation_events', { subject_key: key, delta, reason: clean(a.p_reason, 300) || 'Manual adjustment', session_number: toInt(a.p_session) }, user.id)
      return json(score)
    }

    case 'renumber_session': {
      const from = toInt(a.from), to = toInt(a.to)
      if (from == null || to == null) fail(400, 'Session numbers are required')
      for (const kind of ['session_blocks', 'session_events', 'initiative']) {
        await env.DB.prepare(
          `UPDATE records SET data = json_set(data, '$.session_number', ?), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE campaign_id = ? AND kind = ? AND json_extract(data, '$.session_number') = ?`,
        ).bind(to, cid, kind, from).run()
      }
      return json({ ok: true })
    }

    case 'dm_activity': {
      // Player activity for the DM's bell: shared notes, tracker changes, party entries and new joins.
      const since = new Date(Date.now() - 30 * 86400000).toISOString()
      const [notes, tracker, entries] = await Promise.all([list(env, cid, 'player_notes'), list(env, cid, 'party_tracker'), list(env, cid, 'player_entries')])
      const { results: invites } = await env.DB.prepare('SELECT id, code, label, claimed_by, claimed_at FROM player_invites WHERE campaign_id = ? AND claimed_at IS NOT NULL').bind(cid).all()
      const { results: members } = await env.DB.prepare('SELECT user_id, display_name FROM campaign_members WHERE campaign_id = ?').bind(cid).all()
      return json({
        notes: notes.filter((n) => n.scope === 'party' && n.updated_at >= since),
        tracker: tracker.filter((t) => t.updated_at >= since),
        entries: entries.filter((e) => e.scope === 'party' && e.updated_at >= since),
        invites, members,
      })
    }

    default:
      fail(404, 'Unknown action')
  }
}
