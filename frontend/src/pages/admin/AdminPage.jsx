import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AdminError,
  buildBehaviour,
  buildRealtime,
  buildReport,
  DATE_RANGES,
  fetchAnalytics,
  fetchBehaviour,
  fetchHeatmap,
  getSession,
  isAdmin,
  logAccess,
  onAuthChange,
  resolveAccess,
  signIn,
  signOut,
} from '../../services/admin.service.js'
import JournalPanel from '../blog/JournalPanel.jsx'
import { LoadingRegion } from './components/ui.jsx'
import {
  BehaviourView,
  FunnelView,
  HeatmapView,
  JourneysView,
  OverviewView,
  ProductsView,
  RealtimeView,
  ScrollView,
  VisitorsView,
} from './views.jsx'
import './admin.css'

/**
 * /admin — the analyst dashboard.
 *
 * This page holds no credentials and no privileged key. It signs in through
 * Supabase Auth and then reads whatever the RLS policies allow; a visitor
 * who is not in admin_users sees nothing here no matter what they do to the
 * JavaScript, because the restriction lives in Postgres, not in this file.
 *
 * Navigation is local state rather than routes: the dashboard is one screen
 * with several panels over a single dataset, so switching section should
 * never refetch or reset the date range.
 */

/* Sections that need a row in admin_users. */
const ANALYTICS_NAV = [
  { id: 'overview', label: 'Overview', subtitle: 'How the site is performing', icon: 'grid' },
  { id: 'visitors', label: 'Visitors', subtitle: 'Everyone who has browsed', icon: 'user' },
  { id: 'products', label: 'Products', subtitle: 'Which packs draw attention', icon: 'box' },
  { id: 'funnel', label: 'Funnel', subtitle: 'Where visitors drop off', icon: 'filter' },
  { id: 'journeys', label: 'Journeys', subtitle: 'The path one visitor walked', icon: 'route' },
  { id: 'behaviour', label: 'Behaviour', subtitle: 'Rage clicks and dead clicks', icon: 'spark' },
  { id: 'heatmap', label: 'Heatmap', subtitle: 'Where visitors click on a page', icon: 'target' },
  { id: 'scroll', label: 'Scroll depth', subtitle: 'How far down pages are read', icon: 'depth' },
  { id: 'realtime', label: 'Realtime', subtitle: 'Who is on the site now', icon: 'pulse' },
]

/* Section that needs a row in blog_authors. */
const JOURNAL_NAV = {
  id: 'journal',
  label: 'Journal',
  subtitle: 'Write and publish blog posts',
  icon: 'pen',
}

/* Sections whose data comes from the interaction tables rather than from
   fetchAnalytics(). Grouped so switching between them does not refetch. */
const INTERACTION_VIEWS = new Set(['behaviour', 'heatmap', 'scroll'])

/* Sections with no data model behind them yet. Shown so the navigation
   reflects the intended product, but disabled rather than opening an empty
   screen that pretends to be a feature. */
const NAV_SOON = [
  { id: 'reports', label: 'Reports', icon: 'doc' },
  { id: 'settings', label: 'Settings', icon: 'cog' },
]

const PATHS = {
  grid: <><rect x="2.5" y="2.5" width="6" height="6" rx="1.4" /><rect x="11.5" y="2.5" width="6" height="6" rx="1.4" /><rect x="2.5" y="11.5" width="6" height="6" rx="1.4" /><rect x="11.5" y="11.5" width="6" height="6" rx="1.4" /></>,
  user: <><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" /></>,
  box: <><path d="M10 2.5l7 3.6v7.8l-7 3.6-7-3.6V6.1z" /><path d="M3 6.1l7 3.6 7-3.6M10 9.7V17.5" /></>,
  filter: <path d="M2.8 4h14.4l-5.6 6.6v5.2l-3.2 1.8v-7z" />,
  route: <><circle cx="5" cy="5" r="2.2" /><circle cx="15" cy="15" r="2.2" /><path d="M5 7.2v3.3a3 3 0 003 3h4.8" /></>,
  pulse: <path d="M2.5 10h3.2l2-4.6 3 9.2 2.2-4.6h4.6" />,
  spark: <path d="M11 2.5L4.5 11h4l-1 6.5L15.5 9h-4z" />,
  target: <><circle cx="10" cy="10" r="6.8" /><circle cx="10" cy="10" r="2.6" /><path d="M10 1.6v2.2M10 16.2v2.2M18.4 10h-2.2M3.8 10H1.6" /></>,
  depth: <><path d="M10 2.6v9.6" /><path d="M6.2 8.4L10 12.2l3.8-3.8" /><path d="M3.4 16.6h13.2" /></>,
  doc: <><path d="M5 2.5h6.5L15.5 6.5V17.5H5z" /><path d="M11.5 2.5V6.5h4" /></>,
  pen: <><path d="M13.4 3.2l3.4 3.4-9 9-4.2.8.8-4.2z" /><path d="M11.8 4.8l3.4 3.4" /></>,
  cog: <><circle cx="10" cy="10" r="2.6" /><path d="M10 2.6v2.1M10 15.3v2.1M17.4 10h-2.1M4.7 10H2.6M15.2 4.8l-1.5 1.5M6.3 13.7l-1.5 1.5M15.2 15.2l-1.5-1.5M6.3 6.3L4.8 4.8" /></>,
}

