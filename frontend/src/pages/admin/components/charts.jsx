import React from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDuration, formatPercent, humaniseSlug } from '../../../services/admin.service.js'
import { EmptyState } from './ui.jsx'

/**
 * Charts read their colours from the same CSS custom properties as the rest
 * of the dashboard, resolved at render time, so a theme change moves the
 * charts with everything else instead of leaving them on baked-in hexes.
 */
function token(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name)
  return value?.trim() || fallback
}

const shortDate = (iso) => {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  return (
    <div className="ad-tip">
      <p className="ad-tip-label">{shortDate(label)}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="ad-tip-row">
          <span className="ad-tip-dot" style={{ background: entry.color }} aria-hidden="true" />
          {entry.name}
          <strong>{unit === 'time' ? formatDuration(entry.value) : entry.value}</strong>
        </p>
      ))}
    </div>
  )
}

/** Visitors / sessions / page views over time. */
export function TrendChart({ data, metric = 'visitors' }) {
  if (!data.length) {
    return <EmptyState title="No activity in this period" note="Pick a wider date range, or wait for visitors to arrive." />
  }

  // Same slot as the metric's KPI tile and its Devices/Overview siblings,
  // so switching the segmented control moves the line to the color that
  // already means "Sessions" or "Page views" everywhere else on the page.
  const accentTokens = {
    visitors: ['--ad-cat-1', '#9C2430'],
    sessions: ['--ad-cat-2', '#A97416'],
    pageviews: ['--ad-cat-3', '#2F7D4F'],
  }
  const [accentVar, accentFallback] = accentTokens[metric] ?? accentTokens.visitors
  const accent = token(accentVar, accentFallback)
  const grid = token('--ad-line', '#E7E1DA')
  const axis = token('--ad-muted', '#6B6560')

  const labels = { visitors: 'Visitors', sessions: 'Sessions', pageviews: 'Page views' }

  return (
    <div className="ad-chart" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="adTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.22} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fill: axis, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: grid }}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: axis, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: grid }} />
          <Area
            type="monotone"
            dataKey={metric}
            name={labels[metric] ?? metric}
            stroke={accent}
            strokeWidth={2}
            fill="url(#adTrendFill)"
            dot={{ r: 2.5, fill: accent, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Device split. Each slice takes the dashboard's categorical set — the same
 * four colours as the KPI tiles — rather than fading shades of one hue, so
 * "desktop" reads as a distinct identity instead of "accent but paler".
 */
export function DeviceChart({ devices }) {
  if (!devices.length) return <EmptyState title="No device data yet" />

  const shades = [
    token('--ad-cat-1', '#9C2430'),
    token('--ad-cat-2', '#A97416'),
    token('--ad-cat-3', '#2F7D4F'),
    token('--ad-cat-4', '#3D63B8'),
  ]

  return (
    <div className="ad-donut-wrap">
      <div className="ad-donut" style={{ height: 176, width: 176 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={devices}
              dataKey="count"
              nameKey="name"
              innerRadius={54}
              outerRadius={80}
              paddingAngle={devices.length > 1 ? 2 : 0}
              stroke="none"
            >
              {devices.map((d, i) => (
                <Cell key={d.name} fill={shades[i % shades.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="ad-tip">
                    <p className="ad-tip-row">
                      {payload[0].name}
                      <strong>
                        {payload[0].value} · {formatPercent(payload[0].payload.percent)}
                      </strong>
                    </p>
                  </div>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="ad-legend">
        {devices.map((d, i) => (
          <li key={d.name}>
            <span className="ad-legend-dot" style={{ background: shades[i % shades.length] }} aria-hidden="true" />
            <span className="ad-legend-name">{d.name}</span>
            <span className="ad-legend-val">{formatPercent(d.percent)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The funnel. Stage width encodes the share of the first stage, so the
 * drop-off is legible as shape and not only as numbers.
 *
 * The final stage is marked untracked while no payment gateway exists —
 * greyed and labelled, so a zero reads as "not measured" rather than
 * "measured, and nobody bought".
 */
export function FunnelChart({ funnel, compact = false }) {
  const top = funnel.stages[0]?.count ?? 0

  return (
    <ol className={`ad-funnel${compact ? ' is-compact' : ''}`}>
      {funnel.stages.map((stage, i) => {
        const untracked = stage.label === 'Paid' && !funnel.paidTracked
        const width = top ? Math.max((stage.count / top) * 100, 6) : 6

        return (
          <li key={stage.label} className={`ad-stage${untracked ? ' is-untracked' : ''}`}>
            <div className="ad-stage-head">
              <span className="ad-stage-label">
                {stage.label}
                {untracked && <span className="ad-tag">not tracked yet</span>}
              </span>
              <span className="ad-stage-count">{stage.count}</span>
            </div>

            <div className="ad-stage-track">
              <div
                className="ad-stage-fill"
                style={{
                  width: `${width}%`,
                  // One hue, light to dark — an ordinal ramp for depth into
                  // the funnel, not a fourth "series" colour. The untracked
                  // stage keeps its grey from the .is-untracked CSS rule.
                  ...(untracked ? {} : { background: `var(--ad-funnel-${Math.min(i + 1, 4)})` }),
                }}
              />
            </div>

            {i > 0 && (
              <p className="ad-stage-meta">
                {/* An untracked stage has no conversion and no drop-off: nobody
                    was measured leaving, so reporting "0% · n dropped off"
                    would state a finding the data cannot support. */}
                {untracked ? (
                  <span className="ad-muted">Awaiting a payment gateway — nothing recorded at this step</span>
                ) : stage.conversion == null ? (
                  <span className="ad-muted">No visitors at the previous step</span>
                ) : (
                  <>
                    <strong>{formatPercent(stage.conversion)}</strong> of previous step
                    {stage.dropOff > 0 && <span className="ad-muted"> · {stage.dropOff} dropped off</span>}
                  </>
                )}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * One visitor's path, grouped by session so a return visit reads as its own
 * visit rather than being spliced onto the previous one.
 */
export function JourneyTimeline({ journey }) {
  if (!journey.length) {
    return <EmptyState title="No pages recorded" note="This visitor started a session but no page view was captured." />
  }

  return (
    <div className="ad-journey">
      {journey.map((session, index) => (
        <section key={session.sessionId} className="ad-journey-session">
          <header className="ad-journey-head">
            <span className="ad-journey-title">
              Visit {index + 1}
              {journey.length > 1 && <span className="ad-muted"> of {journey.length}</span>}
            </span>
            <span className="ad-muted">
              {session.startedAt ? new Date(session.startedAt).toLocaleString() : '—'} ·{' '}
              {formatDuration(session.totalSeconds)}
            </span>
          </header>

          <ol className="ad-steps">
            {session.views.map((view, i) => {
              const slug = /^\/products\/([^/?#]+)/.exec(view.path)?.[1]
              return (
                <li key={view.id ?? `${view.path}-${i}`} className="ad-step">
                  <span className="ad-step-mark" aria-hidden="true" />
                  <div className="ad-step-body">
                    <span className="ad-step-path">
                      {slug ? humaniseSlug(slug) : view.path === '/' ? 'Landing page' : view.path}
                    </span>
                    <span className="ad-step-meta">
                      <span className="ad-mono">{view.path}</span>
                      <span className="ad-muted">
                        {formatDuration(view.seconds_on_page)} ·{' '}
                        {new Date(view.entered_at).toLocaleTimeString()}
                      </span>
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
