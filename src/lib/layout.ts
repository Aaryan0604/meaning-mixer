import { type Space, type Hit } from './space'

export interface Placed { word: string; i: number; x: number; y: number; size: number; opacity: number; sim: number; simB?: number }

const charW = 0.47 // average serif glyph width as a fraction of font size

/** Top-2 principal coordinates for a set of rows, via the Gram matrix + power iteration. */
function pca2(rows: Float32Array[]): [number, number][] {
  const K = rows.length, D = rows[0].length
  const mean = new Float32Array(D)
  rows.forEach((r) => r.forEach((x, j) => (mean[j] += x / K)))
  const X = rows.map((r) => Float32Array.from(r, (x, j) => x - mean[j]))
  const G = Array.from({ length: K }, (_, i) => Float32Array.from({ length: K }, (_, j) => { let s = 0; for (let d = 0; d < D; d++) s += X[i][d] * X[j][d]; return s }))
  const coords: number[][] = [[], []]
  for (let c = 0; c < 2; c++) {
    let u: Float32Array = Float32Array.from({ length: K }, (_, i) => Math.sin(i * 12.9898 + c * 78.233) + 0.5)
    let lambda = 0
    for (let it = 0; it < 60; it++) {
      const w = new Float32Array(K)
      for (let i = 0; i < K; i++) { let s = 0; for (let j = 0; j < K; j++) s += G[i][j] * u[j]; w[i] = s }
      const n = Math.hypot(...w) || 1
      lambda = n
      u = Float32Array.from(w, (x) => x / n)
    }
    const sc = Math.sqrt(lambda)
    coords[c] = Array.from(u, (x) => x * sc)
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) G[i][j] -= lambda * u[i] * u[j] // deflate
  }
  return rows.map((_, i) => [coords[0][i], coords[1][i]])
}

interface Box { x: number; y: number; w: number; h: number; fixed?: boolean }

/** Nudge labels apart so none overlap, and keep them inside the stage. */
function relax(boxes: Box[], W: number, H: number, bounds: { l: number; r: number; t: number; b: number }) {
  for (let it = 0; it < 500; it++) {
    let moved = false
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b]
      const dx = B.x - A.x, dy = B.y - A.y
      const ox = (A.w + B.w) / 2 + 26 - Math.abs(dx), oy = (A.h + B.h) / 2 + 16 - Math.abs(dy)
      if (ox > 0 && oy > 0) {
        moved = true
        const pushX = ox < oy
        const share = A.fixed ? [0, 1] : B.fixed ? [1, 0] : [0.5, 0.5]
        if (pushX) { const s = dx >= 0 ? 1 : -1; A.x -= s * ox * share[0]; B.x += s * ox * share[1] }
        else { const s = dy >= 0 ? 1 : -1; A.y -= s * oy * share[0]; B.y += s * oy * share[1] }
      }
    }
    for (const B of boxes) {
      if (B.fixed) continue
      B.x = Math.min(bounds.r - B.w / 2, Math.max(bounds.l + B.w / 2, B.x))
      B.y = Math.min(bounds.b - B.h / 2, Math.max(bounds.t + B.h / 2, B.y))
    }
    if (!moved) break
  }
  void W; void H
}

/** Relax, then drop the least relevant word from any pair that still collides. Returns which boxes survive. */
function relaxPrune(boxes: Box[], W: number, H: number, bounds: { l: number; r: number; t: number; b: number }, priority: number[]): boolean[] {
  const alive = boxes.map(() => true)
  for (let round = 0; round < 24; round++) {
    const live = boxes.filter((_, i) => alive[i])
    relax(live, W, H, bounds)
    let victim = -1
    outer: for (let a = 0; a < boxes.length; a++) {
      if (!alive[a]) continue
      for (let b = a + 1; b < boxes.length; b++) {
        if (!alive[b]) continue
        const A = boxes[a], B = boxes[b]
        const ox = (A.w + B.w) / 2 + 8 - Math.abs(B.x - A.x), oy = (A.h + B.h) / 2 + 4 - Math.abs(B.y - A.y)
        if (ox > 0 && oy > 0) {
          victim = A.fixed ? b : B.fixed ? a : priority[a] < priority[b] ? a : b
          break outer
        }
      }
    }
    if (victim < 0) break
    alive[victim] = false
  }
  return alive
}

const rowsOf = (s: Space, hits: Hit[]) => hits.map((h) => s.vecs.subarray(h.i * s.dims, (h.i + 1) * s.dims) as Float32Array)

