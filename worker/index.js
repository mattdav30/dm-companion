/* API on Cloudflare Workers + D1. Static app files are served from ./dist. */
import { HttpError, json, fail } from './lib.js'
import { handleAuth, requireUser } from './auth.js'
import { handleCampaigns, membership, requireDm } from './campaigns.js'
import { handleTable, exportCampaign } from './tables.js'
import { handleRpc } from './rpc.js'
import { handleFiles } from './files.js'
import { handleSite, canonicalRedirect } from './site.js'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/* Block cross-site form posts: writes must come from this site with our header. */
function checkOrigin(request, url) {
  if (SAFE.has(request.method)) return
  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin) fail(403, 'Request blocked')
  if (request.headers.get('x-dmc') !== '1') fail(403, 'Request blocked')
}

async function api(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/'
  checkOrigin(request, url)

  if (path.startsWith('/api/auth/')) {
    const res = await handleAuth(request, env, path)
    if (res) return res
    fail(404, 'Not found')
  }

  const user = await requireUser(request, env)

  if (path === '/api/campaigns' || path === '/api/join' || /^\/api\/campaigns\/[^/]+(\/leave)?$/.test(path)) {
    const res = await handleCampaigns(request, env, path, user)
    if (res) return res
    fail(405, 'That action is not available')
  }

  const m = path.match(/^\/api\/c\/([0-9a-f-]{36})\/(t|rpc|files|export)(?:\/(.*))?$/)
  if (!m) fail(404, 'Not found')
  const [, cid, area, rest] = m
  const mem = await membership(env, cid, user)

  if (area === 't') {
    const [table, id] = (rest || '').split('/')
    if (!table) fail(404, 'Not found')
    return handleTable(request, env, cid, table, id, url, user, mem)
  }
  if (area === 'rpc') {
    if (request.method !== 'POST' || !rest) fail(405, 'Use POST')
    return handleRpc(request, env, cid, rest, user, mem)
  }
  if (area === 'files') {
    if (!rest) fail(404, 'Not found')
    return handleFiles(request, env, cid, rest, user, mem)
  }
  if (area === 'export' && request.method === 'GET') {
    requireDm(mem)
    return json(await exportCampaign(env, cid, user))
  }
  fail(404, 'Not found')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const moved = canonicalRedirect(request, env, url)
    if (moved) return moved
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(request, env, url)
      } catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status)
        console.error(e)
        return json({ error: 'Something went wrong on the server. Try again in a moment.' }, 500)
      }
    }
    const site = await handleSite(request, env, url)
    if (site) return site
    return env.ASSETS.fetch(request)
  },
}
