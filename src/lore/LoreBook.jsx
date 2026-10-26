import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pencil, Plus, Search } from 'lucide-react'
import { Emblem } from '../ui/art.jsx'
import { useCampaign } from '../lib/campaign.jsx'
import './lore.css'

const CHAPTER_ORDER = ['World', 'History', 'Nations', 'Peoples', 'Places', 'Factions', 'Key People', 'Faith']
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV']
const FLIP_MS = 720

/* Turn the entries into an ordered list of book pages. */
function buildPages(entries) {
  const byCat = new Map()
  for (const e of entries) {
    const c = e.category || 'Miscellany'
    if (!byCat.has(c)) byCat.set(c, [])
    byCat.get(c).push(e)
  }
  const cats = [...byCat.keys()].sort((a, b) => {
    const ia = CHAPTER_ORDER.indexOf(a)
    const ib = CHAPTER_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })
  const pages = [{ type: 'title' }, { type: 'contents' }]
  const chapters = []
  cats.forEach((cat, ci) => {
    const items = byCat.get(cat).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title))
    const chapter = { cat, roman: ROMAN[ci] || String(ci + 1), start: pages.length, items: [] }
    pages.push({ type: 'chapter', chapter })
    items.forEach((entry) => {
      chapter.items.push({ entry, page: pages.length })
      pages.push({ type: 'entry', entry, chapter })
    })
    chapters.push(chapter)
  })
  return { pages, chapters }
}

function useNarrow(limit = 900) {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < limit)
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < limit)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [limit])
  return narrow
}

