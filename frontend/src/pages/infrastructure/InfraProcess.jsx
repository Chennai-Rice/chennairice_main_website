import { PROCESSING_STAGES } from '../../data/infrastructure.js'
import './infraprocess.css'

/*
  "Inside the mill": the ten processing stages as an animated production line
  (owner's reference, Oct 2026). A conveyor winds across in three rows; each
  stage has a machine on the belt, a magnifier showing what happens there,
  a red number and its description. Grains travel the belt and the stations
  light up in turn. Phones get the same stages as a list.
*/

const VB = { w: 1200, h: 820 }
const ROWS = [190, 450, 710] // belt centre lines
const R = (ROWS[1] - ROWS[0]) / 2 // U-turn radius
const LEFT = 150
const RIGHT = 1040
const BELT = `M 20 ${ROWS[0]} H ${RIGHT} A ${R} ${R} 0 0 1 ${RIGHT} ${ROWS[1]} H ${LEFT} A ${R} ${R} 0 0 0 ${LEFT} ${ROWS[2]} H 1180`

// Where each stage sits: [x on the belt, row] — 4, 3 and 3 stations.
const SPOTS = [
  [200, 0], [450, 0], [700, 0], [960, 0],
  [930, 1], [640, 1], [350, 1],
  [330, 2], [620, 2], [910, 2],
]

// The machine at each stage (illustrations made for the site, Oct 2026): file and width ÷ height.
const PHOTOS = [
  { file: 'intake', ratio: 363 / 420 }, { file: 'pre-cleaner', ratio: 381 / 420 }, { file: 'destoner', ratio: 394 / 420 },
  { file: 'husker', ratio: 341 / 420 }, { file: 'separator', ratio: 401 / 420 }, { file: 'whitener', ratio: 322 / 420 },
  { file: 'grader', ratio: 419 / 420 }, { file: 'colour-sorter', ratio: 364 / 420 }, { file: 'quality-lab', ratio: 420 / 412 },
  { file: 'packing', ratio: 417 / 420 },
]

// What happens there, drawn inside the magnifier (centred on 0,0, about 40 across).
const ICONS = [
  // 1 raw paddy: grains
  <g key="i1">{[[-10, -6, -30], [4, -10, 20], [10, 6, -10], [-6, 8, 40]].map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx="7" ry="3.4" transform={`rotate(${r} ${x} ${y})`} className="ip-ink-gold" />)}</g>,
  // 2 pre-cleaning: sieve
  <g key="i2"><rect x="-16" y="-10" width="32" height="10" rx="2" className="ip-ink-line" />{[-10, -4, 2, 8].map((x) => <circle key={x} cx={x} cy="8" r="1.8" className="ip-ink-gold" />)}<path d="M-16 -10 L16 -10" className="ip-ink-red" /></g>,
  // 3 destoning: stones fall out
  <g key="i3"><path d="M-16 -12 L16 4" className="ip-ink-line" /><circle cx="-6" cy="10" r="4" className="ip-ink-dark" /><circle cx="6" cy="14" r="3" className="ip-ink-dark" /><path d="M2 -8 l0 8 m-3 -3 l3 3 l3 -3" className="ip-ink-red" /></g>,
  // 4 husking: two rollers
  <g key="i4"><circle cx="-8" cy="2" r="9" className="ip-ink-line" /><circle cx="10" cy="2" r="9" className="ip-ink-line" /><path d="M-8 -4 a6 6 0 1 1 -1 0 M10 -4 a6 6 0 1 0 1 0" className="ip-ink-red" /><ellipse cx="1" cy="-14" rx="5" ry="2.4" className="ip-ink-gold" /></g>,
  // 5 separation: split arrows
  <g key="i5"><path d="M0 -14 V0 M0 0 L-12 12 M0 0 L12 12 M-12 12 l0 -6 m0 6 l6 0 M12 12 l0 -6 m0 6 l-6 0" className="ip-ink-red" /></g>,
  // 6 whitening / polishing: grain with shine
  <g key="i6"><ellipse cx="0" cy="2" rx="12" ry="6" className="ip-ink-white" /><path d="M10 -14 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" className="ip-ink-gold" /></g>,
  // 7 grading: grains by size
  <g key="i7"><rect x="-16" y="4" width="8" height="10" className="ip-ink-gold" /><rect x="-4" y="-2" width="8" height="16" className="ip-ink-gold" /><rect x="8" y="-10" width="8" height="24" className="ip-ink-red-fill" /></g>,
  // 8 colour sorting: optical eye and beam
  <g key="i8"><path d="M-16 -4 Q0 -18 16 -4 Q0 10 -16 -4 Z" className="ip-ink-line" /><circle cx="0" cy="-4" r="4" className="ip-ink-red-fill" /><path d="M0 2 V16" className="ip-ink-red ip-beam" /></g>,
  // 9 quality check
  <g key="i9"><circle cx="0" cy="0" r="14" className="ip-ink-line" /><path d="M-7 0 l5 5 l10 -11" className="ip-ink-red" /></g>,
  // 10 packaging: bag
  <g key="i10"><path d="M-11 -12 h22 l3 26 h-28 z" className="ip-ink-red-fill" /><circle cx="0" cy="2" r="5" className="ip-ink-white" /><path d="M-5 -12 v-4 h10 v4" className="ip-ink-line" /></g>,
]

