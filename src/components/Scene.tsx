import { useLayoutEffect, useRef } from 'react'
import { animate, createDrawable, stagger } from 'animejs'
import BlurText from './reactbits/BlurText'
import type { Placed } from '../lib/layout'

export type View =
  | { id: number; mode: 'galaxy'; word: string; center: { size: number; w: number }; items: Placed[] }
  | { id: number; mode: 'bridge'; a: string; b: string; endSize: number; vertical: boolean; ends: { x: number; y: number }[]; items: Placed[] }

interface Props {
  view: View
  W: number
  H: number
  onPick: (word: string) => void
  onHover: (item: Placed | null) => void
}

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Scene({ view, W, H, onPick, onHover }: Props) {
  const root = useRef<HTMLDivElement>(null)

  // Entrance (anime.js): lines draw in, words bloom outward from the middle, then drift gently.
  useLayoutEffect(() => {
    const el = root.current
    if (!el || reduce()) return
    const anims: { pause(): unknown }[] = []
    const lines = el.querySelectorAll('[data-line]')
    if (lines.length) anims.push(animate(createDrawable(lines), { draw: ['0 0', '0 1'], duration: 1100, ease: 'outExpo', delay: stagger(24, { from: 'center' }) }))
    const inner = el.querySelectorAll('[data-in]')
    anims.push(animate(inner, { opacity: [0, 1], scale: [0.5, 1], duration: 1000, ease: 'outExpo', delay: stagger(26, { start: 180, from: 'center' }) }))
    const float = el.querySelectorAll('[data-float]')
    float.forEach((f, i) => {
      const d = 3400 + ((i * 937) % 3200), r = 2.5 + ((i * 7) % 4)
      anims.push(animate(f, { x: [-r, r], y: [r * 0.6, -r * 0.6], duration: d, alternate: true, loop: true, ease: 'inOutSine', delay: (i * 211) % 1500 }))
    })
    return () => anims.forEach((a) => a.pause())
  }, [view.id])

  const cx = W / 2, cy = H / 2
  const pos = (x: number, y: number): React.CSSProperties => ({ left: cx + x, top: cy + y, transform: 'translate(-50%,-50%)' })

  const wordEl = (it: Placed) => (
    <div key={it.word} className="absolute" style={{ ...pos(it.x, it.y), opacity: it.opacity }}>
      <div data-float>
        <div data-in className="origin-center">
          <button
            type="button"
            className="word-btn cursor-target font-display"
            style={{ fontSize: it.size }}
            onClick={() => onPick(it.word)}
            onMouseEnter={() => onHover(it)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(it)}
            onBlur={() => onHover(null)}
          >
            {it.word}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div ref={root} className="absolute inset-0">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} fill="none" stroke="#fff" strokeLinecap="round" aria-hidden="true">
        {view.mode === 'galaxy'
          ? view.items.map((it) => (
              <line key={it.word} data-line x1={cx} y1={cy} x2={cx + it.x} y2={cy + it.y} strokeWidth="1" strokeOpacity={0.06 + 0.2 * it.opacity * it.opacity} />
            ))
          : (
            <>
              <line data-line x1={cx + view.ends[0].x} y1={cy + view.ends[0].y} x2={cx + view.ends[1].x} y2={cy + view.ends[1].y} strokeWidth="1" strokeOpacity="0.35" />
              {view.items.map((it) => {
                const px = view.vertical ? cx : cx + it.x, py = view.vertical ? cy + it.y : cy
                return <line key={it.word} data-line x1={px} y1={py} x2={cx + it.x} y2={cy + it.y} strokeWidth="1" strokeDasharray="2 5" strokeOpacity="0.22" />
              })}
            </>
          )}
      </svg>

      {view.mode === 'galaxy' ? (
        <div className="absolute" style={pos(0, 0)}>
          <h2 className="font-display leading-none tracking-tight" style={{ fontSize: view.center.size }} aria-label={view.word}>
            <BlurText key={view.id} text={view.word} delay={60} animateBy="letters" direction="top" trigger="load" />
          </h2>
        </div>
      ) : (
        view.ends.map((e, k) => (
          <div key={k} className="absolute" style={pos(e.x, e.y)}>
            <h2 className="font-display italic leading-none tracking-tight" style={{ fontSize: view.endSize }}>
              <BlurText key={view.id + '-' + k} text={k ? view.b : view.a} delay={60} animateBy="letters" direction={k ? 'bottom' : 'top'} trigger="load" />
            </h2>
          </div>
        ))
      )}

      {view.items.map(wordEl)}
    </div>
  )
}
