import { useEffect, useMemo, useRef, useState } from 'react'
import './advisor-answer.css'

/*
  One Business Advisor answer, drawn from its structured JSON (advisor.js):
  headline → number tiles → charts → tables → why → actions → verdict →
  caveats → data used. Figures the server found in the data carry a ✓;
  anything it could not match is marked "check" so a made-up number is never
  shown as fact.

  Charts follow the dataviz rules: one axis, thin marks with 4px rounded
  data-ends, recessive grid, hover tooltip on every mark, legend for 2+
  series, colours in a fixed order (validated for colour-blind separation:
  maroon, gold, blue, green), text in ink colours, never series colours.
*/

const SERIES = ['#9C2430', '#A97416', '#3D63B8', '#2F7D4F']
const OTHER = '#A8A29C'

const fmtNum = (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })
export function fmt(v, unit) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  const n = Number(v)
  switch (unit) {
    case 'inr': return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
    case 'percent': return fmtNum(n) + '%'
    case 'kg': return fmtNum(n) + ' kg'
    case 'days': return fmtNum(n) + (n === 1 ? ' day' : ' days')
    case 'packs': return fmtNum(n) + (n === 1 ? ' pack' : ' packs')
    case 'orders': return fmtNum(n) + (n === 1 ? ' order' : ' orders')
    default: return fmtNum(n)
  }
}
// Short axis ticks: ₹1.2L, 12k.
function tick(v, unit) {
  const n = Number(v)
  const a = Math.abs(n)
  const s = a >= 1e7 ? (n / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr' : a >= 1e5 ? (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L' : a >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : fmtNum(n)
  return (unit === 'inr' ? '₹' : '') + s + (unit === 'percent' ? '%' : '')
}
function niceMax(max) {
  if (max <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(max))
  const m = max / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}

const Check = ({ ok }) => (ok
  ? <span className="ava-ok" title="Found in your data">✓</span>
  : <span className="ava-warn" title="Not found in the data the Advisor was given — check this figure before using it">⚠ check</span>)

/* ------------------------------------------------------------------ number tiles */
function Numbers({ items }) {
  if (!items?.length) return null
  return (
    <div className="ava-tiles">
      {items.map((n, i) => (
        <div key={i} className="ava-tile">
          <span className="ava-tile-label">{n.label}</span>
          <strong className="ava-tile-value">{fmt(n.value, n.unit)}</strong>
          <span className="ava-tile-foot">
            {Number.isFinite(n.change) && (
              <span className={n.change >= 0 ? 'ava-up' : 'ava-down'}>{n.change >= 0 ? '↑' : '↓'} {fmtNum(Math.abs(n.change))}%</span>
            )}
            <Check ok={n.verified} />
          </span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ charts */
const H = 240

/** The element's width in CSS pixels, so the SVG is drawn 1:1 and its text stays 11px at any size. */
function useWidth(ref, fallback = 640) {
  const [w, setW] = useState(fallback)
  useEffect(() => {
    if (!ref.current) return undefined
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return w
}
const PAD = { l: 52, r: 14, t: 16, b: 40 }

function Tooltip({ tip }) {
  if (!tip) return null
  return (
    <div className="ava-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <strong>{tip.title}</strong>
      {tip.rows.map((r, i) => (
        <span key={i}><i style={{ background: r.color }} aria-hidden="true" />{r.name}: <b>{r.value}</b></span>
      ))}
    </div>
  )
}

function Legend({ series, colors }) {
  if (series.length < 2) return null
  return (
    <ul className="ava-legend">
      {series.map((s, i) => <li key={i}><i style={{ background: colors[i] }} aria-hidden="true" />{s.name}</li>)}
    </ul>
  )
}

function BarLine({ chart }) {
  const wrap = useRef(null)
  const W = useWidth(wrap)
  const [tip, setTip] = useState(null)
  const { labels, series, unit, type } = chart
  const n = labels.length
  const all = series.flatMap((s) => s.values.map(Number).filter(Number.isFinite))
  const top = niceMax(Math.max(0, ...all))
  const min = Math.min(0, ...all)
  const bottom = min < 0 ? -niceMax(-min) : 0
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const y = (v) => PAD.t + ih - ((v - bottom) / (top - bottom)) * ih
  const band = iw / n
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => bottom + (top - bottom) * f)
  // As many x labels as fit (about 70px each).
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))))
  // Characters that fit under one label slot (about 6.5px each at 11px).
  const room = Math.max(4, Math.floor((band * every) / 6.5) - 1)
  const show = (i, evt) => {
    const box = wrap.current.getBoundingClientRect()
    setTip({
      x: evt.clientX - box.left, y: evt.clientY - box.top,
      title: labels[i],
      rows: series.map((s, k) => ({ name: s.name, value: fmt(s.values[i], unit), color: SERIES[k] })),
    })
  }
  const bw = Math.max(4, Math.min(34, (band * 0.7 - (series.length - 1) * 2) / series.length))
  return (
    <div className="ava-plot" ref={wrap} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${chart.title}: ` + labels.map((l, i) => `${l} ${series.map((s) => fmt(s.values[i], unit)).join(' / ')}`).join('; ')}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'ava-axis' : 'ava-grid'} />
            <text x={PAD.l - 8} y={y(t) + 4} className="ava-tick" textAnchor="end">{tick(t, unit)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % every === 0 ? (
          <text key={i} x={PAD.l + band * i + band / 2} y={H - PAD.b + 18} className="ava-tick" textAnchor="middle">
            {l.length > room ? l.slice(0, room - 1) + '…' : l}
          </text>
        ) : null))}
        {type === 'bar' ? series.map((s, k) => s.values.map((v, i) => {
          const val = Number(v) || 0
          const x = PAD.l + band * i + (band - (bw * series.length + (series.length - 1) * 2)) / 2 + k * (bw + 2)
          const y0 = y(0)
          const y1 = y(val)
          const h = Math.max(Math.abs(y0 - y1), val ? 2 : 0)
          const r = Math.min(4, bw / 2, h)
          const top$ = Math.min(y0, y1)
          // Rounded only at the data end (away from the baseline).
          const d = val >= 0
            ? `M${x},${y0} V${top$ + r} Q${x},${top$} ${x + r},${top$} H${x + bw - r} Q${x + bw},${top$} ${x + bw},${top$ + r} V${y0} Z`
            : `M${x},${y0} V${top$ + h - r} Q${x},${top$ + h} ${x + r},${top$ + h} H${x + bw - r} Q${x + bw},${top$ + h} ${x + bw},${top$ + h - r} V${y0} Z`
          return <path key={k + '-' + i} d={d} fill={SERIES[k]} />
        })) : series.map((s, k) => {
          const pts = s.values.map((v, i) => [PAD.l + band * i + band / 2, y(Number(v) || 0)])
          return (
            <g key={k}>
              <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={SERIES[k]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {n <= 14 && pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={SERIES[k]} stroke="#fff" strokeWidth="2" />)}
            </g>
          )
        })}
        {/* Hit areas: the whole column, larger than the marks. */}
        {labels.map((_, i) => (
          <rect key={i} x={PAD.l + band * i} y={PAD.t} width={band} height={ih} fill="transparent"
            onMouseMove={(e) => show(i, e)} />
        ))}
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}

function Pie({ chart }) {
  const wrap = useRef(null)
  const [tip, setTip] = useState(null)
  const values = chart.series[0].values.map((v) => Math.max(0, Number(v) || 0))
  const total = values.reduce((a, b) => a + b, 0) || 1
  // More than 4 slices: the rest go into "Other" (grey), never a 5th colour.
  let slices = chart.labels.map((l, i) => ({ label: l, value: values[i] || 0 }))
  if (slices.length > 4) {
    const rest = slices.slice(3)
    slices = [...slices.slice(0, 3), { label: 'Other', value: rest.reduce((a, b) => a + b.value, 0), other: true }]
  }
  const R = 92
  const cx = 120
  const cy = 120
  let a0 = -Math.PI / 2
  const arcs = slices.map((s, i) => {
    const a1 = a0 + (s.value / total) * Math.PI * 2
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (a) => [cx + R * Math.cos(a), cy + R * Math.sin(a)]
    const [x0, y0] = p(a0)
    const [x1, y1] = p(a1)
    const d = s.value >= total ? `M${cx - R},${cy} a${R},${R} 0 1,0 ${R * 2},0 a${R},${R} 0 1,0 ${-R * 2},0` : `M${cx},${cy} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`
    a0 = a1
    return { ...s, d, color: s.other ? OTHER : SERIES[i] }
  })
  const pct = (v) => Math.round((v / total) * 1000) / 10
  return (
    <div className="ava-pie" ref={wrap} onMouseLeave={() => setTip(null)}>
      <svg viewBox="0 0 240 240" role="img" aria-label={`${chart.title}: ` + arcs.map((s) => `${s.label} ${pct(s.value)}%`).join(', ')}>
        {arcs.map((s, i) => (
          <path key={i} d={s.d} fill={s.color} stroke="#fff" strokeWidth="2"
            onMouseMove={(e) => {
              const box = wrap.current.getBoundingClientRect()
              setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title: s.label, rows: [{ name: 'Share', value: `${pct(s.value)}% · ${fmt(s.value, chart.unit)}`, color: s.color }] })
            }} />
        ))}
        <circle cx={cx} cy={cy} r={R * 0.55} fill="#fff" />
        <text x={cx} y={cy - 2} textAnchor="middle" className="ava-pie-total">{tick(total, chart.unit)}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="ava-tick">total</text>
      </svg>
      <ul className="ava-pie-legend">
        {arcs.map((s, i) => (
          <li key={i}><i style={{ background: s.color }} aria-hidden="true" /><span>{s.label}</span><b>{pct(s.value)}%</b><em>{fmt(s.value, chart.unit)}</em></li>
        ))}
      </ul>
      <Tooltip tip={tip} />
    </div>
  )
}

function Chart({ chart }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <figure className="ava-chart">
      <figcaption>
        <span>{chart.title} <Check ok={chart.verified} /></span>
        <button type="button" onClick={() => setAsTable((v) => !v)}>{asTable ? 'Chart' : 'Table'}</button>
      </figcaption>
      {asTable ? (
        <DataTable table={{ title: chart.title, columns: [chart.type === 'pie' ? 'Part' : 'Label', ...chart.series.map((s) => s.name)], rows: chart.labels.map((l, i) => [l, ...chart.series.map((s) => fmt(s.values[i], chart.unit))]) }} bare />
      ) : chart.type === 'pie' ? <Pie chart={chart} /> : (
        <>
          <Legend series={chart.series} colors={SERIES} />
          <BarLine chart={chart} />
        </>
      )}
    </figure>
  )
}

/* ------------------------------------------------------------------ tables */
const num = (c) => {
  const t = String(c).replace(/[₹,%\s]|kg|days?|orders?|packs?/gi, '')
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null
}

export function downloadCsv(name, columns, rows) {
  const esc = (v) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
  const csv = '﻿' + [columns, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = (name || 'advisor-table').replace(/[^\w-]+/g, '-').toLowerCase() + '.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function DataTable({ table, bare }) {
  const [sort, setSort] = useState(null) // { i, dir }
  const rows = useMemo(() => {
    if (!sort) return table.rows
    return [...table.rows].sort((a, b) => {
      const x = num(a[sort.i])
      const y = num(b[sort.i])
      const c = x != null && y != null ? x - y : String(a[sort.i]).localeCompare(String(b[sort.i]))
      return sort.dir * c
    })
  }, [table.rows, sort])
  return (
    <div className={bare ? 'ava-table is-bare' : 'ava-table'}>
      {!bare && (
        <div className="ava-table-head">
          <strong>{table.title} {table.verified != null && <Check ok={table.verified} />}</strong>
          <button type="button" onClick={() => downloadCsv(table.title, table.columns, table.rows)}>⬇ Excel / CSV</button>
        </div>
      )}
      <div className="ava-table-scroll">
        <table>
          <thead>
            <tr>
              {table.columns.map((c, i) => (
                <th key={i} aria-sort={sort?.i === i ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => setSort((s) => ({ i, dir: s?.i === i ? -s.dir : -1 }))}>
                    {c}{sort?.i === i ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => (
              <tr key={k}>{r.map((c, i) => <td key={i} className={num(c) != null ? 'is-num' : ''}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ the rest */
const VERDICT = {
  suitable: { icon: '✅', text: 'Suitable', tone: 'good' },
  suitable_with_changes: { icon: '⚠️', text: 'Suitable with changes', tone: 'warn' },
  not_suitable: { icon: '❌', text: 'Not suitable for us', tone: 'bad' },
}
const DOTS = { high: 3, medium: 2, low: 1 }
const Dots = ({ level, label }) => (
  <span className="ava-dots" title={`${label}: ${level}`}>
    {label} {[1, 2, 3].map((d) => <i key={d} className={d <= (DOTS[level] || 0) ? 'on' : ''} />)}
  </span>
)

function Verdict({ v }) {
  const meta = VERDICT[v.label] || VERDICT.suitable_with_changes
  const list = (title, items) => (items?.length ? <div><h5>{title}</h5><ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null)
  const line = (title, text) => (text ? <div><h5>{title}</h5><p>{text}</p></div> : null)
  return (
    <section className={`ava-verdict is-${meta.tone}`}>
      <h4><span aria-hidden="true">{meta.icon}</span> Verdict: {meta.text}</h4>
      <div className="ava-verdict-grid">
        {list('Why', v.reasons)}
        {list('Risks', v.risks)}
        {line('Expected effect (estimate)', v.expectedEffect)}
        {line('Better alternative', v.alternative)}
        {line('Test it small first', v.testSmall)}
        {list('What to watch', v.watch)}
      </div>
    </section>
  )
}

export default function AdvisorAnswer({ answer }) {
  const a = answer
  return (
    <article className="ava">
      <p className="ava-headline">{a.answer}</p>
      <Numbers items={a.numbers} />
      {a.charts?.length > 0 && <div className="ava-charts">{a.charts.map((c, i) => <Chart key={i} chart={c} />)}</div>}
      {a.tables?.map((t, i) => <DataTable key={i} table={t} />)}
      {a.why?.length > 0 && (
        <section className="ava-why">
          <h4>Why</h4>
          <ul>{a.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </section>
      )}
      {a.actions?.length > 0 && (
        <section className="ava-actions">
          <h4>What to do</h4>
          <ol>
            {a.actions.map((x, i) => (
              <li key={i}>
                <div className="ava-action-top"><strong>{x.title}</strong><span><Dots level={x.impact} label="Impact" /><Dots level={x.effort} label="Effort" /></span></div>
                <p>{x.why}</p>
                <p className="ava-first"><b>First step:</b> {x.firstStep}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {a.verdict && <Verdict v={a.verdict} />}
      {a.caveats?.length > 0 && <p className="ava-caveats"><b>Note:</b> {a.caveats.join(' ')}</p>}
      {a.sources?.length > 0 && <p className="ava-sources">Data used: {a.sources.join(' · ')}</p>}
    </article>
  )
}
