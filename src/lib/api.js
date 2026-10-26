/* Thin fetch wrapper for the Worker API. Every write carries the x-dmc header the server checks. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function call(method, path, payload, opts = {}) {
  const headers = { 'x-dmc': '1' }
  let body
  if (opts.raw) {
    body = payload
    headers['content-type'] = opts.type || 'application/octet-stream'
  } else if (payload !== undefined) {
    body = JSON.stringify(payload)
    headers['content-type'] = 'application/json'
  }
  let res
  try {
    res = await fetch('/api' + path, { method, headers, body, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('dmc:signed-out'))
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`)
  }
  return data
}

export const api = {
  get: (p) => call('GET', p),
  post: (p, b) => call('POST', p, b ?? {}),
  patch: (p, b) => call('PATCH', p, b ?? {}),
  del: (p, b) => call('DELETE', p, b),
  put: (p, blob, type) => call('PUT', p, blob, { raw: true, type }),
}
