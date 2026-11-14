import { useEffect, useRef, useState } from 'react'
import { PROCESSING_STAGES } from '../../data/infrastructure.js'
import HopperMotion from './HopperMotion.jsx'
import SorterMotion from './SorterMotion.jsx'
import './infraprocess.css'

/*
  The production line (stations, magnifiers and labels on a flowing route), with
  the real Bühler machines at work on the stages the
  Bühler films cover: pre-cleaner, destoner, the TopHusk huller with its hull
  separator, and the paddy separator. They are cut out of the films with the
  backdrop removed and loop as animated WebP (public/assets/infrastructure/
  machines/working). Each is drawn well below its source size so it stays sharp.
  The other stages keep their illustrations.

  The machines only animate while the line is on screen; with reduced motion
  the still frames show.
*/

const VB = { w: 1200, h: 1155 }
const ROWS = [190, 475, 760, 1045] // row floor lines (more space between rows for the route's climbs)
const R = (ROWS[1] - ROWS[0]) / 2 // U-turn radius
const LEFT = 150
const RIGHT = 1040

// Where each stage sits: [x on the belt, row] — 4, 3 and 4 stations (the last is the
// lorry), then the road to the home on a row of its own.
const SPOTS = [
  [200, 0], [450, 0], [700, 0], [960, 0],
  [930, 1], [640, 1], [350, 1],
  [225, 2], [455, 2], [695, 2], [1000, 2],
  [420, 3],
]

const ILLU = '/assets/infrastructure/machines/'
const WORK = '/assets/infrastructure/machines/working/'

// The machine(s) at each stage: file, width ÷ height and drawn height (viewBox units).
// `work` = a working Bühler machine (animated); otherwise the site's illustration.
const MACHINES = [
  [{ file: 'raw-paddy-hopper-white', ratio: 342 / 440, h: 136, motion: true }], // paddy hopper with its bucket elevator (HopperMotion over it)
  [{ file: 'pre-cleaner', ratio: 572 / 338, h: 96, work: true, name: 'MTRA / MVSF separator' }],
  [{ file: 'destoner', ratio: 434 / 450, h: 140, work: true, name: 'Gravity destoner' }],
  [
    { file: 'huller', ratio: 274 / 394, h: 132, work: true, name: 'TopHusk huller' },
    { file: 'husk-separator', ratio: 357 / 310, h: 92, work: true, name: 'TopHusk hull separator' },
  ],
  [{ file: 'paddy-separator', ratio: 354 / 340, h: 124, work: true, name: 'Paddy separator' }],
  [{ file: 'whitener-white', ratio: 330 / 440, h: 134 }], // rice whitener / polisher
  [{ file: 'grader-white', ratio: 471 / 440, h: 124 }], // rotary sieve grader
  [{ file: 'colour-sorter-white', ratio: 380 / 440, h: 134, sorter: true }], // optical colour sorter (SorterMotion over it)
  [{ file: 'quality-lab-white', ratio: 502 / 440, h: 122 }], // rice analysis workstation
  [{ file: 'packing-machine-white', ratio: 346 / 440, h: 140 }], // bags ride its conveyor (see routes)
  [{ file: 'lorry', ratio: 1432 / 1016, h: 168, lorry: true }], // dispatch: bags go up a ramp into its open back
  [{ file: 'home', ratio: 746 / 420, h: 164, home: true, span: 1.15 }], // home delivery: the truck stands before the house
]

// The home delivery scene, as fractions of the house picture: the delivery truck
// parked in front of it (cab towards the door, as it drove in from the right) and
// two bags already on the steps. `span` above = how far the scene reaches past the
// house's right edge, for the magnifier.
const TRUCK_RATIO = 482 / 360
const HOME = {
  truck: { x: 0.66, bottom: 1.04, h: 0.64 }, // left edge, base and height (of the house's height)
  bags: [[0.505, 0.935], [0.565, 0.935]], // [x, base] of each bag on the steps
  bag: [0.05, 0.13], // a bag's size: of the house's width, of its height
  front: { file: 'kitchidi-ponni-rice', x: 0.565, base: 1.0, h: 0.2 }, // the red Kitchidi Ponni bag on the ground before the steps
}
/** The bag before the house, in the house's units: { x, y, w, h }. */
const frontBag = (house) => {
  const h = HOME.front.h * house.h
  return { x: house.x + HOME.front.x * house.w, y: house.y + HOME.front.base * house.h - h, w: h * (85 / 120), h }
}
// the stations with a part of their own in the route
const PACK_AT = MACHINES.findIndex((ms) => ms[0].file === 'packing-machine-white')
const LORRY_AT = MACHINES.findIndex((ms) => ms[0].lorry)
const HOME_AT = MACHINES.findIndex((ms) => ms[0].home)

const truckBox = (house) => {
  const h = HOME.truck.h * house.h
  return { x: house.x + HOME.truck.x * house.w, y: house.y + HOME.truck.bottom * house.h - h, w: h * TRUCK_RATIO, h }
}

// Inside the lorry, as fractions of its picture: the open back (between the doors),
// where the ramp meets the sill, and the bags stacked on its floor
// [x, y of the bag's base, delay slot] — slot 0 is always there, slots 1-3 fill up in turn.
const LORRY = {
  sill: [0.118, 0.668],
  inside: [0.2, 0.645],
  bag: [0.064, 0.125], // a stacked bag's size, as fractions of the lorry's width and height
  stack: [
    [0.114, 0.64, 0], [0.169, 0.636, 0], [0.222, 0.632, 0],
    [0.121, 0.525, 0], [0.175, 0.521, 0], [0.226, 0.517, 0],
    [0.128, 0.41, 1], [0.18, 0.406, 2], [0.229, 0.402, 3],
  ],
}
const GAP = 22 // between two machines at one station (the route rises in it)

