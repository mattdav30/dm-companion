import { useMemo, useState } from 'react'
import { ChevronDown, ArrowUp, ArrowDown, Pencil, Trash2, Lock, BookOpen, MessageSquare, Swords, StickyNote, User, Compass, Search, Sparkles, Scroll, CheckCheck, Undo2 } from 'lucide-react'
import { updateRow, errorText } from '../lib/data.js'
import { Check2, useToast } from '../ui/kit.jsx'
import { BLOCK_TYPES } from '../entities.js'

const ICONS = {
  'Read Aloud': BookOpen, Narration: Scroll, Dialogue: MessageSquare, 'DM Note': StickyNote, Encounter: Swords,
  NPC: User, Travel: Compass, Clue: Search, Check: Search, Checks: Search, Choice: Sparkles, 'Story Beat': Sparkles, 'Character Arc': User,
}
const KIND = { 'Read Aloud': 'read', 'DM Note': 'note', Dialogue: 'talk', Encounter: 'fight', Overview: 'over', Reference: 'over', Section: 'over' }
const SCENE_TONES = ['#8f3429', '#b08a4a', '#4f7d86', '#7d5a9a', '#5e7f4a', '#a0603a']

export function groupScenes(blocks) {
  const out = []
  for (const b of blocks) {
    const key = b.scene_title || 'Unsorted'
    let g = out.find((x) => x.key === key)
    if (!g) out.push((g = { key, items: [] }))
    g.items.push(b)
  }
  return out
}

/* The run sheet, shared by the Sessions page (edit) and Play mode (play). */
export default function RunSheet({ blocks, all, mode = 'edit', onEdit, onMove, onRemove }) {
  const toast = useToast()
  const [open, setOpen] = useState({})
  const scenes = useMemo(() => groupScenes(blocks), [blocks])
  const fullScenes = useMemo(() => groupScenes(all || blocks), [all, blocks])
  const nextId = (all || blocks).find((b) => !b.completed)?.id
  const play = mode === 'play'
  const tick = (b, v) => updateRow('session_blocks', b.id, { completed: v ? 1 : 0 }).catch((e) => toast(errorText(e), 'error'))
  const tickAll = (items, v) => Promise.all(items.map((b) => updateRow('session_blocks', b.id, { completed: v ? 1 : 0 }))).catch((e) => toast(errorText(e), 'error'))

  return (
    <div className={`runsheet ${play ? 'play' : ''}`}>
      {scenes.map((g) => {
        const full = fullScenes.find((x) => x.key === g.key)?.items || g.items
        const idx = fullScenes.findIndex((x) => x.key === g.key)
        const doneN = full.filter((b) => b.completed).length
        const allDone = doneN === full.length
        const isOpen = open[g.key] ?? !allDone
        const tone = SCENE_TONES[Math.max(0, idx) % SCENE_TONES.length]
        return (
          <section key={g.key} className={`scene-card ${allDone ? 'done' : ''} ${isOpen ? 'open' : ''}`} style={{ '--sc': tone }}>
            <header className="scene-head">
              <button className="scene-toggle" onClick={() => setOpen({ ...open, [g.key]: !isOpen })} aria-expanded={isOpen}>
                <span className="scene-no">{idx + 1}</span>
                <span className="scene-name">{g.key}</span>
                <span className="scene-count">{doneN}/{full.length}</span>
                <ChevronDown className="scene-chev" />
              </button>
              <button className="btn sm ghost icon scene-all" title={allDone ? 'Untick this scene' : 'Tick the whole scene'} onClick={() => tickAll(full, !allDone)}>{allDone ? <Undo2 /> : <CheckCheck />}</button>
              <div className="scene-bar"><i style={{ width: `${(doneN / full.length) * 100}%` }} /></div>
            </header>
            {isOpen && (
              <div className="scene-blocks">
                {g.items.map((b) => {
                  const Icon = ICONS[b.block_type] || Scroll
                  const kind = KIND[b.block_type] || 'plain'
                  return (
                    <article key={b.id} className={`rblock k-${kind} ${b.completed ? 'done' : ''} ${play && b.id === nextId ? 'next' : ''}`} style={{ '--bt': BLOCK_TYPES[b.block_type] || 'var(--gold-dim)' }}>
                      <Check2 on={!!b.completed} title="Mark done" onChange={(v) => tick(b, v)} />
                      <div className="rblock-main">
                        <div className="rblock-head">
                          <span className="rtype"><Icon /> {b.block_type}</span>
                          {!!b.dm_only && <span className="rtag"><Lock /> DM</span>}
                          {play && b.id === nextId && <span className="rtag now">Up next</span>}
                          {!play && (
                            <div className="block-tools">
                              <button className="btn sm icon ghost" onClick={() => onMove(b, -1)} title="Move up"><ArrowUp /></button>
                              <button className="btn sm icon ghost" onClick={() => onMove(b, 1)} title="Move down"><ArrowDown /></button>
                              <button className="btn sm icon ghost" onClick={() => onEdit(b)} title="Edit"><Pencil /></button>
                              <button className="btn sm icon ghost" onClick={() => onRemove(b)} title="Delete"><Trash2 /></button>
                            </div>
                          )}
                        </div>
                        {b.title && <h5 className="rblock-title">{b.title}</h5>}
                        {b.content && <div className="rblock-body">{b.content}</div>}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
