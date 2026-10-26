import { useEffect, useRef, useState } from 'react'
import { Box, Cylinder, Worker, Truck, Bag, OnLeftFace } from './iso.jsx'
import './journey.css'

/*
  Our Infrastructure — From Paddy to Packed Rice. One isometric illustration
  of the Chennai Rice campus in four stages, joined by one orange process
  line through fifteen numbered stations. Facts as supplied by the company
  (Oct 2026); nothing else is stated. Desktop reads left to right; phones get
  the same four stages stacked as a vertical journey.
*/

const TOP = 182 // the drawings start here (nothing sits above)
const H = 430 // every stage drawing shares this height, so they line up as one picture
const GROUND = 505 // the process line

const ZONES = [
  { num: '01', title: 'Paddy In', label: 'Sourcing', info: 'Paddy is procured from farmers and traders across 5 states.', w: 380 },
  { num: '02', title: 'Parboiling', label: 'What makes boiled rice firm', w: 380 },
  { num: '03', title: 'Milling', label: 'Husk to polished grain', w: 480 },
  { num: '04', title: 'Ready for You', label: 'Checked, packed, delivered', w: 460 },
]

const STEPS = [
  { n: 1, z: 0, x: 95, tip: 400, title: 'Paddy Procurement', label: ['PROCUREMENT'], desc: 'Bought from farmers and traders across 5 states.' },
  { n: 2, z: 0, x: 205, tip: 405, title: 'Quality Inspection', label: ['QUALITY', 'INSPECTION'], desc: 'Moisture, purity and grain checked at the gate.' },
  { n: 3, z: 0, x: 318, tip: 300, title: 'Silo Storage', label: ['SILO STORAGE'], desc: '31 silos, 61,500 MT total capacity.' },
  { n: 4, z: 1, x: 55, tip: 395, title: 'Pre-Cleaning', label: ['PRE-CLEANING'], desc: 'Dust, straw and stones removed.' },
  { n: 5, z: 1, x: 145, tip: 400, title: 'Soaking', label: ['SOAKING'], desc: 'Paddy soaked in hot water.' },
  { n: 6, z: 1, x: 240, tip: 385, title: 'Steaming', label: ['STEAMING'], desc: 'Steamed so the starch sets.' },
  { n: 7, z: 1, x: 335, tip: 320, title: 'Drying', label: ['DRYING'], desc: 'Dried to the right moisture.' },
  { n: 8, z: 2, x: 55, tip: 395, title: 'Husking', label: ['HUSKING'], desc: 'Husk removed, giving brown rice.' },
  { n: 9, z: 2, x: 150, tip: 410, title: 'Paddy Separation', label: ['PADDY', 'SEPARATION'], desc: 'Unhusked grains sent back.' },
  { n: 10, z: 2, x: 245, tip: 380, title: 'Whitening & Polishing', label: ['WHITENING &', 'POLISHING'], desc: 'Bran removed, grain polished.' },
  { n: 11, z: 2, x: 337, tip: 405, title: 'Grading', label: ['GRADING'], desc: 'Sorted by grain size, broken grains removed.' },
  { n: 12, z: 2, x: 432, tip: 340, title: 'Colour Sorting', label: ['COLOUR', 'SORTING'], desc: 'Optical sorters remove discoloured grains.' },
  { n: 13, z: 3, x: 72, tip: 395, title: 'Final Quality Check', label: ['FINAL', 'QUALITY CHECK'], desc: 'Each batch tested before packing.' },
  { n: 14, z: 3, x: 195, tip: 385, title: 'Packing', label: ['PACKING'], desc: '5 kg, 10 kg and 26 kg bags, sealed.' },
  { n: 15, z: 3, x: 322, tip: 355, title: 'Dispatch', label: ['DISPATCH'], desc: 'Warehouse, distributors, shops and homes.' },
]

/* ------------------------------------------------------------ the machines */

function SiloGroup() {
  return (
    <g>
      <Cylinder at={[354, 424]} r={21} h={118} roof="cone" bands={[0.34, 0.68]} />
      <Cylinder at={[318, 442]} r={21} h={118} roof="cone" bands={[0.34, 0.68]} />
      <Cylinder at={[282, 460]} r={21} h={118} roof="cone" bands={[0.34, 0.68]} />
      {/* the capacity plate */}
      <line className="ij-leader" x1="300" y1="291" x2="300" y2="318" />
      <g transform="translate(238 232)">
        <rect className="ij-plate" width="134" height="59" rx="3" />
        <rect className="ij-plate-bar" width="4" height="59" />
        <text className="ij-plate-big" x="14" y="27">31 SILOS</text>
        <text className="ij-plate-small" x="14" y="46">61,500 MT CAPACITY</text>
      </g>
    </g>
  )
}