// Where the grain goes in and comes out of each machine, as fractions of its
// picture (read off the images), with the direction it travels there.
const DOWN = [0, 1]
const IO = {
  'raw-paddy-hopper-white': { in: [0.42, 0.15], out: [0.95, 0.1], outDir: [1, 0] }, // into the hopper, out of the elevator head
  'pre-cleaner': { in: [0.07, 0.03], out: [0.9, 0.98] },
  destoner: { in: [0.22, 0.01], out: [0.86, 0.98] },
  huller: { in: [0.27, 0.03], out: [0.37, 0.99] },
  'husk-separator': { in: [0.25, 0.08], out: [0.72, 0.99] },
  'paddy-separator': { in: [0.5, 0.04], out: [0.5, 0.97] },
  'whitener-white': { in: [0.36, 0.02], out: [0.06, 0.66] }, // into the hopper, out of the discharge chute
  'grader-white': { in: [0.17, 0.02], out: [0.52, 0.76] }, // into the hopper, out of a sieve chute
  'colour-sorter-white': { in: [0.5, 0.02], out: [0.42, 0.9] }, // into the hopper, out of the chutes
  'quality-lab-white': { in: [0.02, 0.43], inDir: [1, 0], out: [0.99, 0.66], outDir: [1, 0] }, // in over the counter, out low on its right (under the magnifier)
  'packing-machine-white': { in: [0.56, 0.05], out: [0.45, 0.66] }, // into the hopper; bags out of the filling spout
}

/** Each machine in line order with its inlet and outlet in viewBox units. */
function stationsInOrder() {
  const list = []
  SPOTS.forEach(([, row], i) => {
    const items = layout(i)
    const right = items[items.length - 1]
    const magRight = right.x + right.w + 26 + 30 // the magnifier's right edge
    items.forEach(({ m, x, w, h }, k) => {
      if (m.lorry || m.home) return // the runs into the lorry and to the home are laid separately
      const io = IO[m.file]
      const top = ROWS[row] - 2 - h
      const at = ([fx, fy]) => [x + fx * w, top + fy * h]
      list.push({
        row, inP: at(io.in), outP: at(io.out), inDir: io.inDir || DOWN, outDir: io.outDir || DOWN,
        left: x, magRight,
        // the second machine at a station: rise in the gap between the two
        riser: k > 0 ? x - GAP / 2 : undefined,
      })
    })
  })
  return list
}

/** A path through the points with rounded corners (radius per point, default 14). */
function rounded(pts) {
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [p0, p1, p2] = [pts[i - 1], pts[i], pts[i + 1]]
    const l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    const l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    const r = Math.min(p1[2] || 14, l1 / 2, l2 / 2)
    const a = [p1[0] + ((p0[0] - p1[0]) / l1) * r, p1[1] + ((p0[1] - p1[1]) / l1) * r]
    const b = [p1[0] + ((p2[0] - p1[0]) / l2) * r, p1[1] + ((p2[1] - p1[1]) / l2) * r]
    d += ` L ${a[0].toFixed(1)} ${a[1].toFixed(1)} Q ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`
  }
  const e = pts[pts.length - 1]
  return `${d} L ${e[0].toFixed(1)} ${e[1].toFixed(1)}`
}

/**
 * The grain's route, laid like mill pipework: from each machine's outlet down to
 * the floor, along it, up just before the next machine (clear of its magnifier),
 * over and down into its inlet — so it goes into each machine and comes out of
 * it. Turns at the ends of the rows are wide curves. Returns [{ d, len }].
 */
function routes() {
  const st = stationsInOrder()
  const floor = (row) => ROWS[row] + 4
  const dirOf = (row) => (row === 1 ? -1 : 1) // rows 0 and 2 run left to right, row 1 back
  const runs = []

  // where to rise before a machine: beside it on the side the grain comes from,
  // outside the magnifier when that sits on that side
  const riserX = (b, d) => (d > 0 ? b.left - 16 : b.magRight + 14)
  // into an inlet: from above, or from the side for a side inlet
  const into = (b, d, from) => {
    if (b.inDir[0]) {
      const sx = b.inP[0] - b.inDir[0] * 18
      return [[sx, from[1]], [sx, b.inP[1]], b.inP]
    }
    const top = b.inP[1] - 14
    if (from[1] <= top + 1) return [[b.inP[0], from[1]], b.inP] // already above it: across and down
    const rx = b.riser ?? riserX(b, d)
    return [[rx, from[1]], [rx, top], [b.inP[0], top], b.inP]
  }

  // Paddy in → the hopper
  runs.push([[20, floor(0)], ...into(st[0], 1, [20, floor(0)])])

  for (let k = 0; k < st.length - 1; k++) {
    const a = st[k]
    const b = st[k + 1]
    const d = dirOf(b.row)
    const pts = [a.outP]
    let at
    if (a.outDir[0]) {
      at = [a.outP[0] + a.outDir[0] * 12, a.outP[1]]
    } else {
      at = [a.outP[0], floor(a.row)]
    }
    pts.push(at)
    if (b.row !== a.row) {
      // round the end of the row with a wide curve
      const xEdge = a.row === 0 ? RIGHT + R * 0.92 : LEFT - R * 0.98
      pts.push([xEdge, floor(a.row), 70], [xEdge, floor(b.row), 70])
      at = [xEdge, floor(b.row)]
    }
    pts.push(...into(b, d, at))
    runs.push(pts)
  }

  // the packing machine's outlet → along its conveyor, down, across and up the
  // loading ramp into the lorry's open back
  const last = st[st.length - 1]
  // the belt's top surface runs from under the machine down to its front end
  const pk = layout(PACK_AT)[0]
  const pkTop = ROWS[2] - 2 - pk.h
  const belt = (fx, fy) => [pk.x + fx * pk.w, pkTop + fy * pk.h]
  const [b0, b1] = [belt(0.42, 0.735), belt(0.09, 0.81)]
  const lz = lorryBox()
  const sill = [lz.x + LORRY.sill[0] * lz.w, lz.y + LORRY.sill[1] * lz.h]
  const inside = [lz.x + LORRY.inside[0] * lz.w, lz.y + LORRY.inside[1] * lz.h]
  const foot = sill[0] - 80 // the ramp's foot, clear of the packing machine's magnifier
  runs.push([
    last.outP, b0, [b1[0], b1[1], 6], [b1[0] - 12, b1[1] + 6, 8], [b1[0] - 12, floor(2), 12],
    [foot, floor(2), 16], [sill[0] - 4, sill[1], 10], inside,
  ])

  return runs.map((pts) => {
    let len = 0
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    return { d: rounded(pts), len }
  })
}

