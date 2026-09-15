import React, { useMemo, useState } from 'react'
import { formatPercent } from '../../../services/admin.service.js'

/**
 * Shared presentational pieces for the dashboard. Everything here is
 * stateless apart from local UI concerns (sort order, search text) — all
 * analytics logic lives in src/services/admin.service.js.
 */

/* ------------------------------------------------------------ primitives */

export function Card({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`ad-card ${className}`.trim()}>
      {(title || actions) && (
        <header className="ad-card-head">
          <div>
            {title && <h2 className="ad-card-title">{title}</h2>}
            {subtitle && <p className="ad-card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="ad-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function EmptyState({ title, note }) {
  return (
    <div className="ad-empty">
      <p className="ad-empty-title">{title}</p>
      {note && <p className="ad-empty-note">{note}</p>}
    </div>
  )
}

export function Skeleton({ rows = 3, height = 16 }) {
  return (
    <div className="ad-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} style={{ height }} />
      ))}
    </div>
  )
}

/** Screen-reader-friendly status while a region is loading. */
export function LoadingRegion({ label = 'Loading' }) {
  return (
    <div role="status" aria-live="polite">
      <span className="ad-sr">{label}</span>
      <Skeleton rows={4} />
    </div>
  )
}

/* ---------------------------------------------------------------- metric */

/**
 * A KPI tile. `change` is a percentage or null; null renders a dash rather
 * than a fabricated "+100%", because a rise from zero has no meaningful
 * percentage and reads as a real trend when it isn't one.
 */
export function MetricCard({ label, value, change, icon, tone = 'visitors', spark }) {
  // Three states, deliberately distinct:
  //   undefined -> this metric has no comparison at all (a live count, a
  //                fixed setting). No footer is drawn.
  //   null      -> a comparison applies but the previous period held nothing.
  //   number    -> a real change.
  const comparable = change !== undefined
  const dir = change == null ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat'

  return (
    <div className="ad-metric">
      <div className="ad-metric-top">
        <span className="ad-metric-label">{label}</span>
        {icon && <span className={`ad-metric-icon ad-metric-icon--${tone}`} aria-hidden="true">{icon}</span>}
      </div>
      <span className="ad-metric-value">{value}</span>
      {comparable && (
        <div className="ad-metric-foot">
          {change == null ? (
            <span className="ad-delta ad-delta-flat">No prior period</span>
          ) : (
            <span className={`ad-delta ad-delta-${dir}`}>
              <span aria-hidden="true">{dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'}</span>
              {formatPercent(Math.abs(change), 0)}
              <span className="ad-delta-note">vs previous</span>
            </span>
          )}
        </div>
      )}
      {spark}
    </div>
  )
}

/* ----------------------------------------------------------------- table */

/**
 * Sortable, searchable table.
 *
 * `columns` entries: { key, header, render?, sortValue?, align?, mono? }
 * Sorting uses sortValue when given so a formatted cell ("2m 8s") still
 * sorts by its underlying number.
 */
export function DataTable({
  columns,
  rows,
  rowKey,
  searchable = false,
  searchKeys = [],
  searchPlaceholder = 'Search…',
  pageSize = 0,
  initialSort = null,
  emptyTitle = 'Nothing to show yet',
  emptyNote,
}) {
  const [sort, setSort] = useState(initialSort)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    if (!query.trim()) return rows
    const q = query.trim().toLowerCase()
    return rows.filter((row) =>
      searchKeys.some((key) => String(row[key] ?? '').toLowerCase().includes(q))
    )
  }, [rows, query, searchKeys])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return filtered
    const value = (row) => (col.sortValue ? col.sortValue(row) : row[col.key])
    return [...filtered].sort((a, b) => {
      const av = value(a)
      const bv = value(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort, columns])

  const totalPages = pageSize ? Math.ceil(sorted.length / pageSize) : 1
  // Clamped rather than stored: filtering down to fewer pages while sitting
  // on a later one would otherwise render an empty table.
  const current = Math.min(page, Math.max(0, totalPages - 1))
  const visible = pageSize ? sorted.slice(current * pageSize, current * pageSize + pageSize) : sorted

  const toggleSort = (key) => {
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
    )
  }

  return (
    <div className="ad-table-block">
      {searchable && (
        <div className="ad-table-tools">
          <input
            type="search"
            className="ad-input"
            value={query}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
          <span className="ad-table-count">
            {sorted.length} {sorted.length === 1 ? 'row' : 'rows'}
          </span>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title={emptyTitle} note={emptyNote} />
      ) : (
        <>
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  {columns.map((col) => {
                    const active = sort?.key === col.key
                    return (
                      <th
                        key={col.key}
                        className={col.align === 'right' ? 'ad-right' : undefined}
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        {col.sortable === false ? (
                          col.header
                        ) : (
                          <button type="button" className="ad-th-btn" onClick={() => toggleSort(col.key)}>
                            {col.header}
                            <span className={`ad-sort${active ? ' is-active' : ''}`} aria-hidden="true">
                              {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                            </span>
                          </button>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={rowKey(row)}>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={[col.align === 'right' ? 'ad-right' : '', col.mono ? 'ad-mono' : '']
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageSize > 0 && totalPages > 1 && (
            <div className="ad-pager">
              <button
                type="button"
                className="ad-btn ad-btn-quiet"
                onClick={() => setPage(current - 1)}
                disabled={current === 0}
              >
                Previous
              </button>
              <span className="ad-pager-info">
                Page {current + 1} of {totalPages}
              </span>
              <button
                type="button"
                className="ad-btn ad-btn-quiet"
                onClick={() => setPage(current + 1)}
                disabled={current >= totalPages - 1}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- pieces */

/** Horizontal proportion bar — used for locations and device shares. */
export function BarRow({ label, count, percent, muted }) {
  return (
    <div className="ad-bar-row">
      <div className="ad-bar-head">
        <span className={muted ? 'ad-muted' : undefined}>{label}</span>
        <span className="ad-bar-val">
          {count} <span className="ad-muted">· {percent.toFixed(1)}%</span>
        </span>
      </div>
      <div className="ad-bar-track">
        <div className="ad-bar-fill" style={{ width: `${Math.max(percent, 1.5)}%` }} />
      </div>
    </div>
  )
}

export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className="ad-segmented" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`ad-seg${opt.id === value ? ' is-active' : ''}`}
          aria-pressed={opt.id === value}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