function ReceivingBay() {
  return (
    <g>
      <Truck at={[60, 452]} label="PADDY" />
      <Box at={[128, 470]} w={16} d={12} h={9} tone="sack" />
      <Box at={[141, 476]} w={16} d={12} h={9} tone="sack" />
      <Box at={[134, 464]} w={16} d={12} h={9} tone="sack" shadow={false} />
      <Worker at={[112, 482]} carry />
    </g>
  )
}

function InspectionStation() {
  return (
    <g>
      <Box at={[206, 462]} w={36} d={34} h={46} tone="white" band={[0.78, 0.9]}>
        {(p, { d }) => (
          <OnLeftFace p={p} d={d} u={8} z={30}><rect className="ij-window" width="18" height="12" /></OnLeftFace>
        )}
      </Box>
      <Box at={[234, 476]} w={18} d={12} h={13} tone="machine" />
      <Worker at={[186, 482]} />
    </g>
  )
}

function PreCleaner() {
  return (
    <Box at={[62, 466]} w={40} d={34} h={52} band={[0.62, 0.74]}>
      {(p, { w, d, h }) => <Box at={p(w * 0.74, d * 0.82, h)} w={22} d={18} h={16} tone="white" shadow={false} />}
    </Box>
  )
}

function SoakingTanks() {
  return (
    <g>
      <Cylinder at={[164, 454]} r={17} h={58} water bands={[-0.5]} />
      <Cylinder at={[130, 471]} r={17} h={58} water bands={[-0.5]} />
    </g>
  )
}

function SteamPlant() {
  return (
    <g>
      <path className="ij-pipe" d="M238 392 V372 H286 V410" />
      <Cylinder at={[236, 470]} r={19} h={76} bands={[0.3, -0.62]} />
      <Box at={[290, 452]} w={30} d={26} h={34} tone="machine" band={[0.6, 0.72]}>
        {(p, { w, d, h }) => {
          const [x, y] = p(w * 0.5, d * 0.5, h)
          return <Cylinder at={[x, y]} r={5} h={30} />
        }}
      </Box>
      {[0, 1, 2].map((i) => <circle key={i} className="ij-steam" cx={283 + i * 4} cy={350} r={6} style={{ animationDelay: `${i * 0.8}s` }} />)}
    </g>
  )
}

function Dryer() {
  return (
    <Box at={[347, 470]} w={34} d={34} h={128} band={[0.88, 0.94]}>
      {(p, { d }) => (
        <OnLeftFace p={p} d={d} u={5} z={100}>
          {[0, 12, 24, 36, 48, 60, 72].map((y) => <line key={y} className="ij-louver" x1="0" y1={y} x2="24" y2={y} />)}
        </OnLeftFace>
      )}
    </Box>
  )
}

function Husker() {
  return (
    <Box at={[62, 468]} w={44} d={36} h={56} band={[0.62, 0.74]}>
      {(p, { w, d, h }) => <Box at={p(w * 0.72, d * 0.8, h)} w={24} d={20} h={14} tone="white" shadow={false} />}
    </Box>
  )
}

function Separator() {
  return (
    <Box at={[160, 468]} w={48} d={36} h={40} band={[0.55, 0.68]}>
      {(p, { w, d, h }) => <Box at={p(w * 0.9, d * 0.9, h)} w={38} d={26} h={5} tone="white" shadow={false} />}
    </Box>
  )
}

function Whitener() {
  return (
    <Box at={[252, 468]} w={42} d={36} h={72} band={[0.6, 0.7]}>
      {(p, { w, d, h }) => {
        const [x, y] = p(w * 0.55, d * 0.55, h)
        return <Cylinder at={[x, y]} r={11} h={14} />
      }}
    </Box>
  )
}

function Grader() {
  return (
    <Box at={[344, 468]} w={48} d={38} h={40} band={[0.55, 0.68]}>
      {(p, { w, d, h }) => (
        <g>
          <Box at={p(w * 0.92, d * 0.9, h)} w={40} d={30} h={5} tone="white" shadow={false} />
          <Box at={p(w * 0.86, d * 0.82, h + 9)} w={34} d={24} h={5} tone="white" shadow={false} />
        </g>
      )}
    </Box>
  )
}

function ColorSorter() {
  return (
    <Box at={[440, 470]} w={44} d={30} h={110} band={[0.06, 0.13]}>
      {(p, { w, d, h }) => (
        <g>
          <Box at={p(w * 0.8, d * 0.86, h)} w={30} d={18} h={14} tone="white" shadow={false} />
          <OnLeftFace p={p} d={d} u={9} z={h * 0.78}>
            <rect className="ij-window" width="26" height="44" />
            <line className="ij-beam" x1="0" y1="24" x2="26" y2="24" />
            {[0, 1, 2, 3].map((i) => <ellipse key={i} className="ij-grain" cx={8 + (i % 2) * 9} cy="4" rx="2" ry="3.2" style={{ animationDelay: `${i * 0.35}s` }} />)}
          </OnLeftFace>
        </g>
      )}
    </Box>
  )
}

