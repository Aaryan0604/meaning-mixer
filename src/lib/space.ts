/**
 * The "space": 30,000 English words as 100-dimensional unit vectors (a skip-gram word embedding),
 * quantised to int8 and shipped as static files. Everything below runs in the browser.
 */
export interface Space {
  words: string[]
  dims: number
  vecs: Float32Array // count * dims, each row unit length
  hub: Float32Array // how "generic" a word is (mean similarity to random words)
  stop: number // the first `stop` words are function words: usable as queries, never as neighbours
  index: Map<string, number>
}

export async function loadSpace(onProgress?: (p: number) => void): Promise<Space> {
  const get = async (f: string) => {
    const r = await fetch('./data/' + f)
    if (!r.ok) throw new Error('Could not load ' + f)
    return r
  }
  onProgress?.(0.05)
  const meta = await (await get('meta.json')).json() as { count: number; dims: number; scale: number; stopCount: number }
  const [wordsTxt, vecBuf, hubBuf] = await Promise.all([
    get('words.txt').then((r) => r.text()),
    get('vectors.i8').then((r) => r.arrayBuffer()),
    get('hub.u8').then((r) => r.arrayBuffer()),
  ])
  onProgress?.(0.7)
  const words = wordsTxt.split('\n')
  const i8 = new Int8Array(vecBuf)
  const vecs = new Float32Array(i8.length)
  for (let i = 0; i < words.length; i++) {
    let n = 0
    for (let j = 0; j < meta.dims; j++) { const x = i8[i * meta.dims + j] / meta.scale; vecs[i * meta.dims + j] = x; n += x * x }
    n = Math.sqrt(n) || 1
    for (let j = 0; j < meta.dims; j++) vecs[i * meta.dims + j] /= n
  }
  const hub = Float32Array.from(new Uint8Array(hubBuf), (b) => b / 255)
  const index = new Map(words.map((w, i) => [w, i]))
  onProgress?.(1)
  return { words, dims: meta.dims, vecs, hub, stop: meta.stopCount, index }
}

/** Find a word in the vocabulary, forgiving plurals and capitalisation. */
export function resolve(space: Space, raw: string): { word: string; i: number } | null {
  const w = raw.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return null
  const tries = [w, w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/ing$/, ''), w.replace(/ed$/, '')]
  for (const t of tries) { const i = space.index.get(t); if (i !== undefined) return { word: t, i } }
  return null
}

export const sim = (s: Space, a: number, b: number) => {
  let t = 0
  const d = s.dims, A = a * d, B = b * d
  for (let j = 0; j < d; j++) t += s.vecs[A + j] * s.vecs[B + j]
  return t
}

/** Inflections / containment: "fires" is not an interesting neighbour of "fire". */
const related = (a: string, b: string) => a.includes(b) || b.includes(a) || a.slice(0, 5) === b.slice(0, 5)

export interface Hit { i: number; word: string; sim: number; simB?: number }

/** k nearest neighbours of one word. */
export function neighbours(s: Space, q: number, k: number): Hit[] {
  const qw = s.words[q], out: Hit[] = []
  for (let i = s.stop; i < s.words.length; i++) {
    if (i === q || related(s.words[i], qw)) continue
    out.push({ i, word: s.words[i], sim: sim(s, q, i) - 0.5 * s.hub[i] })
  }
  out.sort((a, b) => b.sim - a.sim)
  const top = out.slice(0, k)
  for (const h of top) h.sim = sim(s, q, h.i) // report the true cosine
  return top
}

/** Words that sit between two words: close to BOTH (min of the two similarities), minus the hub penalty. */
export function between(s: Space, a: number, b: number, k: number): Hit[] {
  const aw = s.words[a], bw = s.words[b]
  const scored: { i: number; score: number; sa: number; sb: number }[] = []
  for (let i = s.stop; i < s.words.length; i++) {
    const w = s.words[i]
    if (i === a || i === b || related(w, aw) || related(w, bw)) continue
    const sa = sim(s, a, i), sb = sim(s, b, i)
    scored.push({ i, score: Math.min(sa, sb) - s.hub[i], sa, sb })
  }
  scored.sort((x, y) => y.score - x.score)
  // sim = similarity to the first word, simB = similarity to the second
  return scored.slice(0, k).map((h) => ({ i: h.i, word: s.words[h.i], sim: h.sa, simB: h.sb }))
}