export default function InfraProcess() {
  return (
    <section className="ip" aria-labelledby="ip-title">
      <div className="container ip-inner">
        <p className="ip-eyebrow">Inside the mill</p>
        <h2 id="ip-title" className="ip-title">From Paddy to Pack, Step by Step</h2>
        <p className="ip-sub">Ten stages on one line at our Nasiyanur, Erode mill — every grain cleaned, milled, sorted and checked before it is packed.</p>

        <div className="ip-stage" aria-hidden="true">
          <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="ip-svg" role="presentation">
            {/* the conveyor belt: dark band, moving marks, travelling grains */}
            <path d={BELT} className="ip-belt" />
            <path d={BELT} className="ip-belt-marks" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <ellipse key={i} rx="6" ry="3" className="ip-grain">
                <animateMotion dur="24s" begin={`${-i * 4}s`} repeatCount="indefinite" rotate="auto" path={BELT} />
              </ellipse>
            ))}

            {SPOTS.map(([x, row], i) => {
              const y = ROWS[row] - 12
              const img = PHOTOS[i]
              const ih = 132
              const iw = Math.round(ih * img.ratio)
              const m = { w: iw * 0.78, h: ih * 0.82 }
              const mx = x + iw / 2 + 26
              const my = y - ih * 0.62
              return (
                <g key={i} className="ip-station" style={{ animationDelay: `${i * 1.2}s` }}>
                  <image href={`/assets/infrastructure/machines/${img.file}.webp`} x={x - iw / 2} y={y - ih + 10} width={iw} height={ih} className="ip-photo" />
                  {/* magnifier */}
                  <line className="ip-mag-line" x1={x + iw * 0.2} y1={y - ih * 0.45} x2={mx} y2={my} />
                  <g transform={`translate(${mx} ${my})`}>
                    <circle r="30" className="ip-mag" />
                    {ICONS[i]}
                  </g>
                  <circle cx={x - m.w / 2 + 4} cy={ROWS[row] + 34} r="13" className="ip-num-bg" />
                  <text x={x - m.w / 2 + 4} y={ROWS[row] + 39} className="ip-num">{i + 1}</text>
                </g>
              )
            })}
            <text x="24" y={ROWS[0] + 46} className="ip-endlabel">PADDY IN →</text>
            <text x="1176" y={ROWS[2] - 24} className="ip-endlabel" textAnchor="end">TO DISPATCH →</text>
          </svg>

          {/* labels under each station, positioned on the same grid */}
          {SPOTS.map(([x, row], i) => (
            <div key={i} className="ip-label" style={{ left: `${((x - Math.round(132 * PHOTOS[i].ratio) * 0.39 + 22) / VB.w) * 100}%`, top: `${((ROWS[row] + 22) / VB.h) * 100}%` }}>
              <strong>{PROCESSING_STAGES[i].title}</strong>
              <span>{PROCESSING_STAGES[i].text}</span>
            </div>
          ))}
        </div>

        {/* phones: the same stages as a list on a belt */}
        <ol className="ip-list">
          {PROCESSING_STAGES.map((s, i) => (
            <li key={s.id}>
              <span className="ip-list-mag" aria-hidden="true">
                <svg viewBox="-30 -30 60 60" width="56" height="56"><circle r="28" className="ip-mag" />{ICONS[i]}</svg>
                <span className="ip-list-num">{i + 1}</span>
              </span>
              <span className="ip-list-text"><strong>{s.title}</strong><span>{s.text}</span></span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
