/* Campaigns, membership and invites. */
import { body, bools, clean, fail, json, now, toInt } from './lib.js'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function newCode() {
  const r = crypto.getRandomValues(new Uint8Array(8))
  let s = ''
  for (const b of r) s += CODE_CHARS[b % CODE_CHARS.length]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

/* The signed in user's membership in a campaign, or a 403/404. */
export async function membership(env, cid, user) {
  const row = await env.DB.prepare(
    `SELECT c.id AS campaign_id, c.name, c.subtitle, c.owner_id, c.created_at, c.updated_at,
            m.id AS member_id, m.role, m.character_id, m.display_name, m.active
       FROM campaigns c LEFT JOIN campaign_members m ON m.campaign_id = c.id AND m.user_id = ?
      WHERE c.id = ?`,
  ).bind(user.id, cid).first()
  if (!row) fail(404, 'That campaign does not exist')
  if (!row.member_id || !row.active) fail(403, 'You are not a member of this campaign')
  return row
}

export function requireDm(m) {
  if (m.role !== 'dm') fail(403, 'Only the Dungeon Master can do that')
}

const campaignOut = (r) => ({
  id: r.campaign_id || r.id, name: r.name, subtitle: r.subtitle, owner_id: r.owner_id, created_at: r.created_at, updated_at: r.updated_at,
})

export async function handleCampaigns(request, env, path, user) {
  const method = request.method

  if (path === '/api/campaigns' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.name, c.subtitle, c.owner_id, c.created_at, c.updated_at, m.role, m.character_id, m.display_name,
              u.name AS owner_name,
              (SELECT COUNT(*) FROM campaign_members x WHERE x.campaign_id = c.id AND x.role = 'player' AND x.active = 1) AS players
         FROM campaign_members m JOIN campaigns c ON c.id = m.campaign_id JOIN users u ON u.id = c.owner_id
        WHERE m.user_id = ? AND m.active = 1
        ORDER BY c.updated_at DESC`,
    ).bind(user.id).all()
    return json({ campaigns: results })
  }

  if (path === '/api/campaigns' && method === 'POST') {
    const b = await body(request)
    const name = clean(b.name, 120)
    if (!name) fail(400, 'Give the campaign a name')
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM campaigns WHERE owner_id = ?').bind(user.id).first()
    if (count.n >= 50) fail(400, 'You have reached the limit of 50 campaigns')
    const id = crypto.randomUUID()
    await env.DB.batch([
      env.DB.prepare('INSERT INTO campaigns (id, owner_id, name, subtitle) VALUES (?, ?, ?, ?)').bind(id, user.id, name, clean(b.subtitle, 200) || null),
      env.DB.prepare("INSERT INTO campaign_members (campaign_id, user_id, role, display_name) VALUES (?, ?, 'dm', ?)").bind(id, user.id, user.name),
    ])
    return json({ campaign: { id, name, subtitle: clean(b.subtitle, 200) || null, role: 'dm' } })
  }

  if (path === '/api/join' && method === 'POST') {
    const b = await body(request)
    const code = clean(b.code, 40).toUpperCase().replace(/\s+/g, '')
    if (!code) fail(400, 'Enter the invite code from your DM')
    const inv = await env.DB.prepare('SELECT * FROM player_invites WHERE upper(code) = ? AND active = 1 AND claimed_by IS NULL').bind(code).first()
    if (!inv) fail(404, 'That invite code is not valid or has already been used')
    const existing = await env.DB.prepare('SELECT role, active FROM campaign_members WHERE campaign_id = ? AND user_id = ?').bind(inv.campaign_id, user.id).first()
    if (existing?.role === 'dm') fail(400, 'You are the DM of this campaign already')
    let charName = null
    if (inv.character_id) {
      const c = await env.DB.prepare("SELECT json_extract(data, '$.name') AS name FROM records WHERE id = ? AND campaign_id = ? AND kind = 'characters'").bind(inv.character_id, inv.campaign_id).first()
      charName = c?.name || null
    }
    const display = inv.label || (charName ? charName.split(',')[0] : null) || user.name
    const t = now()
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO campaign_members (campaign_id, user_id, role, character_id, display_name, active)
         VALUES (?, ?, 'player', ?, ?, 1)
         ON CONFLICT(campaign_id, user_id) DO UPDATE SET role = 'player', character_id = excluded.character_id, display_name = excluded.display_name, active = 1`,
      ).bind(inv.campaign_id, user.id, inv.character_id, display),
      env.DB.prepare(
        `INSERT INTO player_profiles (campaign_id, user_id, character_id, display_name) VALUES (?, ?, ?, ?)
         ON CONFLICT(campaign_id, user_id) DO UPDATE SET character_id = excluded.character_id, display_name = COALESCE(player_profiles.display_name, excluded.display_name), updated_at = ?`,
      ).bind(inv.campaign_id, user.id, inv.character_id, display, t),
      env.DB.prepare('UPDATE player_invites SET claimed_by = ?, claimed_at = ?, active = 0 WHERE id = ?').bind(user.id, t, inv.id),
    ])
    const camp = await env.DB.prepare('SELECT id, name FROM campaigns WHERE id = ?').bind(inv.campaign_id).first()
    return json({ campaign: camp, character_name: charName })
  }

  const m = path.match(/^\/api\/campaigns\/([0-9a-f-]{36})(\/leave)?$/)
  if (!m) return null
  const cid = m[1]
  const mem = await membership(env, cid, user)

  if (m[2] && method === 'POST') {
    if (mem.role === 'dm') fail(400, 'The DM cannot leave their own campaign. Delete it instead.')
    await env.DB.prepare('UPDATE campaign_members SET active = 0 WHERE campaign_id = ? AND user_id = ?').bind(cid, user.id).run()
    return json({ ok: true })
  }

  if (method === 'GET') {
    const profile = await env.DB.prepare('SELECT * FROM player_profiles WHERE campaign_id = ? AND user_id = ?').bind(cid, user.id).first()
    return json({
      campaign: campaignOut(mem),
      member: { id: mem.member_id, campaign_id: cid, user_id: user.id, role: mem.role, character_id: mem.character_id, display_name: mem.display_name, active: true },
      profile: profile || null,
    })
  }

  if (method === 'PATCH') {
    requireDm(mem)
    const b = await body(request)
    const name = 'name' in b ? clean(b.name, 120) : mem.name
    if (!name) fail(400, 'Give the campaign a name')
    const subtitle = 'subtitle' in b ? clean(b.subtitle, 200) || null : mem.subtitle
    await env.DB.prepare('UPDATE campaigns SET name = ?, subtitle = ?, updated_at = ? WHERE id = ?').bind(name, subtitle, now(), cid).run()
    return json({ campaign: { ...campaignOut(mem), name, subtitle } })
  }

  if (method === 'DELETE') {
    requireDm(mem)
    const b = await body(request)
    if (clean(b.confirm, 120) !== mem.name) fail(400, 'Type the campaign name exactly to confirm')
    // Delete children explicitly so it works whether or not foreign keys cascade.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM file_chunks WHERE file_id IN (SELECT id FROM files WHERE campaign_id = ?)').bind(cid),
      env.DB.prepare('DELETE FROM files WHERE campaign_id = ?').bind(cid),
      env.DB.prepare('DELETE FROM records WHERE campaign_id = ?').bind(cid),
      env.DB.prepare('DELETE FROM player_profiles WHERE campaign_id = ?').bind(cid),
      env.DB.prepare('DELETE FROM player_invites WHERE campaign_id = ?').bind(cid),
      env.DB.prepare('DELETE FROM campaign_members WHERE campaign_id = ?').bind(cid),
      env.DB.prepare('DELETE FROM campaigns WHERE id = ?').bind(cid),
    ])
    return json({ ok: true })
  }

  return null
}

