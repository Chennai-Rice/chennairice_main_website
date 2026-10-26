/*
  One isometric system for the whole infrastructure journey: 30° axes, the
  same line weight, flat fills. Every shape is placed by its FRONT-BOTTOM
  corner on screen (`at`), so machines line up on one ground line.
*/

export const C = {
  orange: '#F4511E',
  navy: '#17233D',
  gray: '#3F4652',
  light: '#E9EDF1',
  mid: '#D4DAE1',
  bg: '#F7F8FA',
  white: '#FFFFFF',
}

const K = 0.866 // cos 30°

/** Screen point of (x, y, z) from an origin (ox, oy): x runs down-right, y down-left, z up. */
export const iso = (ox, oy) => (x, y, z = 0) => [ox + (x - y) * K, oy + (x + y) * 0.5 - z]
export const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

/** Origin of a w × d box whose front-bottom corner sits at (ax, ay). */
const originFor = (ax, ay, w, d) => [ax - (w - d) * K, ay - (w + d) * 0.5]

/** Soft footprint shadow under a machine. */
export function Shadow({ at: [ax, ay], w, d, pad = 6 }) {
  const [ox, oy] = originFor(ax, ay, w, d)
  const p = iso(ox, oy)
  return <polygon className="ij-shadow" points={pts([p(-pad, -pad + 4), p(w + pad, -pad + 4), p(w + pad, d + pad + 4), p(-pad, d + pad + 4)])} />
}

/**
 * A box: top, left face (facing down-left) and right face (facing down-right).
 * `band` puts an orange stripe on the left face between two heights (0–1).
 */
export function Box({ at, w, d, h, tone = 'machine', band, shadow = true, children }) {
  const [ox, oy] = originFor(at[0], at[1], w, d)
  const p = iso(ox, oy)
  return (
    <g className={`ij-box ij-${tone}`}>
      {shadow && <Shadow at={at} w={w} d={d} />}
      <polygon className="ij-face-r" points={pts([p(w, 0), p(w, d), p(w, d, h), p(w, 0, h)])} />
      <polygon className="ij-face-l" points={pts([p(0, d), p(w, d), p(w, d, h), p(0, d, h)])} />
      <polygon className="ij-face-t" points={pts([p(0, 0, h), p(w, 0, h), p(w, d, h), p(0, d, h)])} />
      {band && <polygon className="ij-band" points={pts([p(0, d, h * band[0]), p(w, d, h * band[0]), p(w, d, h * band[1]), p(0, d, h * band[1])])} />}
      {typeof children === 'function' ? children(p, { w, d, h }) : children}
    </g>
  )
}

/** Text (or anything) painted on a box's left face: u along the face, v down from height z. */
export function OnLeftFace({ p, d, u = 0, z, children }) {
  const [x, y] = p(u, d, z)
  return <g transform={`matrix(${K} 0.5 0 1 ${x.toFixed(1)} ${y.toFixed(1)})`}>{children}</g>
}