function QualityLab() {
  return (
    <g>
      <Box at={[96, 468]} w={56} d={44} h={58} tone="white" band={[0.86, 0.94]}>
        {(p, { d }) => (
          <g>
            <OnLeftFace p={p} d={d} u={8} z={42}><rect className="ij-window" width="36" height="16" /></OnLeftFace>
            <OnLeftFace p={p} d={d} u={8} z={16}><text className="ij-face-text" x="0" y="8">QC LAB</text></OnLeftFace>
          </g>
        )}
      </Box>
      <Worker at={[50, 482]} />
    </g>
  )
}

function PackingMachine() {
  return (
    <g>
      <Box at={[180, 462]} w={38} d={34} h={66} band={[0.6, 0.7]}>
        {(p, { w, d, h }) => <Box at={p(w * 0.75, d * 0.8, h)} w={20} d={16} h={14} tone="white" shadow={false} />}
      </Box>
      <Bag at={[210, 476]} size="5 KG" s={0.72} />
      <Bag at={[232, 484]} size="10 KG" s={0.9} />
      <Bag at={[260, 493]} size="26 KG" s={1.12} />
    </g>
  )
}

function Warehouse() {
  return (
    <Box at={[318, 452]} w={72} d={56} h={56} tone="white" band={[0.9, 1]}>
      {(p, { w, d, h }) => (
        <g>
          <polygon className="ij-face-t" points={[p(0, d, h), p(w, d, h), p(w, d / 2, h + 18), p(0, d / 2, h + 18)].map(([x, y]) => `${x},${y}`).join(' ')} />
          <polygon className="ij-face-r" points={[p(w, 0, h), p(w, d, h), p(w, d / 2, h + 18)].map(([x, y]) => `${x},${y}`).join(' ')} />
          <OnLeftFace p={p} d={d} u={26} z={38}>
            <rect className="ij-door" width="32" height="38" />
            {[8, 16, 24, 32].map((y) => <line key={y} className="ij-louver" x1="0" y1={y} x2="32" y2={y} />)}
          </OnLeftFace>
          <OnLeftFace p={p} d={d} u={6} z={50}><text className="ij-face-text" x="0" y="8">WAREHOUSE</text></OnLeftFace>
        </g>
      )}
    </Box>
  )
}

function DispatchTruck() {
  return (
    <g className="ij-leaving">
      <Truck at={[402, 488]} label="CHENNAI RICE" />
    </g>
  )
}

function Destinations() {
  const to = [['DISTRIBUTORS', 214], ['SHOPS', 248], ['HOMES', 282]]
  return (
    <g>
      {to.map(([t, y]) => (
        <g key={t}>
          <path className="ij-route-thin" d={`M430 432 C 430 ${y + 40}, 408 ${y}, 360 ${y}`} />
          <g transform={`translate(300 ${y - 11})`}>
            <rect className="ij-pill" width="98" height="22" rx="11" />
            <circle className="ij-pill-dot" cx="12" cy="11" r="3.5" />
            <text className="ij-pill-text" x="21" y="15">{t}</text>
          </g>
        </g>
      ))}
    </g>
  )
}

const MACHINES = {
  1: ReceivingBay, 2: InspectionStation, 3: SiloGroup, 4: PreCleaner, 5: SoakingTanks, 6: SteamPlant, 7: Dryer,
  8: Husker, 9: Separator, 10: Whitener, 11: Grader, 12: ColorSorter, 13: QualityLab, 14: PackingMachine, 15: Warehouse,
}

/* ------------------------------------------------------------ one stage */