export default function LoreBook({ entries, dm = false, onEdit, onToggle, onNew, openId, emptyText = 'No lore has been written into the book yet.' }) {
  const { pages, chapters } = useMemo(() => buildPages(entries), [entries])
  const narrow = useNarrow()
  const per = narrow ? 1 : 2
  const spreads = Math.max(1, Math.ceil(pages.length / per))
  const [spread, setSpread] = useState(0)
  const [flip, setFlip] = useState(null)
  const [query, setQuery] = useState('')
  const timer = useRef()
  const touch = useRef(null)

  useEffect(() => { if (spread > spreads - 1) setSpread(spreads - 1) }, [spread, spreads])
  useEffect(() => {
    if (!openId) return
    const i = pages.findIndex((p) => p.type === 'entry' && (String(p.entry.id) === String(openId) || p.entry.slug === openId))
    if (i >= 0) setSpread(Math.floor(i / per))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, per, pages.length])
  useEffect(() => () => clearTimeout(timer.current), [])

  const current = flip ? flip.to : spread
  const go = useCallback((target) => {
    const t = Math.max(0, Math.min(spreads - 1, target))
    if (t === spread || flip) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return setSpread(t)
    setFlip({ from: spread, to: t, dir: t > spread ? 1 : -1 })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setSpread(t); setFlip(null) }, FLIP_MS)
  }, [spread, spreads, flip])
  const goPage = useCallback((p) => go(Math.floor(p / per)), [go, per])

  useEffect(() => {
    const k = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowRight') go(spread + 1)
      if (e.key === 'ArrowLeft') go(spread - 1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [go, spread])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return pages.map((p, i) => ({ p, i })).filter(({ p }) => p.type === 'entry' && `${p.entry.title} ${p.entry.subtitle || ''} ${p.entry.teaser || ''}`.toLowerCase().includes(q)).slice(0, 8)
  }, [query, pages])

  const pageAt = (i) => (i >= 0 && i < pages.length ? pages[i] : { type: 'blank' })
  const render = (i, side) => (
    <Page key={i} page={pageAt(i)} num={i} side={side} chapters={chapters} dm={dm} goPage={goPage} onEdit={onEdit} onToggle={onToggle} onNew={onNew} total={entries.length} />
  )

  const activeCat = (() => {
    const p = pageAt(current * per)
    return p.chapter?.cat || pageAt(current * per + 1).chapter?.cat
  })()

  let body
  if (!flip) {
    body = per === 2
      ? <>{<div className="leaf-slot left">{render(spread * 2, 'left')}</div>}<div className="leaf-slot right">{render(spread * 2 + 1, 'right')}</div></>
      : <div className="leaf-slot single">{render(spread, 'right')}</div>
  } else if (per === 2) {
    const { from, to, dir } = flip
    body = dir > 0 ? (
      <>
        <div className="leaf-slot left">{render(from * 2, 'left')}</div>
        <div className="leaf-slot right">{render(to * 2 + 1, 'right')}</div>
        <div className="leaf turning fwd">
          <div className="leaf-face front">{render(from * 2 + 1, 'right')}</div>
          <div className="leaf-face back">{render(to * 2, 'left')}</div>
        </div>
      </>
    ) : (
      <>
        <div className="leaf-slot left">{render(to * 2, 'left')}</div>
        <div className="leaf-slot right">{render(from * 2 + 1, 'right')}</div>
        <div className="leaf turning back-dir">
          <div className="leaf-face front">{render(from * 2, 'left')}</div>
          <div className="leaf-face back">{render(to * 2 + 1, 'right')}</div>
        </div>
      </>
    )
  } else {
    const { from, to, dir } = flip
    body = dir > 0 ? (
      <>
        <div className="leaf-slot single">{render(to, 'right')}</div>
        <div className="leaf turning single fwd"><div className="leaf-face front">{render(from, 'right')}</div><div className="leaf-face back blank-back" /></div>
      </>
    ) : (
      <>
        <div className="leaf-slot single">{render(from, 'right')}</div>
        <div className="leaf turning single back-in"><div className="leaf-face front">{render(to, 'right')}</div><div className="leaf-face back blank-back" /></div>
      </>
    )
  }

  return (
    <div className="lorebook">
      <div className="lorebook-bar">
        <div className="lorebook-search">
          <Search size={16} />
          <input placeholder="Find an entry…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) { goPage(matches[0].i); setQuery('') } }} />
          {matches.length > 0 && (
            <div className="search-results">
              {matches.map(({ p, i }) => (
                <button key={i} onMouseDown={() => { goPage(i); setQuery('') }}>
                  <span className="kind">{p.chapter.cat}</span><span>{p.entry.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="lorebook-count">{entries.length} entries · {chapters.length} chapters</div>
        {dm && onNew && <button className="btn primary" onClick={() => onNew()}><Plus /> New entry</button>}
      </div>

      <div className="ribbons">
        {chapters.map((c) => (
          <button key={c.cat} className={`ribbon ${activeCat === c.cat ? 'on' : ''}`} onClick={() => goPage(c.start)} title={`Chapter ${c.roman}: ${c.cat}`}>
            <span>{c.cat}</span>
          </button>
        ))}
      </div>

      <div
        className={`book ${per === 1 ? 'is-single' : ''}`}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (touch.current == null) return
          const dx = e.changedTouches[0].clientX - touch.current
          touch.current = null
          if (Math.abs(dx) > 50) go(spread + (dx < 0 ? 1 : -1))
        }}
      >
        <div className="book-cover" />
        <div className="book-block">
          {entries.length === 0 ? <div className="leaf-slot single"><div className="page"><div className="page-inner empty-page">{emptyText}</div></div></div> : body}
          {per === 2 && <div className="book-gutter" />}
        </div>
        <button className="turn prev" onClick={() => go(spread - 1)} disabled={spread === 0 || !!flip} aria-label="Previous page"><ChevronLeft /></button>
        <button className="turn next" onClick={() => go(spread + 1)} disabled={spread >= spreads - 1 || !!flip} aria-label="Next page"><ChevronRight /></button>
      </div>
      <div className="lorebook-hint">{narrow ? 'Swipe or use the arrows to turn pages' : 'Use the arrows or your arrow keys to turn pages'}</div>
    </div>
  )
}

function Page({ page, num, side, chapters, dm, goPage, onEdit, onToggle, onNew, total }) {
  const campaignName = useCampaign().campaign?.name || 'the world'
  const folio = page.type === 'blank' ? null : <div className={`folio ${side}`}>{num + 1}</div>
  let inner
  if (page.type === 'title') {
    inner = (
      <div className="title-page">
        <Emblem className="tp-emblem" />
        <div className="tp-small">The</div>
        <h1>Lore Book</h1>
        <div className="tp-rule"><i /></div>
        <div className="tp-sub">of {campaignName}</div>
        <div className="tp-count">{total} entries</div>
      </div>
    )
  } else if (page.type === 'contents') {
    inner = (
      <div className="contents-page">
        <div className="running">Contents</div>
        <h2>Contents</h2>
        <div className="tp-rule"><i /></div>
        <ol>
          {chapters.map((c) => (
            <li key={c.cat}>
              <button onClick={() => goPage(c.start)}>
                <span className="c-num">{c.roman}</span>
                <span className="c-name">{c.cat}</span>
                <span className="c-dots" />
                <span className="c-page">{c.start + 1}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    )
  } else if (page.type === 'chapter') {
    const c = page.chapter
    inner = (
      <div className="chapter-page">
        <div className="running">Chapter {c.roman}</div>
        <div className="ch-num">Chapter {c.roman}</div>
        <h2>{c.cat}</h2>
        <div className="tp-rule"><i /></div>
        <ol>
          {c.items.map(({ entry, page: p }) => (
            <li key={entry.slug || entry.id} className={entry.revealed === false ? 'is-hidden' : ''}>
              <button onClick={() => goPage(p)}>
                <span className="c-name">{entry.title}{dm && entry.revealed === false && <EyeOff size={13} />}</span>
                <span className="c-dots" />
                <span className="c-page">{p + 1}</span>
              </button>
            </li>
          ))}
        </ol>
        {dm && onNew && <button className="page-add" onClick={() => onNew(c.cat)}><Plus size={15} /> Add an entry to {c.cat}</button>}
      </div>
    )
  } else if (page.type === 'entry') {
    const e = page.entry
    const paras = String(e.body || '').split(/\n+/).map((x) => x.trim()).filter(Boolean)
    inner = (
      <article className={`entry-page ${e.revealed === false ? 'is-hidden' : ''}`}>
        <div className="running">{page.chapter.cat}</div>
        {dm && (
          <div className="entry-tools">
            {e.revealed === false && <span className="hidden-tag">Hidden from players</span>}
            {onToggle && (
              <button onClick={() => onToggle(e)} title={e.revealed === false ? 'Reveal to players' : 'Hide from players'}>
                {e.revealed === false ? <><Eye size={14} /> Reveal</> : <><EyeOff size={14} /> Hide</>}
              </button>
            )}
            {onEdit && <button onClick={() => onEdit(e)} title="Edit entry"><Pencil size={14} /> Edit</button>}
          </div>
        )}
        {e.subtitle && <div className="kicker">{e.subtitle}</div>}
        <h2>{e.title}</h2>
        <div className="tp-rule"><i /></div>
        {e.teaser && <p className="lead">{e.teaser}</p>}
        <div className="copy">
          {paras.map((p, i) => <p key={i} className={i === 0 ? 'dropcap' : ''}>{p}</p>)}
        </div>
        {e.source_label && <div className="source">{e.source_label}</div>}
      </article>
    )
  } else {
    inner = <div className="blank-page"><Emblem className="tp-emblem faint" /></div>
  }
  return (
    <div className={`page ${side}`}>
      <div className="page-inner">{inner}</div>
      {folio}
    </div>
  )
}
