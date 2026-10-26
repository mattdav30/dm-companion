import { BRAND } from '../brand.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from '../lib/router.jsx'
import { Search, Menu, LogOut, Eye, Skull } from 'lucide-react'
import { Emblem } from './art.jsx'

export function Sidebar({ items, open, onClose, footer, title = BRAND.name, subtitle = '' }) {
  return (
    <>
      {open && <div className="scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <Emblem />
          <div className="brand-name">
            <strong title={title}>{title}</strong>
            {subtitle && <em>{subtitle}</em>}
          </div>
        </div>
        <nav className="nav">
          {items.map((it, i) =>
            it.label && !it.to ? (
              <div key={i} className="nav-divider">{it.label === '-' ? '' : it.label}</div>
            ) : (
              <NavLink key={it.to} to={it.to} end={it.to === '/'} onClick={onClose} className={it.small ? 'small' : undefined}>
                <it.icon /> {it.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="sidebar-foot">{footer}</div>
      </aside>
    </>
  )
}

export function SearchBox({ sources }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const nav = useNavigate()
  const ref = useRef()
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    const out = []
    for (const src of sources) {
      for (const r of src.rows) {
        const t = src.title(r) || ''
        const hay = (t + ' ' + (src.extra?.(r) || '')).toLowerCase()
        if (hay.includes(s)) out.push({ kind: src.kind, title: t, to: src.to(r), starts: t.toLowerCase().startsWith(s) })
      }
    }
    return out.sort((a, b) => b.starts - a.starts).slice(0, 12)
  }, [q, sources])
  useEffect(() => setIdx(0), [q])
  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  function go(r) {
    nav(r.to)
    setQ('')
    setOpen(false)
    ref.current?.blur()
  }
  return (
    <div className="search">
      <Search />
      <input
        ref={ref}
        placeholder="Search sessions, NPCs, places, lore…  (Ctrl K)"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
          if (e.key === 'Enter' && results[idx]) go(results[idx])
          if (e.key === 'Escape') { setQ(''); ref.current.blur() }
        }}
      />
      {open && results.length > 0 && (
        <div className="search-results">
          {results.map((r, i) => (
            <button key={i} className={i === idx ? 'on' : ''} onMouseDown={() => go(r)}>
              <span className="kind">{r.kind}</span>
              <span>{r.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Crumb({ title, page }) {
  return (
    <div className="crumb">
      <div><b>{title}</b><small>{page}</small></div>
    </div>
  )
}

export function Profile({ name = 'Dungeon Master', tagline = 'Game master', initials = 'DM', img }) {
  return (
    <div className="profile-block">
      <div className={`avatar ${img ? 'has-img' : ''}`}>{img ? <img src={img} alt="" /> : initials}</div>
      <div className="hide-md">
        <b>{name}</b>
        <small>{tagline}</small>
      </div>
    </div>
  )
}

export function Topbar({ onMenu, search, right, crumb }) {
  return (
    <header className="topbar">
      <button className="btn icon ghost menu-btn" onClick={onMenu} aria-label="Menu"><Menu /></button>
      {crumb}
      {search}
      <div className="topbar-right">{right}</div>
    </header>
  )
}

export function ViewSwitch({ mode, onChange }) {
  return (
    <div className="seg hide-sm">
      <button className={mode === 'player' ? 'on' : ''} onClick={() => onChange('player')}><Eye /> Player View</button>
      <button className={mode === 'dm' ? 'on' : ''} onClick={() => onChange('dm')}><Skull /> DM View</button>
    </div>
  )
}

export function SignOut({ onClick }) {
  return <button className="btn sm ghost" onClick={onClick}><LogOut /> Sign out</button>
}

export function useCloseOnNav(set) {
  const loc = useLocation()
  useEffect(() => set(false), [loc.pathname, set])
}
