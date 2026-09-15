import React, { useState } from 'react'
import {
  buildJourney,
  formatDuration,
  formatPercent,
  formatVisitorNo,
  humaniseSlug,
  REALTIME_WINDOW_MINUTES,
} from '../../services/admin.service.js'
import { HEATMAP_DEVICES, HEATMAP_POINT_LIMIT } from '../../services/admin.service.js'
import { MAX_CLICKS_PER_PAGE } from '../../services/interactions.js'
import { BarRow, Card, DataTable, EmptyState, LoadingRegion, MetricCard, Segmented } from './components/ui.jsx'
import { DeviceChart, FunnelChart, JourneyTimeline, TrendChart } from './components/charts.jsx'
import { HeatmapLegend, HeatmapStage, ScrollDepthBar } from './components/heatmap.jsx'

/* Minimal line icons — drawn from one 20px grid so weight stays even. */
const Icon = ({ path, ...rest }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {path}
  </svg>
)
const icons = {
  visitors: <Icon path={<><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" /></>} />,
  sessions: <Icon path={<path d="M3 13.5l4-4.5 3.5 3L17 5.5" />} />,
  views: <Icon path={<><path d="M1.8 10S4.9 4.8 10 4.8 18.2 10 18.2 10 15.1 15.2 10 15.2 1.8 10 1.8 10z" /><circle cx="10" cy="10" r="2.3" /></>} />,
  time: <Icon path={<><circle cx="10" cy="10" r="7.2" /><path d="M10 5.8V10l2.8 1.8" /></>} />,
  click: <Icon path={<><path d="M5 3.5l10.5 5.4-4.4 1.4-1.4 4.4z" /><path d="M11.6 11.6l4 4" /></>} />,
  rage: <Icon path={<><path d="M10 2.6l2.3 4.7 5.2.8-3.8 3.6.9 5.1L10 14.4l-4.6 2.4.9-5.1L2.5 8.1l5.2-.8z" /></>} />,
  dead: <Icon path={<><circle cx="10" cy="10" r="7.2" /><path d="M7.4 7.4l5.2 5.2M12.6 7.4l-5.2 5.2" /></>} />,
  scroll: <Icon path={<><path d="M10 3v11" /><path d="M6.2 10.4L10 14.2l3.8-3.8" /><path d="M4 17h12" /></>} />,
}

/** "3 Sept, 14:02" — short enough for a table cell. */
function formatWhen(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * An element, identified the way a person recognises it (its visible text)
 * with the selector underneath for whoever has to go and fix it.
 */
function ElementCell({ row }) {
  return (
    <span className="ad-el">
      <span className="ad-el-label">
        {row.label || <span className="ad-muted">(no text)</span>}
        {row.tag && <span className="ad-el-tag">{row.tag}</span>}
      </span>
      <span className="ad-el-selector ad-mono">{row.selector || '—'}</span>
    </span>
  )
}

/* ------------------------------------------------------------- Overview */

export function OverviewView({ report, onOpenJourney }) {
  const [metric, setMetric] = useState('visitors')

  return (
    <>
      <div className="ad-kpis">
        <MetricCard label="Visitors" value={report.kpis.visitors.value} change={report.kpis.visitors.change} icon={icons.visitors} tone="visitors" />
        <MetricCard label="Sessions" value={report.kpis.sessions.value} change={report.kpis.sessions.change} icon={icons.sessions} tone="sessions" />
        <MetricCard label="Page views" value={report.kpis.pageviews.value} change={report.kpis.pageviews.change} icon={icons.views} tone="views" />
        <MetricCard label="Avg. session" value={formatDuration(report.kpis.avgSession.value)} change={report.kpis.avgSession.change} icon={icons.time} tone="time" />
      </div>

      <div className="ad-grid ad-grid-2">
        <Card title="Time on page" subtitle="Average across the selected period">
          <div className="ad-timesplit">
            <TimeSplit label="Landing page" seconds={report.pageTime.landingAvgSeconds} views={report.pageTime.landingViews}
              max={Math.max(report.pageTime.landingAvgSeconds, report.pageTime.productAvgSeconds)} />
            <TimeSplit label="Product pages" seconds={report.pageTime.productAvgSeconds} views={report.pageTime.productViews}
              max={Math.max(report.pageTime.landingAvgSeconds, report.pageTime.productAvgSeconds)} />
          </div>
        </Card>

        <Card title="Funnel" subtitle="Share of visitors reaching each step">
          <FunnelChart funnel={report.funnel} compact />
        </Card>
      </div>

      <Card
        title="Visitors over time"
        subtitle="Daily totals"
        actions={
          <Segmented
            ariaLabel="Chart metric"
            value={metric}
            onChange={setMetric}
            options={[
              { id: 'visitors', label: 'Visitors' },
              { id: 'sessions', label: 'Sessions' },
              { id: 'pageviews', label: 'Page views' },
            ]}
          />
        }
      >
        <TrendChart data={report.series} metric={metric} />
      </Card>

      <div className="ad-grid ad-grid-2">
        <Card title="Devices" subtitle="Sessions by device type">
          <DeviceChart devices={report.devices} />
        </Card>

        <Card title="Locations" subtitle="Where sessions came from">
          {report.locations.length === 0 ? (
            <EmptyState title="No location data yet" note="Location is resolved from the visitor's IP when a session starts." />
          ) : (
            <div className="ad-bars">
              {report.locations.slice(0, 6).map((l) => (
                <BarRow key={l.label} label={l.label} count={l.count} percent={l.percent} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Top products" subtitle="Ranked by page views">
        <ProductTable products={report.products.slice(0, 5)} />
      </Card>

      <Card title="Recent visitors">
        <VisitorTable rows={report.rows.slice(0, 8)} onOpenJourney={onOpenJourney} />
      </Card>
    </>
  )
}

function TimeSplit({ label, seconds, views, max }) {
  const pct = max ? Math.max((seconds / max) * 100, 2) : 2
  return (
    <div className="ad-timesplit-item">
      <span className="ad-timesplit-label">{label}</span>
      <span className="ad-timesplit-value">{formatDuration(seconds)}</span>
      <div className="ad-bar-track">
        <div className="ad-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="ad-muted ad-small">{views} {views === 1 ? 'view' : 'views'}</span>
    </div>
  )
}

/* ------------------------------------------------------------- Visitors */

export function VisitorsView({ report, onOpenJourney }) {
  const [device, setDevice] = useState('all')

  const deviceOptions = [
    { id: 'all', label: 'All' },
    ...report.devices.map((d) => ({ id: d.name, label: d.name })),
  ]
  const rows = device === 'all' ? report.rows : report.rows.filter((r) => (r.device || 'unknown') === device)

  return (
    <>
      <div className="ad-kpis">
        <MetricCard label="Visitors" value={report.audience.total} change={report.kpis.visitors.change} icon={icons.visitors} tone="visitors" />
        <MetricCard label="New" value={report.audience.fresh} />
        <MetricCard label="Returning" value={report.audience.returning} />
        <MetricCard label="Avg. session" value={formatDuration(report.kpis.avgSession.value)} change={report.kpis.avgSession.change} icon={icons.time} tone="time" />
      </div>

      <Card
        title="All visitors"
        subtitle="One row per browser, numbered in the order first seen"
        actions={<Segmented ariaLabel="Filter by device" value={device} onChange={setDevice} options={deviceOptions} />}
      >
        <VisitorTable rows={rows} onOpenJourney={onOpenJourney} searchable pageSize={12} />
      </Card>
    </>
  )
}

/* ------------------------------------------------------------- Products */

export function ProductsView({ report }) {
  const totalViews = report.products.reduce((a, p) => a + p.views, 0)
  const totalCarts = report.products.reduce((a, p) => a + p.addToCarts, 0)

  return (
    <>
      <div className="ad-kpis">
        <MetricCard label="Products viewed" value={report.products.length} />
        <MetricCard label="Product page views" value={totalViews} icon={icons.views} tone="views" />
        <MetricCard label="Avg. time on product" value={formatDuration(report.pageTime.productAvgSeconds)} icon={icons.time} tone="time" />
        <MetricCard label="Added to cart" value={totalCarts} />
      </div>

      <Card title="Product performance" subtitle="Every pack a visitor opened in this period">
        <ProductTable products={report.products} searchable pageSize={12} />
      </Card>
    </>
  )
}

function ProductTable({ products, searchable = false, pageSize = 0 }) {
  return (
    <DataTable
      rows={products}
      rowKey={(p) => p.slug}
      searchable={searchable}
      searchKeys={['name', 'slug']}
      searchPlaceholder="Search products…"
      pageSize={pageSize}
      initialSort={{ key: 'views', dir: 'desc' }}
      emptyTitle="No product pages viewed yet"
      emptyNote="This fills in as visitors open product pages."
      columns={[
        { key: 'name', header: 'Product', render: (p) => <span className="ad-strong">{p.name}</span> },
        { key: 'views', header: 'Views', align: 'right' },
        { key: 'uniqueVisitors', header: 'Visitors', align: 'right' },
        { key: 'avgSeconds', header: 'Avg. time', align: 'right', render: (p) => formatDuration(p.avgSeconds) },
        { key: 'totalSeconds', header: 'Total time', align: 'right', render: (p) => formatDuration(p.totalSeconds) },
        { key: 'addToCarts', header: 'Added to cart', align: 'right' },
        {
          key: 'conversion',
          header: 'Conversion',
          align: 'right',
          render: (p) =>
            p.conversion == null ? <span className="ad-muted">—</span> : formatPercent(p.conversion),
        },
      ]}
    />
  )
}

/* --------------------------------------------------------------- Funnel */

export function FunnelView({ report }) {
  return (
    <>
      <Card title="Conversion funnel" subtitle="Visitors reaching each step in the selected period">
        <FunnelChart funnel={report.funnel} />
      </Card>

      <Card title="Step detail">
        <DataTable
          rows={report.funnel.stages.map((s, i) => ({
            ...s,
            step: i + 1,
            // Marked here so the cells below can withhold figures the data
            // cannot support, rather than printing a 0% that reads as a
            // measured result.
            untracked: s.label === 'Paid' && !report.funnel.paidTracked,
          }))}
          rowKey={(s) => s.label}
          emptyTitle="No funnel data"
          columns={[
            { key: 'step', header: '#', sortable: false, mono: true },
            {
              key: 'label',
              header: 'Step',
              sortable: false,
              render: (s) => (
                <span className={s.untracked ? 'ad-muted' : 'ad-strong'}>
                  {s.label}
                  {s.untracked && ' — not tracked yet'}
                </span>
              ),
            },
            {
              key: 'count',
              header: 'Visitors',
              align: 'right',
              sortable: false,
              render: (s) => (s.untracked ? <span className="ad-muted">—</span> : s.count),
            },
            {
              key: 'conversion',
              header: 'From previous',
              align: 'right',
              sortable: false,
              render: (s) =>
                s.untracked || s.conversion == null ? <span className="ad-muted">—</span> : formatPercent(s.conversion),
            },
            {
              key: 'dropOff',
              header: 'Drop-off',
              align: 'right',
              sortable: false,
              render: (s) => (s.step === 1 || s.untracked ? <span className="ad-muted">—</span> : s.dropOff),
            },
          ]}
        />
        <p className="ad-footnote">
          “Paid” cannot rise above zero until a payment gateway is connected. The event is already
          recorded and the funnel will populate on its own once purchases are written.
        </p>
      </Card>
    </>
  )
}

/* ------------------------------------------------------------- Journeys */

export function JourneysView({ report, selected, onSelect }) {
  const row = report.rows.find((r) => r.visitorId === selected) ?? report.rows[0] ?? null

  if (!row) {
    return <EmptyState title="No visitors yet" note="Journeys appear once someone browses the site with analytics accepted." />
  }

  return (
    <div className="ad-journey-layout">
      <Card title="Visitors" className="ad-journey-list">
        <ul className="ad-picker">
          {report.rows.map((r) => (
            <li key={r.visitorId}>
              <button
                type="button"
                className={`ad-picker-btn${r.visitorId === row.visitorId ? ' is-active' : ''}`}
                onClick={() => onSelect(r.visitorId)}
              >
                <span className="ad-mono ad-strong">{formatVisitorNo(r.visitorNo)}</span>
                <span className="ad-muted ad-small">
                  {r.device || '—'} · {r.pageCount} {r.pageCount === 1 ? 'page' : 'pages'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title={`Visitor ${formatVisitorNo(row.visitorNo)}`}
        subtitle={[row.device, [row.city, row.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || undefined}
      >
        <div className="ad-journey-facts">
          <Fact label="Sessions" value={row.sessionCount} />
          <Fact label="Pages" value={row.pageCount} />
          <Fact label="Total time" value={formatDuration(row.totalSeconds)} />
          <Fact label="Added to cart" value={row.addToCartCount} />
          <Fact label="Last seen" value={row.lastSeen ? new Date(row.lastSeen).toLocaleString() : '—'} />
        </div>
        <JourneyTimeline journey={buildJourney(row)} />
      </Card>
    </div>
  )
}

function Fact({ label, value }) {
  return (
    <div className="ad-fact">
      <span className="ad-fact-label">{label}</span>
      <span className="ad-fact-value">{value}</span>
    </div>
  )
}

/* ------------------------------------------------------------- Realtime */

export function RealtimeView({ realtime }) {
  return (
    <>
      <div className="ad-kpis">
        <MetricCard label="Active visitors" value={realtime.activeVisitors} icon={icons.visitors} tone="visitors" />
        <MetricCard label="Active sessions" value={realtime.activeSessions} icon={icons.sessions} tone="sessions" />
        <MetricCard label="Pages in view" value={realtime.topPages.length} icon={icons.views} tone="views" />
        <MetricCard label="Window" value={`${REALTIME_WINDOW_MINUTES} min`} icon={icons.time} tone="time" />
      </div>

      <div className="ad-grid ad-grid-2">
        <Card title="Live sessions" subtitle={`Seen in the last ${REALTIME_WINDOW_MINUTES} minutes`}>
          {realtime.sessions.length === 0 ? (
            <EmptyState title="Nobody on the site right now" note="Sessions appear here while a visitor's tab is open and visible." />
          ) : (
            <DataTable
              rows={realtime.sessions}
              rowKey={(s) => s.sessionId}
              emptyTitle="No live sessions"
              columns={[
                { key: 'visitorNo', header: 'Visitor', mono: true, render: (s) => formatVisitorNo(s.visitorNo) },
                { key: 'device', header: 'Device', render: (s) => s.device || '—' },
                { key: 'location', header: 'Location', render: (s) => s.location || '—' },
                { key: 'seconds', header: 'On site', align: 'right', render: (s) => formatDuration(s.seconds) },
                {
                  key: 'lastSeen',
                  header: 'Last beat',
                  align: 'right',
                  render: (s) => new Date(s.lastSeen).toLocaleTimeString(),
                },
              ]}
            />
          )}
        </Card>

        <Card title="Pages being viewed">
          {realtime.topPages.length === 0 ? (
            <EmptyState title="No pages in view" />
          ) : (
            <div className="ad-bars">
              {realtime.topPages.map((p) => (
                <BarRow
                  key={p.path}
                  label={p.path}
                  count={p.count}
                  percent={(p.count / realtime.topPages[0].count) * 100}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Event stream" subtitle="Newest first">
        {realtime.feed.length === 0 ? (
          <EmptyState title="Nothing happening right now" note="Page views and cart events from active sessions appear here as they arrive." />
        ) : (
          <ol className="ad-feed">
            {realtime.feed.map((e, i) => (
              <li key={`${e.at}-${i}`} className="ad-feed-item">
                <span className={`ad-feed-kind ad-feed-${e.kind}`}>{e.kind.replace(/_/g, ' ')}</span>
                <span className="ad-mono ad-strong">{formatVisitorNo(e.visitorNo)}</span>
                <span className="ad-feed-path">{e.path || '—'}</span>
                <span className="ad-muted ad-small">{new Date(e.at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  )
}

/* --------------------------------------------------------- shared table */

function VisitorTable({ rows, onOpenJourney, searchable = false, pageSize = 0 }) {
  const prepared = rows.map((r) => ({
    ...r,
    display: formatVisitorNo(r.visitorNo),
    location: [r.city, r.country].filter(Boolean).join(', ') || '—',
  }))

  return (
    <DataTable
      rows={prepared}
      rowKey={(r) => r.visitorId}
      searchable={searchable}
      searchKeys={['display', 'location', 'device', 'browser']}
      searchPlaceholder="Search visitors…"
      pageSize={pageSize}
      initialSort={{ key: 'lastSeen', dir: 'desc' }}
      emptyTitle="No visitors in this period"
      emptyNote="Try a wider date range."
      columns={[
        { key: 'display', header: 'Visitor', mono: true, render: (r) => <span className="ad-strong">{r.display}</span> },
        { key: 'device', header: 'Device', render: (r) => r.device || '—' },
        { key: 'location', header: 'Location' },
        { key: 'sessionCount', header: 'Sessions', align: 'right' },
        { key: 'pageCount', header: 'Pages', align: 'right' },
        { key: 'totalSeconds', header: 'Total time', align: 'right', render: (r) => formatDuration(r.totalSeconds) },
        { key: 'addToCartCount', header: 'Cart', align: 'right' },
        {
          key: 'lastSeen',
          header: 'Last seen',
          align: 'right',
          sortValue: (r) => (r.lastSeen ? new Date(r.lastSeen).getTime() : 0),
          render: (r) => (r.lastSeen ? new Date(r.lastSeen).toLocaleString() : '—'),
        },
        {
          key: 'journey',
          header: '',
          sortable: false,
          align: 'right',
          render: (r) => (
            <button type="button" className="ad-link" onClick={() => onOpenJourney(r.visitorId)}>
              Journey
            </button>
          ),
        },
      ]}
    />
  )
}

/* ------------------------------------------------------------ Behaviour */

/**
 * Rage clicks, dead clicks and the elements people actually click.
 *
 * There is no period-on-period comparison on these tiles, and that is
 * deliberate rather than unfinished: MetricCard draws no footer when
 * `change` is omitted, which is the honest rendering for a number that has
 * no comparison behind it.
 */
export function BehaviourView({ behaviour, error }) {
  if (error) return <p className="ad-alert" role="alert">{error}</p>
  if (!behaviour) return <LoadingRegion label="Loading interaction data" />

  if (!behaviour.hasData) {
    return (
      <EmptyState
        title="No clicks recorded yet"
        note="Click tracking begins once a visitor accepts the analytics cookie on the live site. The dashboard itself is never recorded."
      />
    )
  }

  const { totals, rage, dead, elements, pages, deadRate, rageClickTotal } = behaviour

  return (
    <>
      <div className="ad-kpis">
        <MetricCard label="Clicks recorded" value={totals.clicks} icon={icons.click} tone="visitors" />
        <MetricCard label="Rage clicks" value={rageClickTotal} icon={icons.rage} tone="down" />
        <MetricCard label="Dead clicks" value={totals.deadClicks} icon={icons.dead} tone="warn" />
        <MetricCard
          label="Dead click rate"
          value={deadRate == null ? '—' : formatPercent(deadRate)}
          icon={icons.views}
          tone="views"
        />
      </div>

      <Card
        title="Rage clicks"
        subtitle="Where a visitor clicked repeatedly because nothing seemed to happen"
      >
        <DataTable
          rows={rage}
          rowKey={(r) => `${r.path}|${r.selector}`}
          searchable={rage.length > 8}
          searchKeys={['label', 'selector', 'path']}
          searchPlaceholder="Search elements…"
          pageSize={10}
          initialSort={{ key: 'totalBurst', dir: 'desc' }}
          emptyTitle="No rage clicks"
          emptyNote="Nobody has clicked the same spot three or more times in a second. That is the result you want."
          columns={[
            { key: 'label', header: 'Element', sortValue: (r) => r.label || r.selector, render: (r) => <ElementCell row={r} /> },
            { key: 'path', header: 'Page', mono: true },
            { key: 'hits', header: 'Bursts', align: 'right' },
            { key: 'totalBurst', header: 'Clicks', align: 'right', render: (r) => <span className="ad-strong">{r.totalBurst}</span> },
            { key: 'visitors', header: 'Visitors', align: 'right' },
            { key: 'lastAt', header: 'Last seen', align: 'right', sortValue: (r) => new Date(r.lastAt).getTime(), render: (r) => formatWhen(r.lastAt) },
          ]}
        />
        <p className="ad-footnote">
          A burst is three or more clicks within one second and 40 pixels of each other.
          "Clicks" is the total across every burst on that element, so one row can stand
          for several separate moments of frustration.
        </p>
      </Card>

      <Card title="Dead clicks" subtitle="Things that look clickable but are not">
        <DataTable
          rows={dead}
          rowKey={(r) => `${r.path}|${r.selector}`}
          searchable={dead.length > 8}
          searchKeys={['label', 'selector', 'path']}
          searchPlaceholder="Search elements…"
          pageSize={10}
          initialSort={{ key: 'hits', dir: 'desc' }}
          emptyTitle="No dead clicks"
          emptyNote="Nothing that looks like a control has been clicked without responding."
          columns={[
            { key: 'label', header: 'Element', sortValue: (r) => r.label || r.selector, render: (r) => <ElementCell row={r} /> },
            { key: 'path', header: 'Page', mono: true },
            { key: 'hits', header: 'Dead clicks', align: 'right', render: (r) => <span className="ad-strong">{r.hits}</span> },
            { key: 'visitors', header: 'Visitors', align: 'right' },
            { key: 'lastAt', header: 'Last seen', align: 'right', sortValue: (r) => new Date(r.lastAt).getTime(), render: (r) => formatWhen(r.lastAt) },
          ]}
        />
        <p className="ad-footnote">
          Only elements carrying a visual affordance are counted — a pointer cursor, an
          image, or a class that reads as a control. Clicks on ordinary text also produce
          no response, but reporting those would bury the ones worth fixing.
        </p>
      </Card>

      <div className="ad-grid ad-grid-2">
        <Card title="Most clicked" subtitle="Counted by element, so it survives a redesign">
          <DataTable
            rows={elements.slice(0, 60)}
            rowKey={(r) => `${r.path}|${r.selector}`}
            pageSize={10}
            initialSort={{ key: 'hits', dir: 'desc' }}
            emptyTitle="Nothing clicked yet"
            columns={[
              { key: 'label', header: 'Element', sortValue: (r) => r.label || r.selector, render: (r) => <ElementCell row={r} /> },
              { key: 'hits', header: 'Clicks', align: 'right', render: (r) => <span className="ad-strong">{r.hits}</span> },
              { key: 'visitors', header: 'Visitors', align: 'right' },
            ]}
          />
        </Card>

        <Card title="By page" subtitle="Where the clicking happens">
          <DataTable
            rows={pages}
            rowKey={(r) => r.path}
            pageSize={10}
            initialSort={{ key: 'clicks', dir: 'desc' }}
            emptyTitle="No pages with clicks"
            columns={[
              { key: 'path', header: 'Page', mono: true },
              { key: 'clicks', header: 'Clicks', align: 'right' },
              { key: 'rageClicks', header: 'Rage', align: 'right', render: (r) => (r.rageClicks ? <span className="ad-flag ad-flag-rage">{r.rageClicks}</span> : <span className="ad-muted">0</span>) },
              { key: 'deadClicks', header: 'Dead', align: 'right', render: (r) => (r.deadClicks ? <span className="ad-flag ad-flag-dead">{r.deadClicks}</span> : <span className="ad-muted">0</span>) },
              { key: 'visitors', header: 'Visitors', align: 'right' },
            ]}
          />
        </Card>
      </div>

      <p className="ad-footnote">
        Up to {MAX_CLICKS_PER_PAGE} clicks are recorded per page view. Past that the rest
        of that view is not captured, so a single very long session is represented here
        rather than counted in full.
      </p>
    </>
  )
}

/* -------------------------------------------------------------- Heatmap */

export function HeatmapView({
  behaviour,
  heatmap,
  path,
  device,
  onChangePath,
  onChangeDevice,
  error,
}) {
  const [stage, setStage] = useState({ drawn: 0, beyond: 0, frameHeight: 0 })

  if (error) return <p className="ad-alert" role="alert">{error}</p>
  if (!behaviour) return <LoadingRegion label="Loading pages" />

  const clicked = behaviour.pages.filter((p) => p.clicks > 0)

  if (!clicked.length) {
    return (
      <EmptyState
        title="No clicks to map yet"
        note="A heatmap needs recorded clicks. They start arriving once a visitor accepts the analytics cookie on the live site."
      />
    )
  }

  const active = path || clicked[0].path
  const band = HEATMAP_DEVICES.find((d) => d.id === device) ?? HEATMAP_DEVICES[0]
  const pageRow = behaviour.pages.find((p) => p.path === active)
  const scrollRow = behaviour.scroll.find((p) => p.path === active)
  const pageElements = behaviour.elements.filter((e) => e.path === active).slice(0, 12)

  return (
    <>
      <Card
        title="Click heatmap"
        subtitle="Drawn over the page as it looks today"
        actions={
          <Segmented
            ariaLabel="Screen size"
            value={device}
            onChange={onChangeDevice}
            options={HEATMAP_DEVICES.map((d) => ({ id: d.id, label: d.label }))}
          />
        }
      >
        <div className="ad-hm-controls">
          <label className="ad-select-wrap">
            <span className="ad-sr">Page</span>
            <select className="ad-select" value={active} onChange={(e) => onChangePath(e.target.value)}>
              {clicked.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.path} · {p.clicks} clicks
                </option>
              ))}
            </select>
          </label>

          <span className="ad-hm-status ad-small">
            <span className="ad-muted">
              {heatmap ? `${stage.drawn} of ${heatmap.points.length} clicks drawn` : 'Loading clicks…'}
            </span>
            {stage.beyond > 0 && (
              <span className="ad-flag ad-flag-warn">{stage.beyond} below the page</span>
            )}
          </span>

          <HeatmapLegend />
        </div>

        {heatmap && heatmap.points.length === 0 ? (
          <EmptyState
            title="No clicks in this size band"
            note={`Nothing was recorded on ${active} from a ${band.label.toLowerCase()} screen in this period. Try another size, or a wider date range.`}
          />
        ) : (
          <HeatmapStage
            key={`${active}|${device}`}
            path={active}
            band={heatmap?.band ?? band}
            points={heatmap?.points ?? []}
            onMeasured={setStage}
          />
        )}

        <p className="ad-footnote">
          Positions are stored as a fraction of page width and a pixel offset from the
          top, and are only ever drawn against the screen size they were recorded at — a
          click made on a phone is never placed on the desktop layout. Within a size band
          it is still an approximation, because a page is taller at 1024px than at 1920px.
          {stage.beyond > 0 && (
            <>
              {' '}
              {stage.beyond} click{stage.beyond === 1 ? '' : 's'} fell past the bottom of the
              page as it is now, meaning the page was longer when they happened. They are
              counted here but not drawn, because there is nowhere honest to put them.
            </>
          )}
          {heatmap?.capped && <> Showing the most recent {HEATMAP_POINT_LIMIT} clicks only.</>}
        </p>
      </Card>

      <div className="ad-grid ad-grid-2">
        <Card
          title="Most clicked on this page"
          subtitle="The same clicks, counted by element instead of by pixel"
        >
          {pageElements.length ? (
            <div className="ad-bars">
              {pageElements.map((el) => (
                <BarRow
                  key={el.selector}
                  label={el.label || el.selector}
                  count={el.hits}
                  percent={pageRow?.clicks ? (el.hits / pageRow.clicks) * 100 : 0}
                  muted={!el.label}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No elements recorded for this page" />
          )}
          <p className="ad-footnote">
            Element counts survive a layout change; the pixels above do not. When the two
            disagree, trust this one.
          </p>
        </Card>

        <Card title="How far down this page is read" subtitle={active}>
          {scrollRow ? (
            <ScrollDepthBar row={scrollRow} />
          ) : (
            <EmptyState title="No page views recorded for this page in this period" />
          )}
        </Card>
      </div>
    </>
  )
}

/* --------------------------------------------------------- Scroll depth */

export function ScrollView({ behaviour, error }) {
  if (error) return <p className="ad-alert" role="alert">{error}</p>
  if (!behaviour) return <LoadingRegion label="Loading scroll data" />

  const rows = behaviour.scroll.filter((r) => r.measured > 0)

  if (!rows.length) {
    return (
      <EmptyState
        title="No scroll depth recorded yet"
        note="Scroll depth is captured with every page view from now on. Views recorded before this was added carry no measurement."
      />
    )
  }

  return (
    <Card title="Scroll depth" subtitle="How far down each page visitors actually get">
      <DataTable
        rows={rows}
        rowKey={(r) => r.path}
        searchable={rows.length > 8}
        searchKeys={['path']}
        searchPlaceholder="Search pages…"
        pageSize={12}
        initialSort={{ key: 'views', dir: 'desc' }}
        emptyTitle="Nothing measured yet"
        columns={[
          { key: 'path', header: 'Page', mono: true },
          {
            key: 'measured',
            header: 'Measured',
            align: 'right',
            render: (r) =>
              r.measured === r.views ? (
                r.measured
              ) : (
                <span>
                  {r.measured} <span className="ad-muted">of {r.views}</span>
                </span>
              ),
          },
          { key: 'medianDepth', header: 'Median depth', align: 'right', render: (r) => (r.medianDepth == null ? '—' : `${Math.round(r.medianDepth)}%`) },
          { key: 'avgDepth', header: 'Average', align: 'right', render: (r) => (r.avgDepth == null ? '—' : `${Math.round(r.avgDepth)}%`) },
          {
            key: 'reached50',
            header: 'Halfway',
            align: 'right',
            sortValue: (r) => (r.measured ? r.reached50 / r.measured : 0),
            render: (r) => <DepthShare part={r.reached50} whole={r.measured} />,
          },
          {
            key: 'reached90',
            header: 'Bottom',
            align: 'right',
            sortValue: (r) => (r.measured ? r.reached90 / r.measured : 0),
            render: (r) => <DepthShare part={r.reached90} whole={r.measured} />,
          },
        ]}
      />
      <p className="ad-footnote">
        A page shorter than the visitor's screen counts as fully read, because it was —
        with no scrolling required. "Measured" separates views that carry a reading from
        those recorded before scroll tracking existed, so each percentage describes the
        views it was actually computed from.
      </p>
    </Card>
  )
}

function DepthShare({ part, whole }) {
  if (!whole) return <span className="ad-muted">—</span>
  return (
    <span className="ad-depth">
      <span className="ad-strong">{formatPercent((part / whole) * 100, 0)}</span>
      <span className="ad-muted ad-small">
        {part}/{whole}
      </span>
    </span>
  )
}