function Zone({ zone, i, active, setActive, shown }) {
  const steps = STEPS.filter((s) => s.z === i)
  const last = i === ZONES.length - 1
  // the process line: in from the left edge, through each station, out at the right
  const stops = [{ x: 0 }, ...steps, last ? null : { x: zone.w }].filter(Boolean)
  const segs = stops.slice(1).map((to, k) => ({ from: stops[k].x, to: to.x, n: to.n, into: Boolean(to.n) }))
  const before = STEPS.findIndex((s) => s.z === i) // stations before this zone, for the draw order
  return (
    <div className="ij-zone">
      <header className="ij-zone-head">
        <span className="ij-zone-num">{zone.num}</span>
        <div>
          <h3 className="ij-zone-title">{zone.title}</h3>
          {zone.label && <p className="ij-zone-label">{zone.label}</p>}
          {zone.info && <p className="ij-zone-info">{zone.info}</p>}
        </div>
      </header>

      <div className="ij-art">
        <svg viewBox={`0 ${TOP} ${zone.w} ${H}`} className="ij-svg" role="img" aria-label={`${zone.title}: ${steps.map((s) => s.title).join(', ')}`}>
          <defs>
            <marker id={`ij-arrow-${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 Z" className="ij-arrow-head" />
            </marker>
          </defs>
          <line className="ij-ground" x1="0" y1={GROUND + 0.5} x2={zone.w} y2={GROUND + 0.5} />

          {steps.map((s) => {
            const M = MACHINES[s.n]
            return (
              <g key={s.n} className={`ij-station${active === s.n ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(s.n)} onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(s.n)} onBlur={() => setActive(null)} tabIndex={0}
                aria-label={`${s.n}. ${s.title}: ${s.desc}`}>
                <g className="ij-machine"><M /></g>
              </g>
            )
          })}
          {last && <DispatchTruck />}
          {last && <Destinations />}

          {/* return loop: separation sends unhusked grain back to the husker */}
          {i === 2 && (
            <g className={`ij-return${active === 9 ? ' is-active' : ''}`}>
              <path className="ij-route-dash" d="M150 416 C 150 352, 66 344, 66 384" markerEnd={`url(#ij-arrow-${i})`} />
              <text className="ij-return-text" x="108" y="346">RETURN</text>
            </g>
          )}

          {segs.map((g, k) => {
            const end = g.into ? g.to - 15 : g.to
            const start = k === 0 ? g.from : g.from + 15
            return (
              <path key={k} pathLength="1"
                className={`ij-route${g.n && active === g.n ? ' is-active' : ''}${shown ? ' is-drawn' : ''}`}
                style={{ transitionDelay: `${(before + k) * 0.12}s` }}
                d={`M${start} ${GROUND} H${end}`} markerEnd={g.into ? `url(#ij-arrow-${i})` : undefined} />
            )
          })}
          {last && <path className={`ij-route${shown ? ' is-drawn' : ''}`} pathLength="1" style={{ transitionDelay: '1.9s' }} d={`M${337} ${GROUND} H430 V448`} markerEnd={`url(#ij-arrow-${i})`} />}

          {steps.map((s, k) => (
            <g key={s.n} className={`ij-stop${active === s.n ? ' is-active' : ''}${shown ? ' is-drawn' : ''}`} style={{ transitionDelay: `${(before + k) * 0.12 + 0.1}s` }}
              onMouseEnter={() => setActive(s.n)} onMouseLeave={() => setActive(null)}>
              <circle cx={s.x} cy={GROUND} r="13" className="ij-stop-dot" />
              <text x={s.x} y={GROUND + 4.5} className="ij-stop-num">{String(s.n).padStart(2, '0')}</text>
              {s.label.map((line, l) => <text key={l} x={s.x} y={GROUND + 34 + l * 14} className="ij-stop-label">{line}</text>)}
            </g>
          ))}
        </svg>

        {steps.filter((s) => s.n === active).map((s) => (
          <div key={s.n} className="ij-tip" role="tooltip" style={{ left: `${(s.x / zone.w) * 100}%`, top: `${((s.tip - TOP) / H) * 100}%` }}>
            <strong>{String(s.n).padStart(2, '0')} · {s.title}</strong>
            <span>{s.desc}</span>
          </div>
        ))}
      </div>

      <ol className="ij-steps">
        {steps.map((s) => (
          <li key={s.n} className={active === s.n ? 'is-active' : ''} onMouseEnter={() => setActive(s.n)} onMouseLeave={() => setActive(null)}>
            <span className="ij-steps-num">{String(s.n).padStart(2, '0')}</span>
            <span><strong>{s.title}</strong>{s.desc}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function InfraJourney() {
  const [active, setActive] = useState(null)
  const [shown, setShown] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return undefined }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setShown(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <section className="ij" aria-labelledby="ij-title" ref={ref}>
      <div className="ij-inner">
        <p className="ij-eyebrow">Our Infrastructure</p>
        <h2 id="ij-title" className="ij-title">From Paddy to Packed Rice</h2>
        <p className="ij-sub">An integrated rice-processing infrastructure built around quality, efficiency and consistency.</p>
        <div className="ij-journey" style={{ '--cols': ZONES.map((z) => `${z.w}fr`).join(' ') }}>
          {ZONES.map((z, i) => <Zone key={z.num} zone={z} i={i} active={active} setActive={setActive} shown={shown} />)}
        </div>
      </div>
    </section>
  )
}
