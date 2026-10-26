import './infraflow.css'

/*
  "Inside the mill" (owner's reference, Oct 2026): the mill in the middle and
  four stages around it in flat isometric line-art — 01 Paddy in, 02
  Parboiling, 03 Milling & sorting, 04 Packing & dispatch — joined by moving
  dashed arrows, with a running belt, rising steam and a waiting truck.
  On phones the drawing sits on top and the four stages follow as cards.
*/

export const FLOW = [
  { num: '01', title: 'Paddy In', steps: ['Paddy procurement from farmers and traders across 5 states', 'Quality inspection at the gate — moisture, purity, grain', 'Storage in 31 silos (61,500 MT)'] },
  { num: '02', title: 'Parboiling', steps: ['Pre-cleaning: dust, straw and stones removed', 'Soaking in hot water', 'Steaming so the grain sets firm', 'Drying to the right moisture'] },
  { num: '03', title: 'Milling & Sorting', steps: ['Husking and paddy separation', 'Whitening and polishing', 'Grading by grain size', 'Optical colour sorting'] },
  { num: '04', title: 'Packing & Dispatch', steps: ['Final quality check of every batch', 'Packed and sealed in 5, 10 and 26 kg bags', 'Dispatched to distributors, shops and homes'] },
]

// Isometric projection: a point (x, y, z) from a screen origin.
const P = (ox, oy) => (x, y, z = 0) => `${(ox + (x - y) * 0.866).toFixed(1)},${(oy + (x + y) * 0.5 - z).toFixed(1)}`

function Box({ ox, oy, w, d, h, tone = 'white', stripe }) {
  const p = P(ox, oy)
  return (
    <g className={`if-box if-${tone}`}>
      <polygon className="if-side-r" points={[p(w, 0, 0), p(w, d, 0), p(w, d, h), p(w, 0, h)].join(' ')} />
      <polygon className="if-side-l" points={[p(0, d, 0), p(w, d, 0), p(w, d, h), p(0, d, h)].join(' ')} />
      <polygon className="if-top" points={[p(0, 0, h), p(w, 0, h), p(w, d, h), p(0, d, h)].join(' ')} />
      {stripe && <polygon className="if-stripe" points={[p(0, d, h * 0.55), p(w, d, h * 0.55), p(w, d, h * 0.7), p(0, d, h * 0.7)].join(' ')} />}
    </g>
  )
}

function Silo({ cx, cy, r = 22, h = 70 }) {
  const top = cy - h
  return (
    <g className="if-silo">
      <path className="if-white" d={`M${cx - r} ${top} V${cy} A${r} ${r * 0.5} 0 0 0 ${cx + r} ${cy} V${top}`} />
      <path className="if-ring" d={`M${cx - r} ${top + h * 0.45} A${r} ${r * 0.5} 0 0 0 ${cx + r} ${top + h * 0.45}`} />
      <ellipse className="if-white" cx={cx} cy={top} rx={r} ry={r * 0.5} />
      <path className="if-red" d={`M${cx - r} ${top} L${cx} ${top - 22} L${cx + r} ${top} A${r} ${r * 0.5} 0 0 1 ${cx - r} ${top} Z`} />
    </g>
  )
}

function Person({ x, y, shirt = 'red', bob }) {
  return (
    <g className={`if-person${bob ? ' if-bob' : ''}`} transform={`translate(${x} ${y})`}>
      <rect x="-5" y="-14" width="4" height="16" rx="2" className="if-dark" />
      <rect x="1" y="-14" width="4" height="16" rx="2" className="if-dark" />
      <rect x="-8" y="-36" width="16" height="24" rx="6" className={shirt === 'red' ? 'if-red' : 'if-white'} />
      <circle cx="0" cy="-43" r="7" className="if-skin" />
    </g>
  )
}

function Sack({ x, y, s = 1 }) {
  return <rect x={x} y={y} width={22 * s} height={16 * s} rx={5 * s} className="if-sack" />
}