/** One word in the middle, its neighbours scattered around it: distance = dissimilarity, direction = what kind of neighbour. */
export function galaxyLayout(s: Space, center: string, hits: Hit[], W: number, H: number): { center: { size: number; w: number }; items: Placed[] } {
  const small = W < 640
  const cSize = small ? Math.min(64, W * 0.17) : Math.min(104, H * 0.13)
  const smax = hits[0].sim, smin = hits[hits.length - 1].sim
  const pc = pca2(rowsOf(s, hits))
  const rx = (small ? W * 0.38 : Math.min(W * 0.4, H * 0.62)), ry = (small ? H * 0.34 : H * 0.34)
  const r0 = small ? 0.38 : 0.3
  const boxes: Box[] = [{ x: 0, y: 0, w: center.length * cSize * charW + 40, h: cSize * 1.05, fixed: true }]
  const meta = hits.map((h, n) => {
    const t = (smax - h.sim) / (smax - smin + 1e-6)
    const size = (small ? 15 : 17) + (1 - t) * (small ? 9 : 15)
    const ang = Math.atan2(pc[n][1], pc[n][0])
    const rr = r0 + (1 - r0) * Math.pow(t, 0.85)
    boxes.push({ x: Math.cos(ang) * rx * rr, y: Math.sin(ang) * ry * rr, w: h.word.length * size * charW + size * 0.5 + 6, h: size * 1.35 })
    return { size, t }
  })
  const alive = relaxPrune(boxes, W, H, { l: -W / 2 + 14, r: W / 2 - 14, t: -H / 2 + 84, b: H / 2 - 190 }, [Infinity, ...hits.map((h) => h.sim)])
  return {
    center: { size: cSize, w: boxes[0].w },
    items: hits.flatMap((h, n) => (alive[n + 1] ? [{ word: h.word, i: h.i, x: boxes[n + 1].x, y: boxes[n + 1].y, size: meta[n].size, opacity: 0.55 + 0.45 * (1 - meta[n].t), sim: h.sim } as Placed] : [])),
  }
}

/** Two words at opposite ends; the words between them arranged along the line from one to the other. */
export function bridgeLayout(s: Space, a: number, b: number, hits: Hit[], W: number, H: number) {
  const vertical = W < 640
  const endSize = vertical ? Math.min(52, W * 0.14) : Math.min(84, H * 0.11)
  const axisHalf = vertical ? Math.max(120, H / 2 - 230) : Math.min(W * 0.34, 560)
  // position along the axis: 0 = like A, 1 = like B (blend of raw ratio and rank so words spread out)
  const raw = hits.map((h) => (h.simB ?? 0) / ((h.sim + (h.simB ?? 0)) || 1))
  const order = raw.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0])
  const rank = new Array(hits.length)
  order.forEach(([, i], r) => (rank[i] = (r + 0.5) / hits.length))
  const rmin = Math.min(...raw), rmax = Math.max(...raw)
  const tAxis = raw.map((v, i) => 0.5 * rank[i] + 0.5 * ((v - rmin) / (rmax - rmin + 1e-6)))
  // perpendicular position: first principal component of what's left after removing the A-to-B direction
  const dir = new Float32Array(s.dims)
  for (let j = 0; j < s.dims; j++) dir[j] = s.vecs[b * s.dims + j] - s.vecs[a * s.dims + j]
  const dn = Math.hypot(...dir) || 1
  const resid = rowsOf(s, hits).map((r) => { let p = 0; for (let j = 0; j < s.dims; j++) p += r[j] * dir[j] / dn; return Float32Array.from(r, (x, j) => x - p * dir[j] / dn) })
  const pc = pca2(resid).map((p) => p[0])
  const pmax = Math.max(...pc.map(Math.abs)) || 1
  const perpHalf = vertical ? W * 0.36 : Math.min(H * 0.3, 260)
  // how well a word fits BOTH ends (the weaker of its two similarities), normalised 0..1
  const fit = hits.map((h) => Math.min(h.sim, h.simB ?? 0))
  const fmin = Math.min(...fit), fmax = Math.max(...fit)
  const fitN = fit.map((f) => (f - fmin) / (fmax - fmin + 1e-6))
  const boxes: Box[] = hits.map((h, n) => {
    const size = (vertical ? 16 : 18) + fitN[n] * (vertical ? 9 : 14)
    const along = (tAxis[n] - 0.5) * 2 * axisHalf * 0.82, perp = (pc[n] / pmax) * perpHalf
    return { x: vertical ? perp : along, y: vertical ? along : perp, w: h.word.length * size * charW + size * 0.5 + 6, h: size * 1.35 }
  })
  const alive = relaxPrune(boxes, W, H, { l: -W / 2 + 14, r: W / 2 - 14, t: -H / 2 + 90, b: H / 2 - 200 }, fitN)
  return {
    endSize,
    vertical,
    ends: vertical ? [{ x: 0, y: -(axisHalf + 40) }, { x: 0, y: axisHalf + 40 }] : [{ x: -(axisHalf + endSize * 1.5), y: 0 }, { x: axisHalf + endSize * 1.5, y: 0 }],
    items: hits.flatMap((h, n): Placed[] => (alive[n] ? [{ word: h.word, i: h.i, x: boxes[n].x, y: boxes[n].y, size: boxes[n].h / 1.35, opacity: 0.55 + 0.45 * fitN[n], sim: h.sim, simB: h.simB }] : [])),
  }
}