// What happens there, drawn inside the magnifier (centred on 0,0, about 40 across).
const ICONS = [
  <g key="i1">{[[-10, -6, -30], [4, -10, 20], [10, 6, -10], [-6, 8, 40]].map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx="7" ry="3.4" transform={`rotate(${r} ${x} ${y})`} className="ip-ink-gold" />)}</g>,
  <g key="i2"><rect x="-16" y="-10" width="32" height="10" rx="2" className="ip-ink-line" />{[-10, -4, 2, 8].map((x) => <circle key={x} cx={x} cy="8" r="1.8" className="ip-ink-gold" />)}<path d="M-16 -10 L16 -10" className="ip-ink-red" /></g>,
  <g key="i3"><path d="M-16 -12 L16 4" className="ip-ink-line" /><circle cx="-6" cy="10" r="4" className="ip-ink-dark" /><circle cx="6" cy="14" r="3" className="ip-ink-dark" /><path d="M2 -8 l0 8 m-3 -3 l3 3 l3 -3" className="ip-ink-red" /></g>,
  <g key="i4"><circle cx="-8" cy="2" r="9" className="ip-ink-line" /><circle cx="10" cy="2" r="9" className="ip-ink-line" /><path d="M-8 -4 a6 6 0 1 1 -1 0 M10 -4 a6 6 0 1 0 1 0" className="ip-ink-red" /><ellipse cx="1" cy="-14" rx="5" ry="2.4" className="ip-ink-gold" /></g>,
  <g key="i5"><path d="M0 -14 V0 M0 0 L-12 12 M0 0 L12 12 M-12 12 l0 -6 m0 6 l6 0 M12 12 l0 -6 m0 6 l-6 0" className="ip-ink-red" /></g>,
  <g key="i6"><ellipse cx="0" cy="2" rx="12" ry="6" className="ip-ink-white" /><path d="M10 -14 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" className="ip-ink-gold" /></g>,
  <g key="i7"><rect x="-16" y="4" width="8" height="10" className="ip-ink-gold" /><rect x="-4" y="-2" width="8" height="16" className="ip-ink-gold" /><rect x="8" y="-10" width="8" height="24" className="ip-ink-red-fill" /></g>,
  <g key="i8"><path d="M-16 -4 Q0 -18 16 -4 Q0 10 -16 -4 Z" className="ip-ink-line" /><circle cx="0" cy="-4" r="4" className="ip-ink-red-fill" /><path d="M0 2 V16" className="ip-ink-red ip-beam" /></g>,
  <g key="i9"><circle cx="0" cy="0" r="14" className="ip-ink-line" /><path d="M-7 0 l5 5 l10 -11" className="ip-ink-red" /></g>,
  <g key="i10"><path d="M-11 -12 h22 l3 26 h-28 z" className="ip-ink-red-fill" /><circle cx="0" cy="2" r="5" className="ip-ink-white" /><path d="M-5 -12 v-4 h10 v4" className="ip-ink-line" /></g>,
  <g key="i11"><rect x="-17" y="-10" width="21" height="16" rx="1.5" className="ip-ink-red-fill" /><path d="M4 -4 h7 l5 6 v4 h-12 z" className="ip-ink-line" /><circle cx="-10" cy="9" r="3.6" className="ip-ink-dark" /><circle cx="9" cy="9" r="3.6" className="ip-ink-dark" /></g>,
  <g key="i12"><path d="M-16 -1 L0 -15 L16 -1" className="ip-ink-red" /><rect x="-12" y="-3" width="24" height="17" className="ip-ink-line" /><rect x="-3" y="4" width="6" height="10" className="ip-ink-red-fill" /></g>,
]

const src = (m, play) => (m.work ? `${WORK}${m.file}${play ? '' : '-still'}.webp` : `${ILLU}${m.file}.webp`)

/**
 * The road from the lorry to the home: off along the floor past the lorry's cab,
 * round the end of the row and back along the last row to the house.
 * Returns { d, len, turn } — `turn` = how far along (0-1) it starts heading left.
 */
function roadRoute() {
  const lz = lorryBox()
  const hm = layout(HOME_AT)[0]
  const house = { x: hm.x, y: ROWS[3] - 12 - hm.h + 10, w: hm.w, h: hm.h }
  const tk = truckBox(house)
  const y2 = ROWS[2] + 4
  const y3 = ROWS[3] + 4
  const xEdge = RIGHT + R * 0.92
  const pts = [[lz.x + lz.w * 0.86, y2], [xEdge, y2, 70], [xEdge, y3, 70], [tk.x + tk.w + 8, y3]]
  const seg = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])
  const len = seg(pts[0], pts[1]) + seg(pts[1], pts[2]) + seg(pts[2], pts[3])
  return { d: rounded(pts), len, turn: (seg(pts[0], pts[1]) + seg(pts[1], pts[2]) / 2) / len }
}

