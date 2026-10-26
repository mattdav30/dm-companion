/* Campaign images (portraits, maps, avatars, hero art) stored in D1 in chunks.
   PUT  /api/c/:cid/files/<path>   raw image body
   GET  /api/c/:cid/files/<path>
   DELETE /api/c/:cid/files/<path> */
import { fail, json } from './lib.js'

const CHUNK = 900 * 1024
const MAX = 12 * 1024 * 1024
const TYPES = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])

function checkPath(p) {
  if (!p || p.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(p) || p.includes('..') || p.includes('//')) fail(400, 'That file name is not allowed')
  return p
}

export async function handleFiles(request, env, cid, rawPath, user, mem) {
  const path = checkPath(decodeURIComponent(rawPath))
  const method = request.method
  const isDm = mem.role === 'dm'

  if (method === 'GET' || method === 'HEAD') {
    const f = await env.DB.prepare('SELECT * FROM files WHERE campaign_id = ? AND path = ?').bind(cid, path).first()
    if (!f) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
    const etag = `"${f.id}-${f.size}-${Date.parse(f.updated_at) || 0}"`
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } })
    const headers = {
      'content-type': f.content_type, 'content-length': String(f.size), etag,
      'cache-control': new URL(request.url).searchParams.has('v') ? 'private, max-age=31536000, immutable' : 'private, no-cache',
      'x-content-type-options': 'nosniff',
    }
    if (method === 'HEAD') return new Response(null, { headers })
    const { results } = await env.DB.prepare('SELECT data FROM file_chunks WHERE file_id = ? ORDER BY idx').bind(f.id).all()
    const out = new Uint8Array(f.size)
    let at = 0
    for (const r of results) {
      const part = new Uint8Array(r.data)
      out.set(part, at)
      at += part.length
    }
    return new Response(out, { headers })
  }

  // Players may only write their own avatar folder.
  if (!isDm && !path.startsWith(`avatars/${user.id}/`)) fail(403, 'You can only upload your own picture')

  if (method === 'PUT') {
    const type = (request.headers.get('content-type') || '').split(';')[0].trim()
    if (!TYPES.has(type)) fail(400, 'Upload a WebP, PNG, JPEG or GIF image')
    const buf = new Uint8Array(await request.arrayBuffer())
    if (!buf.length) fail(400, 'The file is empty')
    if (buf.length > MAX) fail(413, 'That image is too large. Keep it under 12 MB.')
    const chunks = Math.ceil(buf.length / CHUNK)
    const old = await env.DB.prepare('SELECT id FROM files WHERE campaign_id = ? AND path = ?').bind(cid, path).first()
    if (old) await env.DB.batch([
      env.DB.prepare('DELETE FROM file_chunks WHERE file_id = ?').bind(old.id),
      env.DB.prepare('DELETE FROM files WHERE id = ?').bind(old.id),
    ])
    const f = await env.DB.prepare('INSERT INTO files (campaign_id, path, content_type, size, chunks, uploaded_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, updated_at')
      .bind(cid, path, type, buf.length, chunks, user.id).first()
    for (let i = 0; i < chunks; i++) {
      await env.DB.prepare('INSERT INTO file_chunks (file_id, idx, data) VALUES (?, ?, ?)').bind(f.id, i, buf.slice(i * CHUNK, (i + 1) * CHUNK).buffer).run()
    }
    const v = Date.parse(f.updated_at) || Date.now()
    return json({ path, url: `/api/c/${cid}/files/${path}?v=${v}`, size: buf.length })
  }

  if (method === 'DELETE') {
    const f = await env.DB.prepare('SELECT id FROM files WHERE campaign_id = ? AND path = ?').bind(cid, path).first()
    if (f) await env.DB.batch([
      env.DB.prepare('DELETE FROM file_chunks WHERE file_id = ?').bind(f.id),
      env.DB.prepare('DELETE FROM files WHERE id = ?').bind(f.id),
    ])
    return json({ ok: true })
  }

  fail(405, 'That action is not available')
}
