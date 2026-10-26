/* Small shared helpers for the API. */

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const fail = (status, message) => { throw new HttpError(status, message) }

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
}

export const now = () => new Date().toISOString()

export async function body(request) {
  const text = await request.text()
  if (!text) return {}
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? v : {}
  } catch {
    fail(400, 'The request could not be read')
  }
}

export const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max)

export function b64(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
export function unb64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

export function randomToken(n = 32) {
  return b64(crypto.getRandomValues(new Uint8Array(n))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c])
}

export async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

/* Turn D1 integer flags into booleans for the client. */
export function bools(row, keys) {
  if (!row) return row
  const out = { ...row }
  for (const k of keys) if (k in out && out[k] !== null) out[k] = !!out[k]
  return out
}

export const toInt = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}
