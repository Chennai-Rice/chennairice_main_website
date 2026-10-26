import { Fragment, useEffect, useRef, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { Icon } from './shared.jsx'

/*
  The dashboard's assistant (Quick actions card): ask about orders, dispatch,
  stock, sales or returns in plain English or Tamil; the server answers from
  the live database (/api/admin/warehouse/assistant). Read-only — it cannot
  change anything. The conversation lives only on this page.
*/

const SUGGESTIONS = [
  'Which orders are waiting to dispatch?',
  'Any low stock?',
  'How many packs sold this week?',
  'Open returns',
]
const KEY = 'cr.wh.assistant'

/** Just enough markdown for the answers: bold, bullet lists and small tables. */
function Markdown({ text }) {
  const inline = (s) => s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part.startsWith('`') && part.endsWith('`') ? <code key={i}>{part.slice(1, -1)}</code>
        : <Fragment key={i}>{part}</Fragment>)
  const blocks = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*\|/.test(line)) {
      const rows = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++])
      i--
      const cells = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
      blocks.push(
        <div className="wa-table" key={i}><table>
          <thead><tr>{cells[0].map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
          <tbody>{cells.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
        </table></div>)
    } else if (/^\s*[-*•]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ''))
      i--
      blocks.push(<ul key={i}>{items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ul>)
    } else if (line.trim()) {
      blocks.push(<p key={i}>{inline(line.replace(/^#+\s*/, ''))}</p>)
    }
  }
  return <>{blocks}</>
}

export default function AssistantCard({ waiting, onAuthError }) {
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(KEY)) || [] } catch { return [] }
  })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [wide, setWide] = useState(false)
  const end = useRef(null)

  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(messages.slice(-20))) } catch { /* fine */ }
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, busy])

  async function ask(question) {
    const q = question.trim()
    if (!q || busy) return
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setText('')
    setBusy(true)
    try {
      const r = await staffJson('/api/admin/warehouse/assistant', {
        method: 'POST',
        body: JSON.stringify({ messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) }),
      })
      setMessages((m) => [...m, { role: 'assistant', content: r.reply }])
    } catch (err) {
      if (!onAuthError(err)) setMessages((m) => [...m, { role: 'assistant', content: err.message || 'Something went wrong.', error: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`wd-panel wd-quick wa${wide ? ' is-wide' : ''}`} aria-label="Warehouse assistant">
      <header className="wa-head">
        <h3><span className="wa-spark" aria-hidden="true">✦</span> Ask the warehouse</h3>
        <div className="wa-head-btns">
          {messages.length > 0 && <button type="button" onClick={() => setMessages([])}>Clear</button>}
          <button type="button" onClick={() => setWide((w) => !w)} aria-pressed={wide}>{wide ? 'Smaller' : 'Expand'}</button>
        </div>
      </header>

      <div className="wa-log" aria-live="polite">
        {messages.length === 0 ? (
          <>
            <p className="wa-intro">
              Ask anything about orders, dispatch, stock, sales or returns — answers come from live data.
              {waiting > 0 && <> <strong>{waiting} {waiting === 1 ? 'order is' : 'orders are'} waiting to go out.</strong></>}
            </p>
            <div className="wd-quick-chips">
              {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}
            </div>
          </>
        ) : messages.map((m, i) => (
          <div key={i} className={`wa-msg is-${m.role}${m.error ? ' is-error' : ''}`}>
            {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
          </div>
        ))}
        {busy && <div className="wa-msg is-assistant wa-typing" aria-label="Thinking"><span /><span /><span /></div>}
        <span ref={end} />
      </div>

      <form className="wd-quick-search wa-form" onSubmit={(e) => { e.preventDefault(); ask(text) }}>
        <div>
          <Icon name="search" size={17} />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask about orders, stock, sales…"
            aria-label="Ask the warehouse assistant"
            maxLength={500}
          />
          <button type="submit" aria-label="Send" disabled={busy || !text.trim()}><Icon name="chevronRight" size={18} /></button>
        </div>
      </form>
    </section>
  )
}