/** An upright cylinder (silo, tank) standing with its bottom centre at (cx, cy). */
export function Cylinder({ at: [cx, cy], r, h, roof = 'flat', bands = [], water }) {
  const ry = r * 0.5
  const top = cy - h
  return (
    <g className="ij-cyl">
      <ellipse className="ij-shadow" cx={cx + 6} cy={cy + 4} rx={r + 6} ry={ry + 4} />
      <path className="ij-face-l" d={`M${cx - r} ${top} V${cy} A${r} ${ry} 0 0 0 ${cx + r} ${cy} V${top} Z`} />
      <path className="ij-face-r-soft" d={`M${cx + r * 0.25} ${top + ry * 0.97} V${cy + ry * 0.97} A${r} ${ry} 0 0 0 ${cx + r} ${cy} V${top} A${r} ${ry} 0 0 1 ${cx + r * 0.25} ${top + ry * 0.97} Z`} />
      {bands.map((f) => (
        <path key={f} className={f < 0 ? 'ij-band-line' : 'ij-ring'} d={`M${cx - r} ${cy - h * Math.abs(f)} A${r} ${ry} 0 0 0 ${cx + r} ${cy - h * Math.abs(f)}`} />
      ))}
      {roof === 'cone' ? (
        <>
          <ellipse className="ij-face-t" cx={cx} cy={top} rx={r} ry={ry} />
          <path className="ij-face-t" d={`M${cx - r} ${top} L${cx} ${top - r * 0.85} L${cx + r} ${top} A${r} ${ry} 0 0 1 ${cx - r} ${top} Z`} />
          <path className="ij-face-r-soft" d={`M${cx} ${top - r * 0.85} L${cx + r} ${top} A${r} ${ry} 0 0 1 ${cx + r * 0.3} ${top + ry * 0.95} Z`} />
        </>
      ) : (
        <>
          <ellipse className="ij-face-t" cx={cx} cy={top} rx={r} ry={ry} />
          {water && <ellipse className="ij-water" cx={cx} cy={top + 3} rx={r - 4} ry={ry - 2.5} />}
        </>
      )}
    </g>
  )
}

/** A small worker: white helmet, orange vest, navy trousers. No face. */
export function Worker({ at: [x, y], flip, carry }) {
  return (
    <g className="ij-worker" transform={`translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}`}>
      <ellipse className="ij-shadow" cx="2" cy="1" rx="7" ry="2.6" />
      <rect className="ij-navy" x="-4.5" y="-13" width="3.6" height="13" rx="1.6" />
      <rect className="ij-navy" x="0.9" y="-13" width="3.6" height="13" rx="1.6" />
      <rect className="ij-vest" x="-6" y="-27" width="12" height="15" rx="3.5" />
      <circle className="ij-skin" cx="0" cy="-31" r="4.2" />
      <path className="ij-helmet" d="M-5.2 -32.2 A5.2 5 0 0 1 5.2 -32.2 Z" />
      {carry && <rect className="ij-sack" x="3" y="-32" width="12" height="9" rx="3" />}
    </g>
  )
}

/** A delivery truck facing down-right: cargo box, cab, wheels. */
export function Truck({ at: [ax, ay], label }) {
  // cargo front-bottom corner at `at`; cab sits ahead of it along +x
  const cab = [ax + 24 * K, ay + 24 * 0.5]
  const [ox, oy] = originFor(ax, ay, 66, 30)
  const p = iso(ox, oy)
  const wheel = (u) => { const [x, y] = p(u, 30, 0); return <ellipse key={u} className="ij-navy" cx={x} cy={y} rx="6.5" ry="4.5" transform={`rotate(30 ${x} ${y})`} /> }
  return (
    <g className="ij-truck">
      <Box at={[ax, ay - 6]} w={66} d={30} h={34} tone="white" band={[0.15, 0.32]}>
        {(pp, { d }) => label && (
          <OnLeftFace p={pp} d={d} u={10} z={30}><text className="ij-face-text" x="0" y="11">{label}</text></OnLeftFace>
        )}
      </Box>
      <Box at={[cab[0], cab[1] - 6]} w={22} d={30} h={26} tone="orange" />
      {[12, 50].map(wheel)}
      {(() => { const [x, y] = [cab[0] - 2, cab[1] - 1]; return <ellipse className="ij-navy" cx={x} cy={y} rx="6.5" ry="4.5" transform={`rotate(30 ${x} ${y})`} /> })()}
    </g>
  )
}

/** A rice bag (white, orange band, navy size) standing at its front-bottom corner. */
export function Bag({ at, size, s = 1 }) {
  return (
    <Box at={at} w={20 * s} d={12 * s} h={30 * s} tone="white" band={[0.55, 0.72]}>
      {(p, { d, h }) => (
        <OnLeftFace p={p} d={d} u={3 * s} z={h * 0.48}>
          <text className="ij-bag-text" x="0" y={9 * s} style={{ fontSize: `${7 * s}px` }}>{size}</text>
        </OnLeftFace>
      )}
    </Box>
  )
}