/** The lorry's picture in viewBox units: { x, y, w, h }. */
function lorryBox() {
  const i = LORRY_AT
  const { x, w, h } = layout(i)[0]
  return { x, y: ROWS[SPOTS[i][1]] - 12 - h + 10, w, h }
}

/** The machines at one station laid out side by side, centred on the station: [{ m, x, w, h }]. */
function layout(i) {
  const ms = MACHINES[i]
  const ws = ms.map((m) => m.h * m.ratio)
  const total = ws.reduce((a, b) => a + b, 0) + GAP * (ms.length - 1)
  let x = SPOTS[i][0] - total / 2
  return ms.map((m, k) => {
    const item = { m, x, w: ws[k], h: m.h }
    x += ws[k] + GAP
    return item
  })
}

function useLive(ref) {
  const [live, setLive] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting), { rootMargin: '200px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return live
}

const RUNS = routes()
const ROAD = roadRoute()

// The bags' run into the lorry: how long one bag takes and how many ride at once
// (the stack inside fills in step with them arriving).
const BAG_RUN = (() => {
  const r = RUNS[RUNS.length - 1]
  const dur = (r.len / 34) * 1.6
  const n = Math.max(3, Math.round(r.len / 74)) // spaced for the larger bags
  return { dur, n, every: dur / n }
})()

// What travels on each run, in order (runs: Paddy in -> hopper, then each machine's
// outlet -> the next inlet, then packing -> dispatch). Cycled grain by grain.
// 'morph' = semi-polished turning polished along the run.
const CARGO = [
  ['paddy', 'paddy', 'stone', 'paddy', 'straw', 'paddy'], // paddy in -> hopper
  ['paddy', 'paddy', 'straw', 'paddy', 'stone', 'paddy'], // hopper -> pre-cleaner
  ['paddy', 'paddy', 'paddy', 'stone', 'paddy'], // pre-cleaned: straw and dust gone
  ['paddy'], // destoned: stones gone
  ['brown', 'husk', 'brown', 'paddy', 'husk', 'brown'], // out of the huller
  ['brown', 'brown', 'paddy', 'brown'], // husk drawn off
  ['brown'], // un-husked paddy sent back
  ['morph'], // whitening and polishing
  ['polished'], ['polished'], ['polished'], // grader -> colour sorter -> quality check -> packing
  ['bag'], // packed bags -> dispatch
]

// Phones: what travels down the belt after each stage (index = stage).
const LIST_CARGO = [
  ['paddy', 'paddy', 'stone', 'paddy', 'straw'], // raw paddy
  ['paddy', 'paddy', 'paddy', 'stone'], // pre-cleaned
  ['paddy'], // destoned
  ['brown', 'husk', 'brown', 'paddy'], // husked
  ['brown'], // separated
  ['morph'], // whitened and polished
  ['polished'], ['polished'], ['polished'], // graded, sorted, checked
  ['bag'], // packed -> the lorry
  [], // dispatched: the truck takes it from here
  [], // delivered home: the end of the line
]

/** One grain drawn along +x (the direction of travel), about 16 units long. */
const GRAIN = {
  paddy: (
    <g>
      <path d="M -8 0 Q -5 -3.9 1 -3.8 Q 6.6 -3.2 8 0 Q 6.6 3.2 1 3.8 Q -5 3.9 -8 0 Z" fill="url(#ipl-paddy)" stroke="#a86a12" strokeWidth="0.5" />
      <path d="M -6 -1.4 Q 0 -2.6 6.4 -1.2 M -6.2 1.3 Q 0 2.5 6.4 1.1 M -7 0 H 7.4" fill="none" stroke="#b9781b" strokeWidth="0.45" opacity="0.8" />
    </g>
  ),
  brown: (
    <g>
      <path d="M -7.2 0 Q -5 -3.3 0.5 -3.3 Q 6 -3 7.2 0 Q 6 3 0.5 3.3 Q -5 3.3 -7.2 0 Z" fill="url(#ipl-brown)" stroke="#b07a3e" strokeWidth="0.45" />
      <path d="M -5.6 -1 Q 0 -1.9 5.8 -0.9" fill="none" stroke="#c48c4c" strokeWidth="0.4" opacity="0.7" />
    </g>
  ),
  semi: <path d="M -7 0 Q -5 -3.2 0.5 -3.2 Q 6 -2.9 7 0 Q 6 2.9 0.5 3.2 Q -5 3.2 -7 0 Z" fill="url(#ipl-semi)" stroke="#cdb780" strokeWidth="0.45" />,
  polished: (
    <g>
      <path d="M -7 0 Q -5 -3.2 0.5 -3.2 Q 6 -2.9 7 0 Q 6 2.9 0.5 3.2 Q -5 3.2 -7 0 Z" fill="url(#ipl-polished)" stroke="#c9c6bd" strokeWidth="0.45" />
      <path d="M -3.5 -1.6 Q 0.5 -2.4 4 -1.5" fill="none" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" opacity="0.9" />
    </g>
  ),
  husk: <path d="M -6 1.5 Q -1 -3.5 6 -1 Q 1 -1.6 -6 1.5 Z" fill="#c8913c" stroke="#9a6418" strokeWidth="0.4" />,
  stone: <path d="M -3.4 -0.6 Q -2.4 -3.2 0.6 -3 Q 3.6 -2.4 3.4 0.4 Q 3 3 0 3 Q -3.2 2.8 -3.4 -0.6 Z" transform="scale(0.52)" fill="#6b625c" stroke="#3f3834" strokeWidth="0.55" />,
  straw: <path d="M -7 0.6 L 7 -0.6" stroke="#d8b765" strokeWidth="1.3" strokeLinecap="round" />,
}

