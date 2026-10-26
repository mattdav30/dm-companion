/* A small router covering what the app needs: BrowserRouter with a basename, Routes/Route with
   "*" nesting, NavLink, Navigate, useNavigate, useLocation and useSearchParams. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, Children, isValidElement } from 'react'

const RouterCtx = createContext(null)
const MatchCtx = createContext({ base: '' }) // the part of the path matched by parent routes

const trimSlash = (s) => (s.length > 1 ? s.replace(/\/+$/, '') : s)

function read(basename) {
  let path = window.location.pathname
  if (basename && path.startsWith(basename)) path = path.slice(basename.length) || '/'
  if (!path.startsWith('/')) path = '/' + path
  return { pathname: trimSlash(path), search: window.location.search, hash: window.location.hash }
}

export function BrowserRouter({ basename = '', children }) {
  const base = trimSlash(basename === '/' ? '' : basename)
  const [loc, setLoc] = useState(() => read(base))
  useEffect(() => {
    const on = () => setLoc(read(base))
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [base])
  const go = useCallback((to, { replace = false } = {}) => {
    if (typeof to === 'number') return window.history.go(to)
    let full
    if (to.startsWith('?')) full = base + (loc.pathname === '/' && base ? '' : loc.pathname) + to
    else if (to.startsWith('/')) full = base + (to === '/' && base ? '' : to)
    else full = base + '/' + to
    if (!full) full = '/'
    if (replace) window.history.replaceState(null, '', full)
    else window.history.pushState(null, '', full)
    setLoc(read(base))
    if (!replace) window.scrollTo(0, 0)
  }, [base, loc.pathname])
  const value = useMemo(() => ({ base, loc, go }), [base, loc, go])
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>
}

export function useLocation() {
  return useContext(RouterCtx).loc
}

export function useNavigate() {
  const { go } = useContext(RouterCtx)
  const { base } = useContext(MatchCtx)
  return useCallback((to, opts) => {
    if (typeof to === 'string' && !to.startsWith('/') && !to.startsWith('?')) to = (base || '') + '/' + to
    go(to, opts)
  }, [go, base])
}

export function useSearchParams() {
  const { loc, go } = useContext(RouterCtx)
  const params = useMemo(() => new URLSearchParams(loc.search), [loc.search])
  const set = useCallback((next, opts = {}) => {
    const v = typeof next === 'function' ? next(new URLSearchParams(loc.search)) : next
    const p = v instanceof URLSearchParams ? v : new URLSearchParams(Object.entries(v || {}).filter(([, x]) => x !== undefined && x !== null))
    const qs = p.toString()
    go(loc.pathname + (qs ? '?' + qs : ''), { replace: !!opts.replace })
  }, [loc.search, loc.pathname, go])
  return [params, set]
}

/* Does `pattern` (relative to the parent's base) match the current path? */
function match(pattern, pathname, base) {
  const rest = trimSlash(pathname.slice(base.length) || '/')
  if (pattern === '*') return { base }
  const wild = pattern.endsWith('/*')
  const p = trimSlash(wild ? pattern.slice(0, -2) || '/' : pattern)
  if (wild) {
    if (p === '/' || rest === p || rest.startsWith(p + '/')) return { base: base + (p === '/' ? '' : p) }
    return null
  }
  return rest === p ? { base } : null
}

export function Routes({ children }) {
  const { loc } = useContext(RouterCtx)
  const { base } = useContext(MatchCtx)
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue
    const m = match(child.props.path || '*', loc.pathname, base || '')
    if (m) return <MatchCtx.Provider value={{ base: m.base }}>{child.props.element}</MatchCtx.Provider>
  }
  return null
}

export function Route() {
  return null
}

export function Navigate({ to, replace }) {
  const nav = useNavigate()
  useEffect(() => { nav(to, { replace }) }, [to, replace, nav])
  return null
}

function resolve(to, base) {
  if (to.startsWith('/')) return to
  return (base || '') + '/' + to
}

export function NavLink({ to, end, className, style, onClick, children, ...rest }) {
  const { loc, go, base: rootBase } = useContext(RouterCtx)
  const target = resolve(to, useContext(MatchCtx).base)
  const path = target.split('?')[0]
  const active = end || path === '/' ? loc.pathname === trimSlash(path) : loc.pathname === trimSlash(path) || loc.pathname.startsWith(trimSlash(path) + '/')
  const cls = typeof className === 'function' ? className({ isActive: active }) : [className, active ? 'active' : ''].filter(Boolean).join(' ')
  return (
    <a
      href={rootBase + target}
      className={cls || undefined}
      style={typeof style === 'function' ? style({ isActive: active }) : style}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        go(target)
      }}
      {...rest}
    >
      {typeof children === 'function' ? children({ isActive: active }) : children}
    </a>
  )
}

export const Link = NavLink
