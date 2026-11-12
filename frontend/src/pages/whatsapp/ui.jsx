// Small shared pieces for /whatsapp: icons, status pills, numbers.

const PATHS = {
  plus: 'M12 5v14M5 12h14',
  refresh: 'M20 11a8 8 0 0 0-14.7-4.4L4 8m0-4v4h4M4 13a8 8 0 0 0 14.7 4.4L20 16m0 4v-4h-4',
  send: 'M4 12 20 4l-6 16-3-7-7-1Z',
  chat: 'M5 18.5V6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4 2.5Z',
  template: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 8v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
  megaphone: 'M4 10v4h3l7 4V6L7 10H4Zm14-1a4 4 0 0 1 0 6',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6l1-7Z',
  bot: 'M8 8h8a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Zm4-4v4M9.5 13h.01M14.5 13h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z',
  reply: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v4h16v-4',
  clip: 'M20 11.5 12.4 19a5 5 0 0 1-7.1-7.1l7.8-7.8a3.3 3.3 0 0 1 4.7 4.7l-7.8 7.8a1.7 1.7 0 0 1-2.4-2.4l7.1-7.1',
  check: 'M5 12.5 10 17l9-10',
  x: 'M6 6l12 12M18 6 6 18',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4',
  arrow: 'M7 17 17 7M9 7h8v8',
  shield: 'M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  duplicate: 'M8 8h11v12H8zM5 16V4h11',
  tag: 'M3 12V4h8l9 9-8 8-9-9Zm5-4h.01',
}

export function I({ name, size = 18, stroke = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  )
}

const STATUS = {
  DRAFT: ['Draft', 'draft'],
  PENDING: ['In review', 'pending'],
  IN_APPEAL: ['In appeal', 'pending'],
  APPROVED: ['Approved', 'ok'],
  REJECTED: ['Rejected', 'bad'],
  PAUSED: ['Paused', 'warn'],
  DISABLED: ['Disabled', 'bad'],
  PENDING_DELETION: ['Deleting', 'warn'],
}
export function StatusPill({ status }) {
  const [label, tone] = STATUS[status] || [status, 'draft']
  return <span className={`wa-pill wa-pill--${tone}`}>{label}</span>
}

export const num = (n) => Number(n || 0).toLocaleString('en-IN')
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
export const when = (d) => {
  if (!d) return ''
  const t = new Date(d)
  const mins = Math.round((Date.now() - t.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`
  return t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** WhatsApp-style formatting for a preview: *bold*, _italic_, ~strike~, line breaks. */
export function WaText({ text }) {
  // Links are left as they are (WhatsApp does not format inside them either).
  const parts = String(text || '').split(/(https?:\/\/\S+|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g)
  return parts.map((p, i) => {
    if (/^https?:\/\//.test(p)) return <span key={i} className="wa-link-text">{p}</span>
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>
    if (/^~[^~]+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>
    return <span key={i}>{p}</span>
  })
}