// Miniature packs carried off to dispatch (small copies of the shop's pack photos).
const BAGS = ['kitchidi-ponni-rice', 'special-idly-rice', 'alibaba', 'vintage', 'nayara-super-aged']

/** A packed bag riding to the lorry: kept upright, its base on the track; it fades as it goes in. */
function Bag({ file, d, dur, begin }) {
  const timing = { dur: `${dur.toFixed(2)}s`, begin: `${begin.toFixed(2)}s`, repeatCount: 'indefinite' }
  return (
    <g className="ipl-bag">
      <image href={`/assets/infrastructure/machines/bags/${file}.webp`} x="-10" y="-28" width="20" height="28" />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.06;0.95;1" {...timing} />
      <animateMotion {...timing} path={d} />
    </g>
  )
}

/**
 * The bags stacked in the lorry, drawn over its open back. The lower rows are
 * always there; the top row fills one bag per arrival, then starts again.
 * `every` = seconds between arrivals (0: show them all, still).
 */
function LorryLoad({ box, every, begin = 0 }) {
  const [bw, bh] = [LORRY.bag[0] * box.w, LORRY.bag[1] * box.h]
  const cycle = every * 4
  return (
    <g className="ipl-load">
      {LORRY.stack.map(([fx, fy, slot], k) => {
        const x = box.x + fx * box.w
        const y = box.y + fy * box.h - bh
        const at = slot / 4
        return (
          <g key={k} opacity={every && slot ? 0 : 1}>
            <image href={`/assets/infrastructure/machines/bags/${BAGS[(k * 2) % BAGS.length]}.webp`} x={x} y={y} width={bw} height={bh} />
            {every > 0 && slot > 0 && (
              <animate attributeName="opacity" values="0;0;1;1;0" keyTimes={`0;${at};${at + 0.02};0.97;1`}
                dur={`${cycle.toFixed(2)}s`} begin={`${begin.toFixed(2)}s`} repeatCount="indefinite" />
            )}
          </g>
        )
      })}
    </g>
  )
}

/**
 * A delivery truck driving the road to the home, kept upright: facing right while
 * it heads right, then (from `turn`) the mirrored picture as it heads left along
 * the last row. It fades in at the lorry and out as it pulls up at the house.
 */
function DrivingTruck({ d, dur, begin, turn }) {
  const timing = { dur: `${dur.toFixed(2)}s`, begin: `${begin.toFixed(2)}s`, repeatCount: 'indefinite' }
  const [h, w] = [40, 40 * TRUCK_RATIO]
  const t = turn.toFixed(3)
  const t2 = (turn + 0.005).toFixed(3)
  return (
    <g className="ipl-truck">
      <g>
        <image href={`${ILLU}delivery-truck.webp`} x={-w / 2} y={-h + 3} width={w} height={h} />
        <animate attributeName="opacity" values="1;1;0;0" keyTimes={`0;${t};${t2};1`} calcMode="discrete" {...timing} />
      </g>
      <g opacity="0">
        <image href={`${ILLU}delivery-truck-left.webp`} x={-w / 2} y={-h + 3} width={w} height={h} />
        <animate attributeName="opacity" values="0;0;1;1" keyTimes={`0;${t};${t2};1`} calcMode="discrete" {...timing} />
      </g>
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.04;0.93;1" {...timing} />
      <animateMotion {...timing} path={d} />
    </g>
  )
}

/** The delivery truck parked before the house, with bags left on the steps. */
function HomeScene({ house }) {
  const tk = truckBox(house)
  const [bw, bh] = [HOME.bag[0] * house.w, HOME.bag[1] * house.h]
  return (
    <g className="ipl-home">
      {HOME.bags.map(([fx, fy], k) => (
        <image key={k} href={`/assets/infrastructure/machines/bags/${BAGS[k]}.webp`}
          x={house.x + fx * house.w} y={house.y + fy * house.h - bh} width={bw} height={bh} />
      ))}
      {(() => {
        const fb = frontBag(house)
        return (
          <>
            <ellipse cx={fb.x + fb.w / 2} cy={fb.y + fb.h - 1} rx={fb.w * 0.7} ry="3" fill="url(#ipl-floor)" />
            <image href={`/assets/infrastructure/machines/bags/${HOME.front.file}.webp`} x={fb.x} y={fb.y} width={fb.w} height={fb.h} className="ipl-frontbag" />
          </>
        )
      })()}
      <ellipse cx={tk.x + tk.w * 0.55} cy={tk.y + tk.h - 2} rx={tk.w * 0.5} ry="6" fill="url(#ipl-floor)" />
      <image href={`${ILLU}delivery-truck-left.webp`} x={tk.x} y={tk.y} width={tk.w} height={tk.h} className="ip-photo" />
    </g>
  )
}

