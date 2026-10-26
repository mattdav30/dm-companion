/* Accounts and sign in. Passwords are PBKDF2 hashed; sessions are random tokens in an HttpOnly cookie. */
import { body, clean, fail, json, now, b64, unb64, randomToken, sha256, safeEqual } from './lib.js'

const COOKIE = 'dmc_session'
const SESSION_DAYS = 60
const PBKDF2_ITER = 100000
const MIN_PW = 8

async function hashPassword(password, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256)
  return { hash: b64(new Uint8Array(bits)), salt: b64(salt) }
}

function getCookie(request, name) {
  const c = request.headers.get('cookie') || ''
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

function cookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

const publicUser = (u) => u && { id: u.id, email: u.email, name: u.name }

export async function getUser(request, env) {
  const token = getCookie(request, COOKIE)
  if (!token) return null
  const row = await env.DB.prepare(
    'SELECT u.id, u.email, u.name FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
  ).bind(await sha256(token), Date.now()).first()
  return row || null
}

export async function requireUser(request, env) {
  const user = await getUser(request, env)
  if (!user) fail(401, 'Please sign in again')
  return user
}

async function startSession(request, env, userId) {
  const token = randomToken()
  await env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').bind(Date.now()).run()
  await env.DB.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, Date.now() + SESSION_DAYS * 86400000).run()
  return cookie(request, token, SESSION_DAYS * 86400)
}

/* Slow down password guessing: 10 tries per email per 15 minutes. */
async function throttle(env, key) {
  const t = Date.now()
  const row = await env.DB.prepare('SELECT count, reset_at FROM login_attempts WHERE key = ?').bind(key).first()
  if (row && row.reset_at > t && row.count >= 10) fail(429, 'Too many attempts. Wait 15 minutes and try again.')
  if (!row || row.reset_at <= t) {
    await env.DB.prepare('INSERT INTO login_attempts (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at')
      .bind(key, t + 15 * 60000).run()
  } else {
    await env.DB.prepare('UPDATE login_attempts SET count = count + 1 WHERE key = ?').bind(key).run()
  }
}

const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export async function handleAuth(request, env, path) {
  const method = request.method

  if (path === '/api/auth/me' && method === 'GET') {
    return json({ user: publicUser(await getUser(request, env)) })
  }

  if (path === '/api/auth/signup' && method === 'POST') {
    const b = await body(request)
    const email = clean(b.email, 254).toLowerCase()
    const name = clean(b.name, 80)
    const password = String(b.password || '')
    if (!validEmail(email)) fail(400, 'Enter a valid email address')
    if (!name) fail(400, 'Enter your name')
    if (password.length < MIN_PW) fail(400, `Choose a password of at least ${MIN_PW} characters`)
    await throttle(env, 'signup:' + (request.headers.get('cf-connecting-ip') || 'local'))
    const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
    if (exists) fail(409, 'An account with that email already exists. Sign in instead.')
    const id = crypto.randomUUID()
    const h = await hashPassword(password)
    await env.DB.prepare('INSERT INTO users (id, email, name, pw_hash, pw_salt) VALUES (?, ?, ?, ?, ?)').bind(id, email, name, h.hash, h.salt).run()
    const setCookie = await startSession(request, env, id)
    return json({ user: { id, email, name } }, 200, { 'set-cookie': setCookie })
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const b = await body(request)
    const email = clean(b.email, 254).toLowerCase()
    const password = String(b.password || '')
    await throttle(env, 'login:' + email)
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
    let ok = false
    if (user) ok = safeEqual((await hashPassword(password, user.pw_salt)).hash, user.pw_hash)
    else await hashPassword(password) // keep timing similar
    if (!ok) fail(401, 'That email and password do not match')
    await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind('login:' + email).run()
    const setCookie = await startSession(request, env, user.id)
    return json({ user: publicUser(user) }, 200, { 'set-cookie': setCookie })
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    const token = getCookie(request, COOKIE)
    if (token) await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await sha256(token)).run()
    return json({ ok: true }, 200, { 'set-cookie': cookie(request, '', 0) })
  }

  if (path === '/api/auth/me' && method === 'PATCH') {
    const me = await requireUser(request, env)
    const b = await body(request)
    const name = clean(b.name, 80)
    if (!name) fail(400, 'Enter your name')
    await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, me.id).run()
    return json({ user: { ...me, name } })
  }

  if (path === '/api/auth/password' && method === 'POST') {
    const me = await requireUser(request, env)
    const b = await body(request)
    const next = String(b.next || '')
    if (next.length < MIN_PW) fail(400, `Choose a password of at least ${MIN_PW} characters`)
    const row = await env.DB.prepare('SELECT pw_hash, pw_salt FROM users WHERE id = ?').bind(me.id).first()
    if (!safeEqual((await hashPassword(String(b.current || ''), row.pw_salt)).hash, row.pw_hash)) fail(401, 'Your current password is incorrect')
    const h = await hashPassword(next)
    await env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(h.hash, h.salt, me.id).run()
    // Sign out every other device.
    const token = getCookie(request, COOKIE)
    await env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash <> ?').bind(me.id, await sha256(token || '')).run()
    return json({ ok: true, at: now() })
  }

  return null
}
