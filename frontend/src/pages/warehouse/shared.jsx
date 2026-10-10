// Shared bits for the warehouse panel: labels, date formatting, icons and
// the local preferences the Settings page edits.

export const PAYMENT = { paid: 'Paid', refunded: 'Refunded', partially_refunded: 'Part refunded', pending: 'Pending', failed: 'Failed' }

export const STATUS = {
  placed: 'To Dispatch', confirmed: 'To Dispatch', packed: 'To Dispatch', shipped: 'Dispatched',
  delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned',
}
export const STATUS_KEY = {
  placed: 'todispatch', confirmed: 'todispatch', packed: 'todispatch', shipped: 'dispatched',
  delivered: 'delivered', cancelled: 'cancelled', returned: 'cancelled',
}
export const NOT_DISPATCHED = ['placed', 'confirmed', 'packed']

/** YYYY-MM-DD for a day offset from today, in India. */
export function istDay(offset = 0) {
  return new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** "Today" / "Yesterday" for recent dates (flagged as recent), the date otherwise. */
export function dayLabel(iso) {
  if (!iso) return { text: '', recent: false }
  const day = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  if (day === istDay(0)) return { text: 'Today', recent: true }
  if (day === istDay(-1)) return { text: 'Yesterday', recent: true }
  return {
    text: new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
    recent: false,
  }
}

export const timeLabel = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : ''

export const telHref = (phone) => 'tel:' + String(phone || '').replace(/[^\d+]/g, '')

// ---- preferences (this browser only) ----
const PREFS_KEY = 'cr.wh.prefs'
export const DEFAULT_PREFS = { pageSize: 10, autoRefresh: true, sort: 'newest' }

export function readPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}
export function writePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* storage blocked: preferences last until reload */
  }
}

// ---- icons: one stroke style, 24px grid ----
const PATHS = {
  orders: 'M7 3.5h10a2 2 0 012 2v13a2 2 0 01-2 2H7a2 2 0 01-2-2v-13a2 2 0 012-2zM8.5 8h7M8.5 12h7M8.5 16h4',
  truck: 'M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.2v2.8h-7M6 18.5a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM17 18.5a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6z',
  delivered: 'M4.5 4.5h15v15h-15zM8.5 12l2.5 2.5 4.5-5',
  returns: 'M12 4.5a7.5 7.5 0 11-7.2 9.6M4.5 4.5v5h5M12 8.5v4l2.5 1.5',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.5a3.5 3.5 0 010 6.8M18 14.8c1.9.6 3.2 2.5 3.5 5.2',
  reports: 'M4 4v16h16M8 16v-4M12 16V8M16 16v-6',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.2a1.6 1.6 0 00-2.7-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 004.6 15H4.5a2 2 0 110-4h.1a1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0011.2 4V3.9a2 2 0 114 0V4a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1A1.6 1.6 0 0019.6 10h.1a2 2 0 110 4h-.2z',
  building: 'M4 20.5h16M6 20.5V8l6-4 6 4v12.5M10 20.5v-5h4v5M9.5 10.5h1M13.5 10.5h1',
  bell: 'M6 10a6 6 0 1112 0c0 5 2 6.5 2 6.5H4S6 15 6 10zM10 19.5a2 2 0 004 0',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20.5c.8-3.8 3.9-6 7.5-6s6.7 2.2 7.5 6',
  logout: 'M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h10',
  chevron: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  download: 'M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15',
  calendar: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4',
  reset: 'M4.5 12a7.5 7.5 0 102.2-5.3M4.5 4.5v4h4',
  print: 'M7 9V4h10v5M7 17H4.5v-7h15v7H17M7 14h10v6H7z',
  more: 'M12 5.5h.01M12 12h.01M12 18.5h.01',
  pin: 'M12 21s6.5-5.6 6.5-11a6.5 6.5 0 10-13 0c0 5.4 6.5 11 6.5 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  cancel: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9 9l6 6M15 9l-6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  copy: 'M9 9h10v11H9zM6 15H4.5V4h10.5v1.5',
  phone: 'M6.5 3.5h3l1.5 4-2 1.5a12 12 0 006 6l1.5-2 4 1.5v3c0 1-.8 1.8-1.8 1.7A16.5 16.5 0 014.8 5.3c-.1-1 .7-1.8 1.7-1.8z',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  undo: 'M9 14L4.5 9.5 9 5M4.5 9.5h9a6 6 0 010 12h-3',
  refresh: 'M19.5 12a7.5 7.5 0 11-2.2-5.3M19.5 4.5v4h-4',
}

export function Icon({ name, size = 20, className = '', strokeWidth = 1.7 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Page numbers with gaps: 1 … 4 5 6 … 12 */
export function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out = [1]
  const from = Math.max(2, page - 1)
  const to = Math.min(pages - 1, page + 1)
  if (from > 2) out.push('…')
  for (let p = from; p <= to; p++) out.push(p)
  if (to < pages - 1) out.push('…')
  out.push(pages)
  return out
}

export function Pagination({ page, pages, total, from, to, onPage, noun = 'orders' }) {
  return (
    <div className="wh-pager">
      <span className="wh-pager-info">
        {total ? `Showing ${from} to ${to} of ${total} ${noun}` : `No ${noun}`}
      </span>
      {pages > 1 && (
        <nav className="wh-pager-pages" aria-label="Pages">
          <button type="button" className="wh-page" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <Icon name="chevronLeft" size={16} />
          </button>
          {pageList(page, pages).map((p, i) =>
            p === '…' ? (
              <span key={'gap' + i} className="wh-page-gap">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={`wh-page${p === page ? ' is-current' : ''}`}
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPage(p)}
              >
                {p}
              </button>
            )
          )}
          <button type="button" className="wh-page" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
            <Icon name="chevronRight" size={16} />
          </button>
        </nav>
      )}
    </div>
  )
}

/** Small "are you sure" dialog for actions that change many orders at once. */
export function Confirm({ title, body, confirmLabel, danger, onConfirm, onCancel, busy }) {
  return (
    <div className="wh-modal-backdrop" onClick={onCancel}>
      <div className="wh-modal" role="dialog" aria-modal="true" aria-labelledby="wh-confirm-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="wh-confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="wh-modal-actions">
          <button type="button" className="wh-btn wh-btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={`wh-btn ${danger ? 'wh-btn--danger' : 'wh-btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
