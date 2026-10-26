import { useEffect, useState, useCallback } from 'react'
import { api } from './api.js'

/* Tiny shared cache so every page sees the same rows and updates together. */
const cache = new Map() // table -> { rows, loading, error, promise, at }
const seq = new Map() // table -> latest request or local edit number; older responses are dropped
const bump = (t) => { const n = (seq.get(t) || 0) + 1; seq.set(t, n); return n }
const listeners = new Map() // table -> Set(fn)

function emit(key) {
  const set = listeners.get(key)
  if (set) set.forEach((fn) => fn())
}

let campaignId = null
export function setCampaignId(id) {
  campaignId = id
  cache.clear()
}
export function getCampaignId() {
  return campaignId
}

const base = () => `/c/${campaignId}`
const enc = (v) => encodeURIComponent(String(v))

async function fetchTable(table) {
  return (await api.get(`${base()}/t/${table}`)) || []
}

export function loadTable(table, force = false) {
  const entry = cache.get(table)
  if (entry && !force && (entry.rows || entry.promise)) return entry.promise || Promise.resolve(entry.rows)
  const next = { ...(entry || {}), loading: true, error: null }
  const mine = bump(table)
  next.promise = fetchTable(table)
    .then((rows) => {
      if (seq.get(table) !== mine) return cache.get(table)?.rows || rows // a newer load or edit happened meanwhile
      cache.set(table, { rows, loading: false, error: null, at: Date.now() })
      emit(table)
      return rows
    })
    .catch((error) => {
      if (seq.get(table) !== mine) return cache.get(table)?.rows || []
      cache.set(table, { rows: entry?.rows || [], loading: false, error })
      emit(table)
      return []
    })
  cache.set(table, next)
  emit(table)
  return next.promise
}

/* Pull fresh rows when the tab comes back into view, so a second device or tab stays current. */
function refreshVisible(maxAge) {
  const now = Date.now()
  for (const [table, set] of listeners) {
    const entry = cache.get(table)
    if (set.size && entry?.rows && !entry.promise && now - (entry.at || 0) > maxAge) loadTable(table, true)
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshVisible(20000) })
  setInterval(() => { if (document.visibilityState === 'visible') refreshVisible(90000) }, 30000)
}

export function useTable(table) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!table) return
    const fn = () => force((n) => n + 1)
    if (!listeners.has(table)) listeners.set(table, new Set())
    listeners.get(table).add(fn)
    loadTable(table)
    return () => listeners.get(table)?.delete(fn)
  }, [table])
  const entry = (table && cache.get(table)) || { rows: null, loading: !!table }
  const reload = useCallback(() => (table ? loadTable(table, true) : Promise.resolve([])), [table])
  return { rows: entry.rows || [], loading: !entry.rows && entry.loading !== false, error: entry.error, reload }
}

function patchCache(table, fn) {
  const entry = cache.get(table)
  if (!entry?.rows) return
  bump(table)
  cache.set(table, { ...entry, rows: fn(entry.rows), promise: undefined, loading: false })
  emit(table)
}

export async function insertRow(table, values) {
  const data = await api.post(`${base()}/t/${table}`, values)
  patchCache(table, (rows) => [...rows, data])
  loadTable(table, true)
  return data
}

export async function updateRow(table, id, values, key = 'id') {
  // Show the change straight away, then settle on what the server saved.
  patchCache(table, (rows) => rows.map((r) => (r[key] === id ? { ...r, ...values } : r)))
  try {
    const data = await api.patch(`${base()}/t/${table}/${enc(id)}${key === 'id' ? '' : `?key=${enc(key)}`}`, values)
    patchCache(table, (rows) => rows.map((r) => (r[key] === id ? data : r)))
    return data
  } catch (e) {
    loadTable(table, true)
    throw e
  }
}

export async function deleteRow(table, id, key = 'id') {
  await api.del(`${base()}/t/${table}/${enc(id)}${key === 'id' ? '' : `?key=${enc(key)}`}`)
  patchCache(table, (rows) => rows.filter((r) => r[key] !== id))
}

export async function rpc(name, args) {
  return api.post(`${base()}/rpc/${name}`, args || {})
}

/* Named-action snapshots (player side) cached the same way. */
export function useRpc(name, args, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const run = useCallback(async (silent) => {
    if (silent !== true) setState((s) => ({ ...s, loading: true }))
    try {
      const data = await rpc(name, args)
      setState({ data, loading: false, error: null })
    } catch (error) {
      setState({ data: null, loading: false, error })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, JSON.stringify(args)])
  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps])
  return { ...state, reload: run, refresh: useCallback(() => run(true), [run]) }
}

export function errorText(e) {
  if (!e) return ''
  return e.message || String(e)
}

/* Where a campaign file lives. */
export function fileUrl(name, cid = campaignId) {
  return `/api/c/${cid}/files/${name}`
}