/** Phones: the house with the truck parked before it, laid out as on the desktop line. */
function HomePicture({ alt }) {
  const house = { x: 0, y: 0, w: MACHINES[HOME_AT][0].ratio, h: 1 } // in house heights
  const tk = truckBox(house)
  const W = Math.max(house.w, tk.x + tk.w)
  const H = Math.max(1, tk.y + tk.h)
  const box = (b) => ({ left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%`, width: `${(b.w / W) * 100}%`, height: `${(b.h / H) * 100}%` })
  const [bw, bh] = [HOME.bag[0] * house.w, HOME.bag[1]]
  return (
    <span className="ipl-lorry ipl-homepic" role="img" aria-label={alt} style={{ aspectRatio: `${W / H}` }}>
      <span className="ipl-lorry-bag" style={{ ...box(house), backgroundImage: `url(${ILLU}home.webp)` }} />
      {HOME.bags.map(([fx, fy], k) => (
        <span key={k} className="ipl-lorry-bag" style={{ ...box({ x: fx * house.w, y: fy - bh, w: bw, h: bh }), backgroundImage: `url(/assets/infrastructure/machines/bags/${BAGS[k]}.webp)` }} />
      ))}
      <span className="ipl-lorry-bag" style={{ ...box(frontBag(house)), backgroundImage: `url(/assets/infrastructure/machines/bags/${HOME.front.file}.webp)` }} />
      <span className="ipl-lorry-bag" style={{ ...box(tk), backgroundImage: `url(${ILLU}delivery-truck-left.webp)` }} />
    </span>
  )
}

/** Phones: the lorry with its bags inside, as an image with the bags laid over it. */
function LorryPicture({ alt }) {
  const [bw, bh] = LORRY.bag
  return (
    <span className="ipl-lorry" style={{ aspectRatio: `${MACHINES[LORRY_AT][0].ratio}` }}>
      <img src={`${ILLU}lorry.webp`} alt={alt} loading="lazy" decoding="async" />
      {LORRY.stack.map(([fx, fy], k) => (
        <span key={k} className="ipl-lorry-bag" aria-hidden="true"
          style={{
            left: `${fx * 100}%`, top: `${(fy - bh) * 100}%`, width: `${bw * 100}%`, height: `${bh * 100}%`,
            backgroundImage: `url(/assets/infrastructure/machines/bags/${BAGS[(k * 2) % BAGS.length]}.webp)`,
          }} />
      ))}
    </span>
  )
}

/** A grain on its way: the cargo kind, its motion, and for 'morph' the cross-fade. */
function Grain({ kind, d, dur, begin }) {
  const timing = { dur: `${dur.toFixed(2)}s`, begin: `${begin.toFixed(2)}s`, repeatCount: 'indefinite' }
  return (
    <g className="ipl-grain">
      <g transform="scale(1.3)">
      {kind === 'morph' ? (
        <>
          <g>{GRAIN.semi}<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.3;0.7;1" {...timing} /></g>
          <g opacity="0">{GRAIN.polished}<animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.3;0.7;1" {...timing} /></g>
        </>
      ) : GRAIN[kind]}
      </g>
      <animateMotion {...timing} rotate="auto" path={d} />
    </g>
  )
}

export default function InfraLine() {
  const ref = useRef(null)
  const play = useLive(ref)
  const [hover, setHover] = useState(-1) // desktop: the station under the pointer (or focused)
  const [open, setOpen] = useState(-1) // phones: the stage tapped open (one at a time)

  // phones: each stage's belt length, so the grain runs its whole stretch
  const listRef = useRef(null)
  useEffect(() => {
    const ol = listRef.current
    if (!ol) return undefined
    const set = () => ol.querySelectorAll('li').forEach((li) => li.style.setProperty('--ipl-run', `${Math.max(60, li.offsetHeight - 14)}px`))
    set()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null
    ro?.observe(ol)
    return () => ro?.disconnect()
  }, [open])

  return (
    <section className="ip ipl" aria-labelledby="ipl-title" ref={ref}>
      <div className="container ip-inner">
        <p className="ip-eyebrow">World Class Infrastructure</p>
        <h2 id="ipl-title" className="ip-title">Technology. Quality. Capacity.</h2>
        <p className="ip-sub">Twelve stages on one line at our Nasiyanur, Erode mill — every grain cleaned, milled, sorted and checked before it is packed, dispatched and delivered to your home. Cleaning, destoning, husking and separation run on Bühler machines, shown here at work.</p>

        {/* grain colours, shared by the key and the line; outside the drawing so they
            still apply on phones, where the drawing is hidden */}
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            <linearGradient id="ipl-paddy" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f4c14e" /><stop offset="0.6" stopColor="#e09a26" /><stop offset="1" stopColor="#c07914" />
            </linearGradient>
            <linearGradient id="ipl-brown" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f0cb94" /><stop offset="0.6" stopColor="#d9a86a" /><stop offset="1" stopColor="#bf8a4c" />
            </linearGradient>
            <linearGradient id="ipl-semi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbf3dc" /><stop offset="0.6" stopColor="#efe2bd" /><stop offset="1" stopColor="#dccb9a" />
            </linearGradient>
            <linearGradient id="ipl-polished" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" /><stop offset="0.65" stopColor="#f3f2ee" /><stop offset="1" stopColor="#d9d7d0" />
            </linearGradient>
          </defs>
        </svg>

        {/* what the grain looks like as it goes: paddy -> brown -> semi-polished -> polished */}
        <ol className="ipl-key" aria-label="How the grain changes along the line">
          {[['paddy', 'Paddy'], ['brown', 'Brown rice'], ['semi', 'Semi-polished'], ['polished', 'Polished rice']].map(([k, label], i) => (
            <li key={k}>
              {i > 0 && <span className="ipl-key-arrow" aria-hidden="true">›</span>}
              <svg viewBox="-10 -6 20 12" width="44" height="26" aria-hidden="true">{GRAIN[k]}</svg>
              <span>{label}</span>
            </li>
          ))}
        </ol>

        <div className="ip-stage">
          <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="ip-svg" role="presentation" aria-hidden="true">
            {/* The grain's route: out of each machine's outlet and into the next one's inlet —
                a soft cream track with a fine gold line, flowing gold dots and gliding arrowheads. */}
            <defs>
              <linearGradient id="ipl-gold" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#d9b25c" />
                <stop offset="0.5" stopColor="#b8862b" />
                <stop offset="1" stopColor="#d9b25c" />
              </linearGradient>
              <radialGradient id="ipl-floor">
                <stop offset="0" stopColor="#5a3c28" stopOpacity="0.22" />
                <stop offset="1" stopColor="#5a3c28" stopOpacity="0" />
              </radialGradient>
            </defs>
            {RUNS.map((r, k) => {
              const dur = r.len / 34
              const cargo = CARGO[k] || ['polished']
              const g = Math.max(2, Math.round(r.len / 34))
              return (
              <g key={k}>
                <path d={r.d} className="ipl-track" />
                <path d={r.d} className="ipl-line" />
                {/* the grain itself travelling, changing from stage to stage */}
                {cargo[0] !== 'bag' && Array.from({ length: g }, (_, j) => (
                  <Grain key={`g${j}`} kind={cargo[j % cargo.length]} d={r.d} dur={dur} begin={-(j * dur) / g - (0.37 * dur) / g} />
                ))}
              </g>
              )
            })}
            {/* the road from the lorry to the home, with delivery trucks driving it */}
            <path d={ROAD.d} className="ipl-road" />
            <path d={ROAD.d} className="ipl-road-line" />
            <circle cx="20" cy={ROWS[0] + 4} r="7" className="ipl-start" />

            {SPOTS.map(([x, row], i) => {
              const y = ROWS[row] - 12
              const items = layout(i)
              const right = items[items.length - 1]
              const top = Math.max(...items.map((it) => it.h))
              const mx = right.x + right.w * (right.m.span || 1) + 26
              const my = y - top * 0.62
              const lead = items[0]
              return (
                <g key={i} className={`ip-station${hover === i ? ' is-hover' : ''}`} style={{ animationDelay: `${i * 1.2}s` }}>
                  <ellipse cx={(items[0].x + right.x + right.w) / 2} cy={ROWS[row] - 1} rx={(right.x + right.w - items[0].x) / 2 + 14} ry="9" fill="url(#ipl-floor)" />
                  {/* Illustrations are drawn here; the working machines are <img> elements over the
                      drawing (below), since browsers do not animate an animated image inside SVG. */}
                  {items.filter(({ m }) => !m.work).map(({ m, x: ix, w, h }) => (
                    <g key={m.file}>
                      <image href={src(m, play)} x={ix} y={y - h + 10} width={w} height={h} className="ip-photo" />
                      {m.sorter && play && <SorterMotion href={src(m, play)} x={ix} y={y - h + 10} w={w} h={h} />}
                      {m.home && <HomeScene house={{ x: ix, y: y - h + 10, w, h }} />}
                      {m.lorry && (
                        <LorryLoad box={{ x: ix, y: y - h + 10, w, h }} every={play ? BAG_RUN.every : 0} begin={-0.03 * BAG_RUN.dur} />
                      )}
                    </g>
                  ))}
                  {/* (not across the lorry's painted side) */}
                  {!lead.m.lorry && !lead.m.home && <line className="ip-mag-line" x1={right.x + right.w * 0.7} y1={y - top * 0.45} x2={mx} y2={my} />}
                  <g transform={`translate(${mx} ${my})`}>
                    <circle r="30" className="ip-mag" />
                    {ICONS[i]}
                  </g>
                  <circle cx={lead.x + lead.w * 0.11 + 4} cy={ROWS[row] + 34} r="13" className="ip-num-bg" />
                  <text x={lead.x + lead.w * 0.11 + 4} y={ROWS[row] + 39} className="ip-num">{i + 1}</text>
                </g>
              )
            })}
            {/* packed bags: out of the filling spout, down the conveyor and up the ramp into
                the lorry — drawn over the machines so they show on the belt */}
            {Array.from({ length: BAG_RUN.n }, (_, j) => (
              <Bag key={`b${j}`} file={BAGS[j % BAGS.length]} d={RUNS[RUNS.length - 1].d} dur={BAG_RUN.dur} begin={-j * BAG_RUN.every} />
            ))}
            {play && [0, 1].map((j) => (
              <DrivingTruck key={`t${j}`} d={ROAD.d} dur={ROAD.len / 70} begin={(-j * ROAD.len) / 140} turn={ROAD.turn} />
            ))}
            <text x="24" y={ROWS[0] + 46} className="ip-endlabel">PADDY IN →</text>
          </svg>

          {/* the hopper's own motion, laid exactly over its picture */}
          {SPOTS.map(([, row], i) => layout(i).filter(({ m }) => m.motion).map(({ m, x: ix, w, h }) => (
            <HopperMotion
              key={`${m.file}-motion`}
              className={play ? 'is-live' : ''}
              style={{
                position: 'absolute',
                left: `${(ix / VB.w) * 100}%`,
                top: `${((ROWS[row] - 12 - h + 10) / VB.h) * 100}%`,
                width: `${(w / VB.w) * 100}%`,
                height: `${(h / VB.h) * 100}%`,
              }}
            />
          )))}

          {SPOTS.map(([, row], i) => layout(i).filter(({ m }) => m.work).map(({ m, x: ix, w, h }) => (
            <img
              key={m.file}
              className="ip-work"
              src={src(m, play)}
              alt={`${m.name} at work`}
              decoding="async"
              style={{
                left: `${(ix / VB.w) * 100}%`,
                top: `${((ROWS[row] - 12 - h + 10) / VB.h) * 100}%`,
                width: `${(w / VB.w) * 100}%`,
                height: `${(h / VB.h) * 100}%`,
              }}
            />
          )))}

          {/* hover areas over each station (machine, magnifier and name): the details show on hover or keyboard focus */}
          {SPOTS.map(([, row], i) => {
            const items = layout(i)
            const lead = items[0]
            const right = items[items.length - 1]
            const top = ROWS[row] - 2 - Math.max(...items.map((it) => it.h)) - 6
            const x0 = lead.x - 10
            const x1 = right.x + right.w * (right.m.span || 1) + 60
            return (
              <div
                key={`hit${i}`}
                className="ipl-hit"
                tabIndex={0}
                role="button"
                aria-label={`${PROCESSING_STAGES[i].title}: show details`}
                aria-expanded={hover === i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? -1 : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? -1 : h))}
                style={{
                  left: `${(x0 / VB.w) * 100}%`,
                  width: `${((x1 - x0) / VB.w) * 100}%`,
                  top: `${(top / VB.h) * 100}%`,
                  height: `${((ROWS[row] + 46 - top) / VB.h) * 100}%`,
                }}
              />
            )
          })}

          {SPOTS.map(([, row], i) => {
            const lead = layout(i)[0]
            const work = MACHINES[i].filter((m) => m.work)
            return (
              <div
                key={i}
                className={`ip-label${hover === i ? ' is-open' : ''}`}
                style={{ left: `${((lead.x + lead.w * 0.11 + 22) / VB.w) * 100}%`, top: `${((ROWS[row] + 22) / VB.h) * 100}%` }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? -1 : h))}
              >
                <strong>{PROCESSING_STAGES[i].title}</strong>
                <div className="ipl-more" aria-hidden={hover !== i}>
                  <span>{PROCESSING_STAGES[i].text}</span>
                  {work.length > 0 && <em className="ip-machine">{work.map((m) => m.name).join(' + ')}</em>}
                </div>
              </div>
            )
          })}
        </div>

        {/* phones: the same stages as a list on a belt, the working machines shown under their stage */}
        <ol className="ip-list ipl-list" ref={listRef}>
          {PROCESSING_STAGES.map((s, i) => {
            const ms = MACHINES[i]
            const named = ms.filter((m) => m.name)
            return (
              <li key={s.id} className={open === i ? 'is-open' : ''}>
                {/* this stage's stretch of the belt, with what leaves it flowing down */}
                {/* phones only: an arrow on the belt pointing to the next stage */}
                {i < PROCESSING_STAGES.length - 1 && (
                  <svg className="ipl-varrow" viewBox="0 0 16 12" width="16" height="12" aria-hidden="true">
                    <path d="M 2 2 L 8 9 L 14 2" />
                  </svg>
                )}
                <svg className="ipl-vbelt" viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden="true">
                  <line x1="10" y1="0" x2="10" y2="100" className="ipl-vbelt-track" />
                  <line x1="10" y1="0" x2="10" y2="100" className="ipl-vbelt-line" />
                </svg>
                {play && LIST_CARGO[i].length > 0 && (
                  <span className="ipl-vflow" aria-hidden="true">
                    {Array.from({ length: LIST_CARGO[i][0] === 'bag' ? 3 : 5 }, (_, j, ) => j).map((j, _, all) => {
                      const kind = LIST_CARGO[i][j % LIST_CARGO[i].length]
                      return (
                        <span key={j} className={`ipl-vg${kind === 'bag' ? ' is-bag' : ''}`} style={{ animationDelay: `${(-j * 2.4) / all.length}s` }}>
                          {kind === 'bag' ? (
                            <img src={`/assets/infrastructure/machines/bags/${BAGS[j % BAGS.length]}.webp`} alt="" />
                          ) : (
                            <svg viewBox="-10 -6 20 12" width="22" height="13">
                              <g transform="rotate(90)">{kind === 'morph' ? GRAIN.semi : GRAIN[kind]}</g>
                            </svg>
                          )}
                        </span>
                      )
                    })}
                  </span>
                )}
                <span className="ip-list-mag" aria-hidden="true">
                  <svg viewBox="-30 -30 60 60" width="56" height="56"><circle r="28" className="ip-mag" />{ICONS[i]}</svg>
                  <span className="ip-list-num">{i + 1}</span>
                </span>
                <span className="ip-list-text">
                  <button type="button" className="ipl-toggle" aria-expanded={open === i} onClick={() => setOpen((o) => (o === i ? -1 : i))}>
                    <strong>{s.title}</strong>
                    <span className="ipl-chev" aria-hidden="true" />
                  </button>
                  {/* the machine(s) at this stage, always shown; tapping the name adds the details */}
                  <span className="ip-list-machines">
                    {ms.map((m) => m.lorry ? <LorryPicture key={m.file} alt="Chennai Rice lorry loaded with bags" />
                      : m.home ? <HomePicture key={m.file} alt="A Chennai Rice delivery truck parked before a home" /> : (
                      <img key={m.file} src={src(m, play)} alt={m.name ? `${m.name} at work` : `${s.title} machine`} loading="lazy" decoding="async"
                        style={{ aspectRatio: `${m.ratio}` }} />
                    ))}
                  </span>
                  <span className="ipl-list-more" hidden={open !== i}>
                    <span>{s.text}</span>
                    {named.length > 0 && <em className="ip-machine">{named.map((m) => m.name).join(' + ')}</em>}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>

        <p className="ip-credit">Machine animations courtesy of Bühler.</p>
      </div>
    </section>
  )
}