/* ---- Membership tables exposed through the generic table API (DM only) ---- */

export const MEMBER_TABLES = new Set(['campaign_members', 'player_invites', 'player_profiles'])

export async function memberTable(request, env, cid, table, id, user) {
  const method = request.method
  if (table === 'campaign_members') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM campaign_members WHERE campaign_id = ? ORDER BY joined_at').bind(cid).all()
      return json(results.map((r) => bools(r, ['active'])))
    }
    if (method === 'PATCH' && id) {
      const row = await env.DB.prepare('SELECT * FROM campaign_members WHERE id = ? AND campaign_id = ?').bind(id, cid).first()
      if (!row) fail(404, 'Member not found')
      const b = await body(request)
      const next = {
        character_id: 'character_id' in b ? toInt(b.character_id) : row.character_id,
        display_name: 'display_name' in b ? clean(b.display_name, 80) || null : row.display_name,
        active: row.role === 'dm' ? 1 : 'active' in b ? (b.active ? 1 : 0) : row.active,
      }
      await env.DB.prepare('UPDATE campaign_members SET character_id = ?, display_name = ?, active = ? WHERE id = ?').bind(next.character_id, next.display_name, next.active, id).run()
      if ('character_id' in b) await env.DB.prepare('UPDATE player_profiles SET character_id = ? WHERE campaign_id = ? AND user_id = ?').bind(next.character_id, cid, row.user_id).run()
      return json(bools({ ...row, ...next }, ['active']))
    }
    if (method === 'DELETE' && id) {
      const row = await env.DB.prepare('SELECT * FROM campaign_members WHERE id = ? AND campaign_id = ?').bind(id, cid).first()
      if (!row) fail(404, 'Member not found')
      if (row.role === 'dm') fail(400, 'The DM cannot be removed')
      await env.DB.prepare('DELETE FROM campaign_members WHERE id = ?').bind(id).run()
      return json({ ok: true })
    }
  }

  if (table === 'player_invites') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM player_invites WHERE campaign_id = ? ORDER BY created_at DESC').bind(cid).all()
      return json(results.map((r) => bools(r, ['active'])))
    }
    if (method === 'POST') {
      const b = await body(request)
      let code = clean(b.code, 40).toUpperCase()
      for (let i = 0; i < 5; i++) {
        if (!code || await env.DB.prepare('SELECT 1 FROM player_invites WHERE code = ?').bind(code).first()) code = newCode()
        else break
      }
      const row = await env.DB.prepare('INSERT INTO player_invites (campaign_id, code, character_id, label, active) VALUES (?, ?, ?, ?, 1) RETURNING *')
        .bind(cid, code, toInt(b.character_id), clean(b.label, 80) || null).first()
      return json(bools(row, ['active']))
    }
    if (method === 'PATCH' && id) {
      const b = await body(request)
      const row = await env.DB.prepare('SELECT * FROM player_invites WHERE id = ? AND campaign_id = ?').bind(id, cid).first()
      if (!row) fail(404, 'Invite not found')
      const next = {
        active: 'active' in b ? (b.active ? 1 : 0) : row.active,
        label: 'label' in b ? clean(b.label, 80) || null : row.label,
        character_id: 'character_id' in b ? toInt(b.character_id) : row.character_id,
      }
      await env.DB.prepare('UPDATE player_invites SET active = ?, label = ?, character_id = ? WHERE id = ?').bind(next.active, next.label, next.character_id, id).run()
      return json(bools({ ...row, ...next }, ['active']))
    }
    if (method === 'DELETE' && id) {
      await env.DB.prepare('DELETE FROM player_invites WHERE id = ? AND campaign_id = ?').bind(id, cid).run()
      return json({ ok: true })
    }
  }

  if (table === 'player_profiles' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM player_profiles WHERE campaign_id = ? ORDER BY updated_at DESC').bind(cid).all()
    return json(results)
  }

  fail(405, 'That action is not available')
}
