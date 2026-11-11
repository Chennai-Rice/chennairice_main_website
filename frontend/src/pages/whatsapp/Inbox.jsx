import { useCallback, useEffect, useRef, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { I, WaText, when } from './ui.jsx'

const VIEWS = [['all', 'All'], ['unread', 'Unread'], ['mine', 'Mine'], ['unassigned', 'Unassigned']]
const TICKS = { sent: '✓', delivered: '✓✓', read: '✓✓', failed: '!' }
const STATUS = { placed: 'Placed', confirmed: 'Confirmed', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned' }
const initials = (s) => String(s || '?').replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '#'
const hm = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

function useInterval(fn, ms) {
  const saved = useRef(fn)
  useEffect(() => { saved.current = fn }, [fn])
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) saved.current() }, ms); return () => clearInterval(id) }, [ms])
}

function TemplateSender({ phone, onSent }) {
  const [list, setList] = useState(null)
  const [id, setId] = useState('')
  const [vals, setVals] = useState({ body: [], buttons: {} })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { staffJson('/api/admin/whatsapp/templates').then((d) => setList(d.templates.filter((t) => t.status === 'APPROVED'))).catch((e) => setErr(e.message)) }, [])
  const t = list?.find((x) => x.id === id)
  const vars = t ? [...new Set([...t.model.body.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b) : []
  const dyn = t ? t.model.buttons.map((b, i) => [b, i]).filter(([b]) => (b.type === 'URL' && /\{\{1\}\}$/.test(b.url)) || b.type === 'COPY_CODE') : []
  function pick(nextId) {
    setId(nextId)
    const tt = list.find((x) => x.id === nextId)
    setVals({ body: tt ? [...tt.model.body.samples] : [], buttons: tt ? Object.fromEntries(tt.model.buttons.map((b, i) => [i, b.sample || ''])) : {} })
  }
  async function send() {
    setBusy(true)
    setErr('')
    try {
      await staffJson(`/api/admin/whatsapp/chats/${encodeURIComponent(phone)}/template`, { method: 'POST', body: JSON.stringify({ templateId: id, values: vals }) })
      onSent()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  if (!list) return <p className="wa-muted">{err || 'Loading templates…'}</p>
  if (!list.length) return <p className="wa-muted">No approved templates yet. Submit one in Templates.</p>
  return (
    <div className="wa-tsend">
      <select value={id} onChange={(e) => pick(e.target.value)}>
        <option value="">Choose an approved template…</option>
        {list.map((x) => <option key={x.id} value={x.id}>{x.name}{x.purpose ? ` — ${x.purpose}` : ''}</option>)}
      </select>
      {t && (
        <>
          <p className="wa-tsend-preview"><WaText text={t.model.body.text.replace(/\{\{(\d+)\}\}/g, (a, d) => vals.body[Number(d) - 1] || a)} /></p>
          <div className="wa-samples">
            {vars.map((v) => (
              <label key={v}><span>{`{{${v}}}`}</span>
                <input value={vals.body[v - 1] || ''} onChange={(e) => { const body = [...vals.body]; body[v - 1] = e.target.value; setVals({ ...vals, body }) }} />
              </label>
            ))}
            {dyn.map(([b, i]) => (
              <label key={'b' + i}><span>{b.type === 'COPY_CODE' ? 'code' : 'link end'}</span>
                <input value={vals.buttons[i] || ''} onChange={(e) => setVals({ ...vals, buttons: { ...vals.buttons, [i]: e.target.value } })} />
              </label>
            ))}
          </div>
          <button type="button" className="wa-btn wa-btn--lime" disabled={busy} onClick={send}><I name="send" size={14} /> {busy ? 'Sending…' : 'Send template'}</button>
        </>
      )}
      {err && <p className="wa-alert">{err}</p>}
    </div>
  )
}

function Chat({ phone, onChanged }) {
  const [c, setC] = useState(null)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [quick, setQuick] = useState([])
  const [showQuick, setShowQuick] = useState(false)
  const [showTemplate, setShowTemplate] = useState(false)
  const [tagText, setTagText] = useState('')
  const end = useRef(null)
  const load = useCallback(() => staffJson(`/api/admin/whatsapp/chats/${encodeURIComponent(phone)}`).then((d) => { setC(d); setError('') }).catch((e) => setError(e.message)), [phone])
  useEffect(() => { setC(null); load() }, [load])
  useEffect(() => { staffJson('/api/admin/whatsapp/quick-replies').then(setQuick).catch(() => {}) }, [])
  useInterval(load, 5000)
  const count = c?.messages.length
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [count])

  async function act(fn) {
    setBusy(true)
    setError('')
    try { await fn(); await load(); onChanged() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const put = (body) => act(() => staffJson(`/api/admin/whatsapp/chats/${encodeURIComponent(phone)}`, { method: 'PUT', body: JSON.stringify(body) }))
  const send = () => act(async () => {
    await staffJson(`/api/admin/whatsapp/chats/${encodeURIComponent(phone)}/reply`, { method: 'POST', body: JSON.stringify({ text }) })
    setText('')
  })
  if (!c) return <div className="wa-chat"><p className="wa-empty">{error || 'Loading…'}</p></div>
  const left = c.windowEndsAt ? Math.max(0, new Date(c.windowEndsAt) - Date.now()) : 0
  const leftText = left > 3600e3 ? `${Math.floor(left / 3600e3)} h left to reply` : `${Math.ceil(left / 60e3)} min left to reply`

  return (
    <div className="wa-chat">
      <div className="wa-chat-head">
        <span className="wa-av wa-av--in">{initials(c.name || c.phone.slice(-2))}</span>
        <div className="wa-chat-who">
          <b>{c.name || c.phone}</b>
          <small>{c.phone} · {c.windowOpen ? <span className="wa-window">⏱ {leftText}</span> : <span className="wa-window wa-window--closed">24-hour window closed: template only</span>}</small>
        </div>
        <select value={c.assignedTo || ''} onChange={(e) => put({ assignedTo: e.target.value || null })} disabled={busy} title="Assign">
          <option value="">Unassigned</option>
          {c.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {c.status === 'open'
          ? <button type="button" className="wa-btn wa-btn--small" disabled={busy} onClick={() => put({ status: 'resolved' })}><I name="check" size={14} /> Resolve</button>
          : <button type="button" className="wa-btn wa-btn--small" disabled={busy} onClick={() => put({ status: 'open' })}>Reopen</button>}
      </div>
      {c.botPausedUntil && (
        <p className="wa-botbar">🤖 Bot is paused here until {hm(c.botPausedUntil)} so you can reply. <button type="button" className="wa-link" onClick={() => put({ bot: 'resume' })}>Turn the bot back on</button></p>
      )}
      <div className="wa-thread">
        {c.messages.map((m) => (
          <div key={m.id} className={'wa-msg wa-msg--' + m.direction}>
            <div className="wa-msg-bubble">
              {m.source && m.direction === 'out' && <span className="wa-msg-src">{m.source === 'bot' ? '🤖 Bot' : m.source === 'inbox' ? 'Team' : m.template || m.source}</span>}
              <WaText text={m.body || `[${m.kind}]`} />
              <span className="wa-msg-meta">{hm(m.at)} {m.direction === 'out' && <b className={'wa-tick wa-tick--' + m.status}>{TICKS[m.status] || ''}</b>}</span>
              {m.error && <small className="wa-msg-err">{m.error}</small>}
            </div>
          </div>
        ))}
        <span ref={end} />
      </div>
      {error && <p className="wa-alert">{error}</p>}
      {c.windowOpen && !showTemplate ? (
        <div className="wa-composer">
          {showQuick && (
            <div className="wa-quick">
              {quick.length === 0 && <p className="wa-muted">No quick replies yet. Add them below the customer details.</p>}
              {quick.map((q) => <button key={q.id} type="button" onClick={() => { setText(q.body); setShowQuick(false) }}><b>/{q.title}</b> {q.body.slice(0, 80)}</button>)}
            </div>
          )}
          <button type="button" className="wa-round wa-round--small" title="Quick replies" onClick={() => setShowQuick((x) => !x)}><I name="bolt" size={14} /></button>
          <button type="button" className="wa-round wa-round--small" title="Send a template" onClick={() => setShowTemplate(true)}><I name="template" size={14} /></button>
          <textarea rows={2} value={text} placeholder="Type a reply… (Enter to send, Shift+Enter for a new line)" disabled={busy}
            onChange={(e) => { setText(e.target.value); setShowQuick(e.target.value.startsWith('/')) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) send() } }} />
          <button type="button" className="wa-btn wa-btn--lime" disabled={busy || !text.trim()} onClick={send}><I name="send" size={14} /> Send</button>
        </div>
      ) : (
        <div className="wa-composer wa-composer--template">
          <TemplateSender phone={c.phone} onSent={() => { setShowTemplate(false); load(); onChanged() }} />
          {c.windowOpen && <button type="button" className="wa-link" onClick={() => setShowTemplate(false)}>Back to a normal reply</button>}
        </div>
      )}

      <aside className="wa-side">
        <h3>Customer</h3>
        <p className="wa-side-perm">
          WhatsApp offers: {c.optedOutAt ? <b className="wa-red">said STOP</b> : c.optedInAt ? <b className="wa-green">yes</b> : <span>not asked</span>}
        </p>
        <h4>Orders</h4>
        {c.customer.orders.length === 0 ? <p className="wa-muted">No orders on this number.</p> : (
          <ul className="wa-side-list">
            {c.customer.orders.map((o) => <li key={o.number}><b>{o.number}</b><span>{STATUS[o.status] || o.status}{o.total ? ` · ${o.total}` : ''} · {when(o.at)}</span></li>)}
          </ul>
        )}
        {c.customer.spin && <><h4>Spin & Win</h4><p>{c.customer.spin.prize}{c.customer.spin.code ? ` · ${c.customer.spin.code}` : ''} {c.customer.spin.used ? '(used)' : ''}</p></>}
        {c.customer.referralCode && <><h4>Referral code</h4><p>{c.customer.referralCode}</p></>}
        <h4>Tags</h4>
        <div className="wa-tags">
          {c.tags.map((t) => <span key={t} className="wa-tag">{t} <button type="button" onClick={() => act(() => staffJson(`/api/admin/whatsapp/contacts/${c.phone}/tags`, { method: 'PUT', body: JSON.stringify({ tags: c.tags.filter((x) => x !== t) }) }))}>×</button></span>)}
          <form onSubmit={(e) => { e.preventDefault(); if (tagText.trim()) act(() => staffJson(`/api/admin/whatsapp/contacts/${c.phone}/tags`, { method: 'PUT', body: JSON.stringify({ tags: [...c.tags, tagText] }) })).then(() => setTagText('')) }}>
            <input value={tagText} placeholder="+ tag" onChange={(e) => setTagText(e.target.value)} />
          </form>
        </div>
        <h4>Notes (team only)</h4>
        <form className="wa-note-form" onSubmit={(e) => { e.preventDefault(); if (note.trim()) act(() => staffJson(`/api/admin/whatsapp/chats/${encodeURIComponent(c.phone)}/notes`, { method: 'POST', body: JSON.stringify({ body: note }) })).then(() => setNote('')) }}>
          <textarea rows={2} value={note} placeholder="Add a note" onChange={(e) => setNote(e.target.value)} />
          <button type="submit" className="wa-btn wa-btn--small" disabled={busy || !note.trim()}>Add</button>
        </form>
        <ul className="wa-notes">{c.notes.map((n) => <li key={n.id}><p>{n.body}</p><small>{n.by || 'Team'} · {when(n.at)}</small></li>)}</ul>
        <QuickReplies list={quick} onChange={setQuick} />
      </aside>
    </div>
  )
}

function QuickReplies({ list, onChange }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')
  const save = async () => {
    try { onChange(await staffJson('/api/admin/whatsapp/quick-replies', { method: 'POST', body: JSON.stringify({ title, body }) })); setTitle(''); setBody(''); setErr('') } catch (e) { setErr(e.message) }
  }
  return (
    <div className="wa-qr">
      <button type="button" className="wa-link" onClick={() => setOpen((x) => !x)}>{open ? 'Hide' : 'Manage'} quick replies ({list.length})</button>
      {open && (
        <>
          <ul>{list.map((q) => <li key={q.id}><b>/{q.title}</b> {q.body.slice(0, 60)} <button type="button" onClick={async () => onChange(await staffJson(`/api/admin/whatsapp/quick-replies/${q.id}`, { method: 'DELETE' }))}>×</button></li>)}</ul>
          <input value={title} placeholder="Name, e.g. price" onChange={(e) => setTitle(e.target.value.replace(/\s+/g, '-').toLowerCase())} />
          <textarea rows={2} value={body} placeholder="The text" onChange={(e) => setBody(e.target.value)} />
          <button type="button" className="wa-btn wa-btn--small" onClick={save} disabled={!title || !body}>Save quick reply</button>
          {err && <p className="wa-alert">{err}</p>}
        </>
      )}
    </div>
  )
}

export default function Inbox() {
  const [view, setView] = useState('all')
  const [status, setStatus] = useState('open')
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(null)
  const load = useCallback(() => {
    const p = new URLSearchParams({ view, status, q })
    return staffJson('/api/admin/whatsapp/chats?' + p).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message))
  }, [view, status, q])
  useEffect(() => { load() }, [load])
  useInterval(load, 8000)

  return (
    <>
      <div className="wa-titlebar">
        <h1>Inbox</h1>
        <div className="wa-actions">
          <div className="wa-seg">
            {[['open', `Open ${data?.counts?.open ?? ''}`], ['resolved', 'Resolved'], ['all', 'All']].map(([id, label]) => (
              <button key={id} type="button" className={status === id ? 'is-on' : ''} onClick={() => setStatus(id)}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      {error && <p className="wa-alert">{error}</p>}
      <section className="wa-dark wa-dark--tabs">
        <div className="wa-tabs-notch">
          {VIEWS.map(([id, label]) => (
            <button key={id} type="button" className={view === id ? 'is-on' : ''} onClick={() => setView(id)}>
              {label}{id === 'mine' && data ? <span className="wa-count">{data.counts.mine}</span> : null}{id === 'unassigned' && data ? <span className="wa-count">{data.counts.unassigned}</span> : null}
            </button>
          ))}
        </div>
        <div className="wa-inbox">
          <div className="wa-inbox-list">
            <div className="wa-search wa-search--dark"><I name="search" size={16} /><input value={q} placeholder="Search name or number" onChange={(e) => setQ(e.target.value)} /></div>
            <ul className="wa-list">
              {!data && <li className="wa-empty">Loading…</li>}
              {data?.chats.length === 0 && <li className="wa-empty">No chats here.</li>}
              {data?.chats.map((c) => (
                <li key={c.phone}>
                  <button type="button" className={'wa-row wa-row--btn wa-row--chat' + (sel === c.phone ? ' is-on' : '')} onClick={() => setSel(c.phone)}>
                    <span className="wa-av wa-av--in">{initials(c.name || c.phone.slice(-2))}</span>
                    <span className="wa-row-main">
                      <b>{c.name || c.phone}</b>
                      <span className="wa-row-text">{c.lastDirection === 'out' ? '↩ ' : ''}{c.last}</span>
                    </span>
                    <span className="wa-row-side">
                      <small>{when(c.lastAt)}</small>
                      {c.unread > 0 && <span className="wa-unread">{c.unread}</span>}
                      {c.assignedName && <small className="wa-assigned">{c.assignedName.split(' ')[0]}</small>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {sel ? <Chat key={sel} phone={sel} onChanged={load} /> : <div className="wa-chat"><p className="wa-empty">Choose a chat.</p></div>}
        </div>
      </section>
    </>
  )
}
