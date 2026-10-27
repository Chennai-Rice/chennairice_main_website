import { useEffect, useRef, useState } from 'react'
import { staffFetch, staffJson } from '../../services/staffAuth.js'
import { Markdown } from '../warehouse/AssistantCard.jsx'
import AdvisorAnswer, { downloadCsv } from './AdvisorAnswer.jsx'
import StaffGate from './StaffGate.jsx'
import './advisor.css'

/*
  /admin → Business Advisor (Phase 1, Oct 2026): ask about the business and
  get analysis, suggestions and strategy verdicts ("Suitable / Not suitable
  for us"). Gemini 3.1 Flash-Lite on Vertex AI answers from live sales, lead,
  campaign, stock and delivery figures (server) plus this page's website
  analytics for the selected date range (sent with each question). Owner and
  IT only; a monthly ₹ limit stops it from overspending.
*/

const SUGGESTIONS = [
  'How is the business doing this month, and what should we fix first?',
  'Strategy check: 10% off on 26 kg packs for Diwali — suitable for us?',
  'Which ad campaign should get more budget, and which should we stop?',
  'Visitors come but few buy. Why, and what should we change?',
  'Which customers should we win back, and how?',
]
const KEY = 'cr.admin.advisor'
const FILES_KEY = 'cr.admin.advisor.files'
const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.csv'
const MAX_MB = 10
const MAX_FILES = 5
const ICON = { image: '🖼', pdf: '📄', docx: '📝', sheet: '📊' }
const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')

/** The website analytics the page already has, cut down to what helps advice. */
function siteSummary(report) {
  if (!report?.hasAnyData) return { note: 'No website analytics loaded for this period.' }
  const trim = (v, depth = 0) => {
    if (Array.isArray(v)) return v.slice(0, 15).map((x) => trim(x, depth + 1))
    if (v && typeof v === 'object') {
      if (depth > 4 || v instanceof Map || v instanceof Set) return undefined
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x, depth + 1)]).filter(([, x]) => x !== undefined))
    }
    return v
  }
  const { range, kpis, pageTime, funnel, devices, locations, products, audience, series } = report
  return trim({
    period: range?.label, kpis, pageTime, funnel, devices, topLocations: locations, topProducts: products, audience,
    daily: (series || []).slice(-31),
  })
}

/** The selected range as dates (IST), so business figures cover the same days. */
function rangeDates(range) {
  if (!range?.from) return {}
  const d = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  return { from: d(range.from), to: d(range.to) }
}