const NavIcon = ({ name }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ad-nav-icon">
    {PATHS[name]}
  </svg>
)

export default function AdminPage() {
  const [checking, setChecking] = useState(true)
  const [session, setSession] = useState(null)
  const [access, setAccess] = useState(null)

  useEffect(() => {
    let cancelled = false

    // A Supabase session in localStorage is not proof of access — the
    // account could have been removed from admin_users or blog_authors
    // since last login, so both are re-checked on every load rather than
    // trusted.
    getSession()
      .then(async (existing) => {
        if (cancelled || !existing) return
        const resolved = await resolveAccess()
        if (cancelled) return
        if (resolved.any) {
          setSession(existing)
          setAccess(resolved)
        } else {
          await signOut()
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })

    const unsubscribe = onAuthChange((next) => {
      if (!next) {
        setSession(null)
        setAccess(null)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  if (checking) {
    return (
      <div className="ad-shell ad-shell-center">
        <p className="ad-muted">Checking access…</p>
      </div>
    )
  }

  return session && access ? (
    <Dashboard
      session={session}
      access={access}
      onSignOut={() => {
        setSession(null)
        setAccess(null)
      }}
    />
  ) : (
    <LoginScreen
      onSignedIn={async (resolved) => {
        setAccess(resolved)
        setSession(await getSession())
      }}
    />
  )
}

/* ---------------------------------------------------------------- login */

function LoginScreen({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      onSignedIn(await signIn(email.trim(), password))
    } catch (err) {
      setError(err instanceof AdminError ? err.message : 'Could not sign in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ad-shell ad-shell-center">
      <form className="ad-login" onSubmit={submit}>
        <div className="ad-login-brand">
          <span className="ad-logo" aria-hidden="true">CR</span>
          <div>
            <h1 className="ad-login-title">Staff Sign In</h1>
            <p className="ad-muted ad-small">Chennai Rice Industries</p>
          </div>
        </div>

        <label className="ad-field">
          <span>Email</span>
          <input type="email" className="ad-input" value={email} autoComplete="username" required
                 onChange={(e) => setEmail(e.target.value)} />
        </label>

        <label className="ad-field">
          <span>Password</span>
          <input type="password" className="ad-input" value={password} autoComplete="current-password" required
                 onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <p className="ad-alert" role="alert">{error}</p>}

        <button className="ad-btn ad-btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------ dashboard */

function Dashboard({ session, access, onSignOut }) {
  /* The sidebar is built from what this account may actually do, so a
     writer never sees an analytics section they cannot open, and an
     analyst never sees the journal. */
  const nav = useMemo(() => {
    const items = []
    if (access.analyst) items.push(...ANALYTICS_NAV)
    if (access.author) items.push(JOURNAL_NAV)
    return items
  }, [access])

  const [raw, setRaw] = useState(null)
  const [error, setError] = useState('')
  // A writer never loads analytics, so they never start in a loading state.
  const [loading, setLoading] = useState(access.analyst)
  const [view, setView] = useState(nav[0]?.id ?? 'journal')
  const [rangeId, setRangeId] = useState('7d')
  const [navOpen, setNavOpen] = useState(false)
  const [journeyVisitor, setJourneyVisitor] = useState(null)

  /* Interaction analytics is fetched separately and only for the sections
     that need it: clicks are the highest-volume thing the site records, so
     they are aggregated in Postgres rather than pulled down with the rest. */
  const [interactionRaw, setInteractionRaw] = useState(null)
  const [interactionError, setInteractionError] = useState('')
  const [heatmap, setHeatmap] = useState(null)
  const [heatmapError, setHeatmapError] = useState('')
  const [heatmapPath, setHeatmapPath] = useState(null)
  const [heatmapDevice, setHeatmapDevice] = useState('desktop')

  /* Bumped by Refresh so every dataset reloads, not just the main one. */
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(() => {
    // A writer has no rows to read here — RLS would return an empty set —
    // so the query is not made at all rather than made and discarded.
    if (!access.analyst) return
    setLoading(true)
    fetchAnalytics()
      .then((data) => {
        setRaw(data)
        setError('')
      })
      .catch((err) => setError(err.message || 'Could not load analytics.'))
      .finally(() => setLoading(false))
  }, [access.analyst])

  const refresh = useCallback(() => {
    load()
    setRefreshKey((n) => n + 1)
  }, [load])

  useEffect(() => {
    load()
    // admin_audit_log only accepts writes from an analyst, and a writer
    // opening the journal is not the access this log exists to record.
    if (access.analyst) logAccess('view_dashboard')
  }, [load, access.analyst])

  const needsInteractions = INTERACTION_VIEWS.has(view)

  useEffect(() => {
    if (!needsInteractions) return undefined

    let cancelled = false
    setInteractionRaw(null)
    setInteractionError('')

    fetchBehaviour(rangeId)
      .then((data) => {
        if (!cancelled) setInteractionRaw(data)
      })
      .catch((err) => {
        if (!cancelled) setInteractionError(err.message || 'Could not load interaction data.')
      })

    return () => {
      cancelled = true
    }
  }, [needsInteractions, rangeId, refreshKey])

  // Realtime is the only view whose numbers move on their own, so it polls
  // while it is open and stops as soon as you navigate away.
  useEffect(() => {
    if (view !== 'realtime') return undefined
    const timer = setInterval(load, 20000)
    return () => clearInterval(timer)
  }, [view, load])

  // Derived, not stored: recomputing is cheap and keeps range changes from
  // needing a refetch.
  const report = useMemo(() => (raw ? buildReport(raw, rangeId) : null), [raw, rangeId])
  const realtime = useMemo(() => (raw ? buildRealtime(raw) : null), [raw])
  const behaviour = useMemo(() => buildBehaviour(interactionRaw), [interactionRaw])

  /* The chosen page, falling back to the busiest one. Resolved here rather
     than in the view so the fetch below and the panel agree on which page
     is being shown — and so a page that stops having clicks in a narrower
     date range cannot leave the panel asking for something with no data. */
  const heatmapTarget = useMemo(() => {
    const clicked = behaviour?.pages.filter((p) => p.clicks > 0) ?? []
    if (!clicked.length) return null
    return clicked.some((p) => p.path === heatmapPath) ? heatmapPath : clicked[0].path
  }, [behaviour, heatmapPath])

  useEffect(() => {
    if (view !== 'heatmap' || !heatmapTarget) return undefined

    let cancelled = false
    setHeatmap(null)
    setHeatmapError('')

    fetchHeatmap({ path: heatmapTarget, rangeId, device: heatmapDevice })
      .then((data) => {
        if (!cancelled) setHeatmap(data)
      })
      .catch((err) => {
        if (!cancelled) setHeatmapError(err.message || 'Could not load the heatmap.')
      })

    return () => {
      cancelled = true
    }
  }, [view, heatmapTarget, heatmapDevice, rangeId, refreshKey])

  const openJourney = (visitorId) => {
    setJourneyVisitor(visitorId)
    setView('journeys')
    setNavOpen(false)
    logAccess('view_visitor', visitorId)
  }

  const active = nav.find((n) => n.id === view) ?? nav[0]

  const handleSignOut = async () => {
    await signOut()
    onSignOut()
  }

  return (
    <div className={`ad-shell ad-app${navOpen ? ' is-nav-open' : ''}`}>
      <a className="ad-skip" href="#ad-main">Skip to content</a>

      {/* Backdrop only exists on small screens, where the sidebar overlays. */}
      <button
        type="button"
        className="ad-backdrop"
        aria-label="Close navigation"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      <aside className="ad-side" aria-label="Dashboard sections">
        <div className="ad-side-brand">
          <span className="ad-logo" aria-hidden="true">CR</span>
          <span className="ad-side-name">Analyst</span>
        </div>

        <nav className="ad-nav">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ad-nav-item${item.id === view ? ' is-active' : ''}`}
              aria-current={item.id === view ? 'page' : undefined}
              onClick={() => {
                setView(item.id)
                setNavOpen(false)
              }}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </button>
          ))}

          {access.analyst && <span className="ad-nav-divider" role="presentation" />}

          {access.analyst && NAV_SOON.map((item) => (
            <button key={item.id} type="button" className="ad-nav-item is-disabled" disabled
                    title="Not available yet">
              <NavIcon name={item.icon} />
              {item.label}
              <span className="ad-nav-soon">Soon</span>
            </button>
          ))}
        </nav>

        <div className="ad-side-user">
          <span className="ad-avatar" aria-hidden="true">
            {session.user.email?.charAt(0).toUpperCase()}
          </span>
          <span className="ad-side-user-text">
            <span className="ad-side-email" title={session.user.email}>{session.user.email}</span>
            <span className="ad-muted ad-small">
              {access.analyst && access.author
                ? 'Analyst · Writer'
                : access.analyst
                  ? 'Analyst'
                  : 'Writer'}
            </span>
          </span>
        </div>
      </aside>

      <div className="ad-main-col">
        <header className="ad-topbar">
          <button type="button" className="ad-btn ad-btn-quiet ad-nav-toggle" onClick={() => setNavOpen((o) => !o)}
                  aria-expanded={navOpen} aria-label="Toggle navigation">
            <span aria-hidden="true">☰</span>
          </button>

          <div className="ad-topbar-title">
            <h1 className="ad-page-title">{active.label}</h1>
            <p className="ad-muted ad-small">{active.subtitle}</p>
          </div>

          <div className="ad-topbar-actions">
            {view !== 'realtime' && view !== 'journal' && (
              <label className="ad-select-wrap">
                <span className="ad-sr">Date range</span>
                <select className="ad-select" value={rangeId} onChange={(e) => setRangeId(e.target.value)}>
                  {DATE_RANGES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </label>
            )}
            {view !== 'journal' && (
              <button type="button" className="ad-btn ad-btn-quiet" onClick={refresh} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
            <button type="button" className="ad-btn ad-btn-quiet" onClick={handleSignOut}>Sign out</button>
          </div>
        </header>

        <main className="ad-main" id="ad-main">
          {/* The journal brings its own data and its own error handling —
              it shares nothing with the analytics queries. */}
          {view === 'journal' ? (
            <JournalPanel author={access.author} />
          ) : needsInteractions ? (
            <>
              {view === 'behaviour' && (
                <BehaviourView behaviour={behaviour} error={interactionError} />
              )}
              {view === 'heatmap' && (
                <HeatmapView
                  behaviour={behaviour}
                  heatmap={heatmap}
                  path={heatmapTarget}
                  device={heatmapDevice}
                  onChangePath={setHeatmapPath}
                  onChangeDevice={setHeatmapDevice}
                  error={interactionError || heatmapError}
                />
              )}
              {view === 'scroll' && <ScrollView behaviour={behaviour} error={interactionError} />}
            </>
          ) : (
            <>
              {error && <p className="ad-alert" role="alert">{error}</p>}

              {!report && loading && <LoadingRegion label="Loading analytics" />}

              {report && (
                <>
                  {!report.hasAnyData && (
                    <p className="ad-notice">
                      No visitor data recorded yet. Tracking starts only after a visitor accepts the
                      analytics cookie, so this fills in as people browse the live site.
                    </p>
                  )}

                  {report.truncated && (
                    <p className="ad-notice">
                      Showing the most recent records only — figures describe that slice, not all time.
                    </p>
                  )}

                  {view === 'overview' && <OverviewView report={report} onOpenJourney={openJourney} />}
                  {view === 'visitors' && <VisitorsView report={report} onOpenJourney={openJourney} />}
                  {view === 'products' && <ProductsView report={report} />}
                  {view === 'funnel' && <FunnelView report={report} />}
                  {view === 'journeys' && (
                    <JourneysView report={report} selected={journeyVisitor} onSelect={setJourneyVisitor} />
                  )}
                  {view === 'realtime' && realtime && <RealtimeView realtime={realtime} />}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
