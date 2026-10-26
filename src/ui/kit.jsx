import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Lock, Check } from 'lucide-react'

/* Props that make a non-button element work with keyboard and screen readers as well as the mouse. */
export function clickable(fn) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); fn(e) } },
  }
}

export function Panel({ title, action, children, className = '', framed, bodyClass = 'panel-body', style }) {
  return (
    <section className={`panel ${framed ? 'framed' : ''} ${className}`} style={style}>
      {(title || action) && (
        <div className="panel-head">
          {title && <h3>{title}</h3>}
          {action}
        </div>
      )}
      {bodyClass === null ? children : <div className={bodyClass}>{children}</div>}
    </section>
  )
}

const STATUS_TONES = {
  active: 'green', owned: 'green', open: 'green', current: 'solid-red', completed: 'grey', complete: 'grey', resolved: 'grey',
  planned: 'blue', future: 'blue', found: 'blue', developing: 'blue', early: 'blue',
  dead: 'red', missing: 'red', lost: 'red', destroyed: 'red', grief: 'red', complicated: 'violet',
  strong: 'green', major: 'solid-red', dormant: 'grey',
}
export function tone(value) {
  if (!value) return ''
  const v = String(value).toLowerCase()
  for (const k of Object.keys(STATUS_TONES)) if (v.startsWith(k)) return STATUS_TONES[k]
  return ''
}

export function Badge({ children, tone: t, dm }) {
  if (dm) return <span className="badge dm"><Lock /> DM only</span>
  if (children == null || children === '') return null
  return <span className={`badge ${t ?? tone(children)}`}>{children}</span>
}

export function Toggle({ on, onChange, title }) {
  return <button type="button" title={title} aria-pressed={!!on} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
}

export function Check2({ on, onChange, title }) {
  return (
    <button type="button" title={title} aria-pressed={!!on} className={`check ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      {on && <Check />}
    </button>
  )
}

export function Modal({ title, onClose, children, footer, width }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel framed modal" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="panel-head">
          <h3>{title}</h3>
          <button className="btn sm icon ghost" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="panel-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </section>
    </div>,
    document.body,
  )
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {})
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((text, kind = 'info') => {
    const id = Math.random()
    setItems((x) => [...x, { id, text, kind }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'error' ? 6000 : 2600)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

/* ---------- Form ---------- */
export function AutoTextarea({ value, onChange, rows = 3, ...rest }) {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(520, el.scrollHeight + 2) + 'px'
  }, [value])
  return <textarea ref={ref} className="textarea" rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
}

export function FieldInput({ f, value, onChange }) {
  if (f.type === 'textarea') return <AutoTextarea value={value} onChange={onChange} placeholder={f.placeholder} />
  if (f.type === 'select')
    return (
      <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        {value && !f.options.includes(value) && <option value={value}>{value}</option>}
      </select>
    )
  if (f.type === 'bool') return <Toggle on={!!value} onChange={onChange} />
  if (f.type === 'number')
    return <input className="input" type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
  return <input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} list={f.list} />
}

export function RecordForm({ fields, values, setValues }) {
  return (
    <div className="form-grid">
      {fields.map((f) => (
        <div key={f.key} className={`field ${f.type === 'textarea' || f.full ? 'full' : ''}`}>
          <label>
            {f.label}
            {f.dm && <Badge dm />}
          </label>
          <FieldInput f={f} value={values[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
        </div>
      ))}
    </div>
  )
}

export function Loading({ text = 'Unrolling the scrolls…' }) {
  return <div className="empty">{text}</div>
}