export default function InfraFlow() {
  const belt = P(590, 530)
  return (
    <section className="if" aria-labelledby="if-title">
      <div className="container if-inner">
        <p className="if-eyebrow">Inside the mill</p>
        <h2 id="if-title" className="if-title">From Paddy to Pack</h2>
        <p className="if-sub">Fifteen steps in four stages at our Nasiyanur, Erode mill — every grain cleaned, parboiled, milled, sorted and checked before it is packed.</p>

        <div className="if-stage">
          <svg viewBox="0 0 1200 760" className="if-svg" role="img" aria-label="The Chennai Rice mill: paddy in, parboiling, milling and sorting, packing and dispatch">
            <defs>
              <marker id="if-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0 L10 5 L0 10 Z" className="if-red" />
              </marker>
            </defs>

            {/* the mill in the middle */}
            <Box ox={600} oy={210} w={120} d={120} h={150} stripe />
            <Box ox={600} oy={95} w={50} d={50} h={40} tone="red" />
            {[0, 1, 2].map((i) => (
              <polygon key={i} className="if-window" points={P(600, 210)(120, 20 + i * 32, 40) + ' ' + P(600, 210)(120, 40 + i * 32, 40) + ' ' + P(600, 210)(120, 40 + i * 32, 70) + ' ' + P(600, 210)(120, 20 + i * 32, 70)} />
            ))}
            <Silo cx={712} cy={300} r={18} h={60} />
            <Silo cx={752} cy={318} r={18} h={60} />
            <text x="603" y="398" className="if-mill-label">CHENNAI RICE MILL · NASIYANUR</text>

            {/* 01 paddy in: silos, sacks, inspector */}
            <g className="if-group" transform="translate(0 40)">
              <Silo cx={190} cy={300} r={26} h={90} />
              <Silo cx={248} cy={322} r={26} h={90} />
              <Silo cx={306} cy={300} r={26} h={90} />
              <Sack x={140} y={330} /><Sack x={160} y={334} /><Sack x={150} y={318} />
              <Person x={360} y={352} bob />
            </g>

            {/* 02 parboiling: tanks with steam, boiler */}
            <g className="if-group">
              <Box ox={180} oy={560} w={70} d={70} h={60} stripe />
              <Silo cx={300} cy={620} r={30} h={70} />
              <Silo cx={370} cy={600} r={30} h={70} />
              {[0, 1, 2].map((i) => <circle key={i} className="if-steam" cx={300 + (i - 1) * 8} cy={520} r={8} style={{ animationDelay: `${i * 0.7}s` }} />)}
              {[0, 1, 2].map((i) => <circle key={'b' + i} className="if-steam" cx={370 + (i - 1) * 8} cy={500} r={8} style={{ animationDelay: `${0.35 + i * 0.7}s` }} />)}
              <Person x={448} y={640} shirt="white" />
            </g>

            {/* 03 milling & sorting: conveyor with machines and a sorter screen */}
            <g className="if-group">
              <polygon className="if-belt" points={[belt(0, 0, 18), belt(300, 0, 18), belt(300, 36, 18), belt(0, 36, 18)].join(' ')} />
              <polygon className="if-belt-side" points={[belt(0, 36, 6), belt(300, 36, 6), belt(300, 36, 18), belt(0, 36, 18)].join(' ')} />
              <g className="if-belt-load">
                {[0, 1, 2, 3, 4].map((i) => <polygon key={i} className="if-red-soft" points={[belt(i * 60, 10, 18), belt(i * 60 + 22, 10, 18), belt(i * 60 + 22, 26, 18), belt(i * 60, 26, 18)].join(' ')} />)}
              </g>
              <Box ox={Number(belt(70, 0).split(',')[0]) - 10} oy={Number(belt(70, 0).split(',')[1]) - 30} w={50} d={56} h={55} stripe />
              <Box ox={Number(belt(200, 0).split(',')[0]) - 10} oy={Number(belt(200, 0).split(',')[1]) - 30} w={50} d={56} h={45} />
              <g className="if-screen" transform="translate(770 470)">
                <rect x="-26" y="-56" width="52" height="38" rx="4" className="if-white" />
                <rect x="-19" y="-49" width="10" height="20" className="if-red" />
                <rect x="-5" y="-43" width="10" height="14" className="if-red-soft" />
                <rect x="9" y="-52" width="10" height="23" className="if-red" />
                <rect x="-2" y="-18" width="4" height="30" className="if-dark" />
              </g>
              <Person x={570} y={640} />
              <Person x={880} y={680} shirt="white" bob />
            </g>

            {/* 04 packing & dispatch: stacked sacks, truck */}
            <g className="if-group">
              <Sack x={850} y={300} /><Sack x={874} y={300} /><Sack x={862} y={284} />
              <Sack x={898} y={300} /><Sack x={886} y={284} /><Sack x={874} y={268} />
              <Person x={950} y={322} bob />
              <g className="if-truck">
                <Box ox={980} oy={190} w={110} d={56} h={64} />
                <Box ox={980 + 0.866 * 110} oy={190 + 0.5 * 110} w={38} d={56} h={46} tone="red" />
                <ellipse cx={951} cy={232} rx="10" ry="6" className="if-dark" transform="rotate(30 951 232)" />
                <ellipse cx={1011} cy={267} rx="10" ry="6" className="if-dark" transform="rotate(30 1011 267)" />
                <ellipse cx={1054} cy={292} rx="10" ry="6" className="if-dark" transform="rotate(30 1054 292)" />
              </g>
            </g>

            {/* the flow between stages */}
            <path className="if-flow" markerEnd="url(#if-arrow)" d="M250 440 Q 240 480 255 505" />
            <path className="if-flow" markerEnd="url(#if-arrow)" d="M470 600 Q 540 600 600 580" />
            <path className="if-flow" markerEnd="url(#if-arrow)" d="M860 600 Q 800 470 860 380" />
            <path className="if-flow" markerEnd="url(#if-arrow)" d="M400 330 Q 470 300 540 285" />
            <path className="if-flow" markerEnd="url(#if-arrow)" d="M780 250 Q 850 220 920 240" />
          </svg>

          {FLOW.map((g, i) => (
            <div key={g.num} className={`if-label if-label-${i + 1}`}>
              <span className="if-num">{g.num}</span>
              <h3>{g.title}</h3>
              <ul>{g.steps.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
