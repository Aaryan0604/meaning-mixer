import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { animate } from 'animejs'
import TargetCursor from './components/reactbits/TargetCursor'
import ShinyText from './components/reactbits/ShinyText'
import { Scene, type View } from './components/Scene'
import { loadSpace, resolve, neighbours, between, type Space } from './lib/space'
import { galaxyLayout, bridgeLayout, type Placed } from './lib/layout'

type Target = { kind: 'galaxy'; word: string } | { kind: 'bridge'; a: string; b: string }

const SEEDS = ['ocean', 'music', 'curious', 'garden', 'machine', 'winter', 'river', 'dream']
const reduce = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function App() {
  const [space, setSpace] = useState<Space | null>(null)
  const [loadP, setLoadP] = useState(0)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [size, setSize] = useState({ W: 0, H: 0 })
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<Placed | null>(null)
  const [trail, setTrail] = useState<string[]>([])
  const [wander, setWander] = useState(!reduce())
  const [about, setAbout] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const idCounter = useRef(0)
  const viewId = useRef(0)

  // load the 30,000-word space
  useEffect(() => {
    loadSpace(setLoadP).then(setSpace).catch((e) => setLoadErr(String(e.message ?? e)))
  }, [])

  // track the stage size
  useEffect(() => {
    const el = stage.current!
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }))
    ro.observe(el)
    setSize({ W: el.clientWidth, H: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // first scene
  useEffect(() => {
    if (space && !target) setTarget({ kind: 'galaxy', word: SEEDS[Math.floor(Math.random() * SEEDS.length)] })
  }, [space, target])

  const view: View | null = useMemo(() => {
    if (!space || !target || !size.W) return null
    const id = ++idCounter.current
    if (target.kind === 'galaxy') {
      const r = resolve(space, target.word)!
      const hits = neighbours(space, r.i, size.W < 640 ? 18 : 26)
      const L = galaxyLayout(space, r.word, hits, size.W, size.H)
      return { id, mode: 'galaxy', word: r.word, center: L.center, items: L.items }
    }
    const a = resolve(space, target.a)!, b = resolve(space, target.b)!
    const hits = between(space, a.i, b.i, size.W < 640 ? 14 : 20)
    const L = bridgeLayout(space, a.i, b.i, hits, size.W, size.H)
    return { id, mode: 'bridge', a: a.word, b: b.word, endSize: L.endSize, vertical: L.vertical, ends: L.ends, items: L.items }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space, target, size.W < 640, size.W > 0 && Math.round(size.W / 40), size.H > 0 && Math.round(size.H / 40)])
  if (view) viewId.current = view.id

  const goto = useCallback((t: Target) => {
    setTarget(t); setError(null); setHover(null)
    if (t.kind === 'galaxy') setTrail((tr) => [...tr.filter((w) => w !== t.word), t.word].slice(-6))
  }, [])

  const stopWander = useCallback(() => setWander(false), [])

  const submit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!space) return
    const tokens = text.trim().split(/[\s,+&/]+/).filter(Boolean).slice(0, 2)
    if (!tokens.length) return
    const found = tokens.map((t) => ({ t, r: resolve(space, t) }))
    const miss = found.find((f) => !f.r)
    if (miss) {
      setError(`"${miss.t}" isn't one of my 30,000 words. Try something simpler, like "ocean" or "teacher".`)
      if (!reduce()) animate('.input-wrap', { x: [0, -8, 8, -5, 5, 0], duration: 420, ease: 'outQuad' })
      return
    }
    stopWander()
    if (found.length === 1) goto({ kind: 'galaxy', word: found[0].r!.word })
    else if (found[0].r!.word === found[1].r!.word) goto({ kind: 'galaxy', word: found[0].r!.word })
    else goto({ kind: 'bridge', a: found[0].r!.word, b: found[1].r!.word })
    setText('')
    input.current?.blur()
  }, [text, space, goto, stopWander])

  const pick = useCallback((w: string) => { stopWander(); goto({ kind: 'galaxy', word: w }) }, [goto, stopWander])

  // wander mode: hop from word to nearby word on its own
  useEffect(() => {
    if (!wander || !space || !view || view.mode !== 'galaxy') return
    const t = window.setTimeout(() => {
      const recent = new Set(trail.slice(-5))
      const pool = view.items.slice(0, 9).filter((i) => !recent.has(i.word))
      const next = (pool.length ? pool : view.items.slice(0, 5))[Math.floor(Math.random() * (pool.length || 5))]
      if (next) goto({ kind: 'galaxy', word: next.word })
    }, 4800)
    return () => window.clearTimeout(t)
  }, [wander, space, view, trail, goto])

  const readout = hover
    ? view?.mode === 'bridge'
      ? `${hover.word} · ${Math.round(hover.sim * 100)}% like ${view.a} · ${Math.round((hover.simB ?? 0) * 100)}% like ${view.b}`
      : `${hover.word} · ${Math.round(hover.sim * 100)}% as close to ${view?.mode === 'galaxy' ? view.word : ''} as words get`
    : null

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-white">
      <TargetCursor targetSelector=".cursor-target" showLabel={false} cursorColor="#ffffff" />

      <div ref={stage} className="absolute inset-0">
        {view && <Scene view={view} W={size.W} H={size.H} onPick={pick} onHover={setHover} />}
      </div>

      {/* loading */}
      {!space && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black">
          <p className="font-display text-5xl italic text-white/90 sm:text-6xl">Meaning Mixer</p>
          <p className="mt-5 text-sm text-white/45" role="status">
            {loadErr ? loadErr : `unpacking 30,000 words… ${Math.round(loadP * 100)}%`}
          </p>
        </div>
      )}

      {/* top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5 sm:p-8">
        <p className="font-display text-2xl leading-none sm:text-[1.7rem]">Meaning <span className="italic">Mixer</span></p>
        <button className="tlink pointer-events-auto cursor-target text-sm text-white/70 hover:text-white" onClick={() => setAbout(true)}>how it works</button>
      </header>

      {trail.length > 1 && (
        <nav className="absolute inset-x-0 top-[3.6rem] z-10 flex justify-center px-5 font-display text-base italic text-white/40 sm:top-8" aria-label="Words you've visited">
          <ol className="flex max-w-full flex-wrap justify-center gap-x-2 gap-y-0">
            {trail.map((w, k) => (
              <li key={w} className="flex gap-2">
                {k > 0 && <span aria-hidden="true">→</span>}
                <button className="word-btn cursor-target !p-0 hover:text-white" onClick={() => pick(w)}>{w}</button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* input */}
      <form onSubmit={submit} className="absolute inset-x-0 bottom-0 z-10 mx-auto w-full max-w-xl px-6 pb-14 sm:pb-16" aria-label="Type a word or two">
        <div className="input-wrap">
          <label htmlFor="w" className="sr-only">A word, or two words to blend</label>
          <input
            id="w" ref={input} className="word-input" value={text} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={40}
            placeholder="type a word, or two…" onChange={(e) => { setText(e.target.value); setError(null) }} onFocus={stopWander}
            disabled={!space}
          />
          <div className="input-rule" />
        </div>
        <p className="mt-3 min-h-[1.25rem] text-center text-[13px] leading-snug" role="status" aria-live="polite">
          {error ? <span className="text-white">{error}</span> : <ShinyText text="two words show you what sits between them" color="#6b6b6b" shineColor="#ffffff" speed={4} />}
        </p>
      </form>

      {/* footer line: readout and wander */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between px-5 pb-4 text-xs text-white/55 sm:px-8 sm:pb-5">
        <p className="min-h-4 truncate pr-4" aria-live="polite">{readout}</p>
        <button className="tlink pointer-events-auto cursor-target shrink-0 hover:text-white" onClick={() => setWander((w) => !w)} aria-pressed={wander}>
          wander: {wander ? 'on' : 'off'}
        </button>
      </div>

      {about && (
        <div className="absolute inset-0 z-30 overflow-y-auto bg-black/95 px-6 py-16" role="dialog" aria-modal="true" aria-label="How it works">
          <div className="mx-auto max-w-xl">
            <h2 className="font-display text-5xl leading-none sm:text-6xl">How it <span className="italic">works</span></h2>
            <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-white/70">
              <p>Every word here is a point in a 100-dimensional space. Words used in similar contexts end up near each other. That's what a <em>word embedding</em> learns. This one is a skip-gram model; 30,000 of its words were packed into 3 MB and loaded into your browser. There is no server and nothing you type leaves this tab.</p>
              <p><span className="text-white">One word:</span> I find its 26 closest points by cosine similarity, then flatten them to two dimensions with PCA so related words stay near each other. Distance from the centre is how dissimilar they are.</p>
              <p><span className="text-white">Two words:</span> I rank every word by how close it is to <em>both</em> (the weaker of the two similarities), and penalise generic "hub" words that are loosely close to everything. Position along the line shows which end a word leans toward.</p>
              <p><span className="text-white">Honest caveat:</span> the model learned from news-style text, so it inherited that text's habits and biases. It's a mirror of its data, not a dictionary of truth. That is worth knowing about any embedding.</p>
            </div>
            <button className="tlink cursor-target mt-10 text-base" onClick={() => setAbout(false)}>back to the words</button>
          </div>
        </div>
      )}
    </div>
  )
}