function Advisor({ onAuthError, report }) {
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(KEY)) || [] } catch { return [] }
  })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [usage, setUsage] = useState(null)
  const [editCap, setEditCap] = useState(false)
  const [cap, setCap] = useState('')
  const [copied, setCopied] = useState(null)
  const [printing, setPrinting] = useState(null)
  const end = useRef(null)
  const picker = useRef(null)
  // Files attached to this conversation (kept 30 days on the server; listed here for this browser session).
  const [files, setFiles] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(FILES_KEY)) || [] } catch { return [] }
  })
  const [uploading, setUploading] = useState([])
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState('')
  useEffect(() => {
    try { sessionStorage.setItem(FILES_KEY, JSON.stringify(files)) } catch { /* fine */ }
  }, [files])

  async function addFiles(list) {
    setFileError('')
    const picked = [...list]
    const room = MAX_FILES - files.length - uploading.length
    if (picked.length > room) setFileError(`Up to ${MAX_FILES} files in one conversation — start a new conversation for more.`)
    for (const file of picked.slice(0, Math.max(0, room))) {
      const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
      if (!ACCEPT.split(',').includes('.' + ext)) { setFileError(`"${file.name}": upload an image, PDF, Word (.docx), Excel (.xlsx) or CSV.`); continue }
      if (file.size > MAX_MB * 1048576) { setFileError(`"${file.name}" is over ${MAX_MB} MB.`); continue }
      setUploading((u) => [...u, file.name])
      try {
        const res = await staffFetch('/api/admin/advisor/upload?name=' + encodeURIComponent(file.name), {
          method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' },
        })
        const saved = await res.json()
        setFiles((f) => [...f, saved])
      } catch (err) {
        if (!onAuthError(err)) setFileError(err.message)
      } finally {
        setUploading((u) => u.filter((x) => x !== file.name))
      }
    }
  }
  function newConversation() {
    setMessages([])
    setFiles([])
    setFileError('')
  }

  function copy(text, i) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(i); setTimeout(() => setCopied(null), 1500) }).catch(() => {})
  }
  // Print just this answer: the print styles hide everything else while it is marked.
  function print(i) {
    setPrinting(i)
    document.body.classList.add('av-print-mode')
    setTimeout(() => {
      window.print()
      document.body.classList.remove('av-print-mode')
      setPrinting(null)
    }, 50)
  }

  useEffect(() => {
    staffJson('/api/admin/advisor/usage').then(setUsage).catch((err) => onAuthError(err))
  }, [onAuthError])
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(messages.slice(-30))) } catch { /* fine */ }
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [messages, busy])

  async function ask(question) {
    const q = question.trim()
    if (!q || busy || uploading.length) return
    const next = [...messages, { role: 'user', content: q, files: files.map((f) => f.name) }]
    setMessages(next)
    setText('')
    setBusy(true)
    try {
      const r = await staffJson('/api/admin/advisor', {
        method: 'POST',
        body: JSON.stringify({
          messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
          files: files.map((f) => f.id),
          site: siteSummary(report),
          ...rangeDates(report?.range),
        }),
      })
      setMessages((m) => [...m, { role: 'assistant', content: r.reply, answer: r.answer, costInr: r.costInr }])
      setUsage((u) => (u ? { ...u, spentInr: Math.round((u.spentInr + (r.costInr || 0)) * 100) / 100 } : u))
    } catch (err) {
      if (!onAuthError(err)) setMessages((m) => [...m, { role: 'assistant', content: err.message || 'Something went wrong.', error: true }])
    } finally {
      setBusy(false)
    }
  }

  async function saveCap(e) {
    e.preventDefault()
    try {
      setUsage(await staffJson('/api/admin/advisor/cap', { method: 'PUT', body: JSON.stringify({ capInr: Number(cap) }) }))
      setEditCap(false)
    } catch (err) {
      if (!onAuthError(err)) window.alert(err.message)
    }
  }

  const pct = usage ? Math.min(100, (usage.spentInr / usage.capInr) * 100) : 0
  return (
    <div className="av">
      <section className="av-chat" aria-label="Business Advisor">
        <div className="av-log" aria-live="polite">
          {messages.length === 0 && (
            <div className="av-welcome">
              <span className="av-badge">✦ Business Advisor</span>
              <h2>Ask about your business</h2>
              <p>
                Sales, leads, ad campaigns, customers, stock, delivery and website visitors — it reads the live
                figures and tells you what is happening, why, and what to do. Describe an idea and it will say
                whether it is <strong>suitable for Chennai Rice</strong>, and what to do instead if not.
                Attach a price list, cost sheet, distributor report or photo with 📎 and ask about it.
              </p>
              <div className="av-suggest">
                {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            m.answer ? (
              <div key={i} className={`av-msg is-assistant is-answer${printing === i ? ' is-printing' : ''}`}>
                <AdvisorAnswer answer={m.answer} />
                <div className="av-msg-tools">
                  <button type="button" onClick={() => copy(m.content, i)}>{copied === i ? 'Copied ✓' : 'Copy'}</button>
                  <button type="button" onClick={() => print(i)}>Print / Save PDF</button>
                  {(m.answer.tables?.length > 0) && (
                    <button type="button" onClick={() => m.answer.tables.forEach((t) => downloadCsv(t.title, t.columns, t.rows))}>Download tables</button>
                  )}
                  {m.costInr != null && <span>₹{m.costInr.toFixed(2)}</span>}
                </div>
              </div>
            ) : (
              <div key={i} className={`av-msg is-${m.role}${m.error ? ' is-error' : ''}`}>
                {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
                {m.files?.length > 0 && <span className="av-msg-files">📎 {m.files.join(', ')}</span>}
              </div>
            )
          ))}
          {busy && <div className="av-msg is-assistant av-typing" aria-label="Analysing"><span /><span /><span /> <em>Analysing your data…</em></div>}
          <span ref={end} />
        </div>

        {(files.length > 0 || uploading.length > 0 || fileError) && (
          <div className="av-files">
            {files.map((f) => (
              <span key={f.id} className="av-file" title={f.sheets ? f.sheets.map((x) => `${x.name}: ${x.rows} rows`).join(' · ') : f.name}>
                <span aria-hidden="true">{ICON[f.kind] || '📎'}</span>
                <span className="av-file-name">{f.name}</span>
                <small>{f.sheets ? `${f.sheets.reduce((t, x) => t + x.rows, 0).toLocaleString('en-IN')} rows` : size(f.size)}</small>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((all) => all.filter((x) => x.id !== f.id))}>×</button>
              </span>
            ))}
            {uploading.map((name) => <span key={name} className="av-file is-loading"><span className="av-spin" aria-hidden="true" />{name}<small>uploading…</small></span>)}
            {fileError && <span className="av-file-error" role="alert">{fileError}</span>}
          </div>
        )}
        <form
          className={`av-form${dragging ? ' is-dragging' : ''}`}
          onSubmit={(e) => { e.preventDefault(); ask(text) }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
        >
          <input ref={picker} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          <button type="button" className="av-attach" onClick={() => picker.current?.click()} disabled={files.length + uploading.length >= MAX_FILES}
            title="Attach images, PDF, Word, Excel or CSV (up to 5 files, 10 MB each)" aria-label="Attach files">📎</button>
          <textarea
            value={text}
            rows={2}
            maxLength={1500}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text) } }}
            placeholder={dragging ? 'Drop files to attach…' : 'Ask a question, describe a strategy, or attach a file (📎 or drag & drop)…'}
            aria-label="Ask the Business Advisor"
          />
          <button type="submit" disabled={busy || !text.trim() || uploading.length > 0}>Ask</button>
        </form>
        <p className="av-foot">
          Uses live data for {report?.range?.label?.toLowerCase() || 'the selected period'} (change it at the top).
          Read-only — it never changes anything. Check the numbers before big decisions.
          {(messages.length > 0 || files.length > 0) && <button type="button" onClick={newConversation}>New conversation</button>}
        </p>
      </section>

      {usage && (
        <aside className="av-usage" aria-label="Advisor usage this month">
          <div className="av-usage-row">
            <span>This month</span>
            <strong>₹{usage.spentInr.toFixed(2)} <small>of ₹{usage.capInr}</small></strong>
          </div>
          <div className="av-meter"><span style={{ width: pct + '%' }} className={pct > 85 ? 'is-high' : ''} /></div>
          {editCap ? (
            <form className="av-cap" onSubmit={saveCap}>
              <label>Monthly limit ₹ <input type="number" min="50" max="50000" value={cap} onChange={(e) => setCap(e.target.value)} /></label>
              <button type="submit">Save</button>
              <button type="button" onClick={() => setEditCap(false)}>Cancel</button>
            </form>
          ) : (
            <button type="button" className="av-cap-edit" onClick={() => { setCap(String(usage.capInr)); setEditCap(true) }}>Change limit</button>
          )}
          <p>Model: Gemini 3.1 Flash-Lite · about ₹0.4–0.6 a question</p>
        </aside>
      )}
    </div>
  )
}

export default function AdvisorPanel({ report }) {
  return (
    <StaffGate
      perm="analyst.view"
      title="Sign in to use the Business Advisor"
      why="The Advisor reads sales figures, so it needs your staff Google account (owner or IT team)."
      deniedText="This staff account cannot use the Business Advisor. Sign in as the owner or the IT team."
    >
      {({ onAuthError }) => <Advisor onAuthError={onAuthError} report={report} />}
    </StaffGate>
  )
}
