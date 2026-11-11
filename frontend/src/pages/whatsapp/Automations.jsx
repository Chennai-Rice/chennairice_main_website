import { useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { I, StatusPill, num } from './ui.jsx'

const FIELD_LABELS = {
  days: 'days later', daysBefore: 'days before it expires', daysAfter: 'days after delivery', hours: 'hours after the cart email',
  days5: 'days after a 5 kg order', days10: 'days after a 10 kg order', days26: 'days after a 26 kg order',
  amount: '₹ off (win-back code)', validDays: 'days the code is valid',
}
const FIELD_LABELS_BY_KEY = { winback: { days: 'days with no order' }, review: { days: 'days after delivery' }, ref_nudge: { days: 'days after the share message' } }

export default function Automations() {
  const [d, setD] = useState(null)
  const [draft, setDraft] = useState({})
  const [error, setError] = useState('')
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [testTo, setTestTo] = useState('')
  const load = () => staffJson('/api/admin/whatsapp/automations').then((x) => { setD(x); setDraft(Object.fromEntries(x.automations.map((a) => [a.key, a]))) }).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])
  if (error) return <p className="wa-alert">{error}</p>
  if (!d) return <p className="wa-muted">Loading…</p>

  const set = (key, patch) => setDraft((x) => ({ ...x, [key]: { ...x[key], ...patch } }))
  const dirty = d.automations.some((a) => JSON.stringify({ ...a, ...draft[a.key] }) !== JSON.stringify(a))
  async function save(next = draft) {
    setBusy(true)
    setNote(null)
    try {
      const body = Object.fromEntries(Object.entries(next).map(([k, a]) => [k, { on: a.on, template: a.template, ...Object.fromEntries(Object.keys(a.defaults).map((f) => [f, a[f]])) }]))
      const x = await staffJson('/api/admin/whatsapp/automations', { method: 'PUT', body: JSON.stringify(body) })
      setD(x)
      setDraft(Object.fromEntries(x.automations.map((a) => [a.key, a])))
      setNote({ text: 'Saved. They run every 10 minutes.' })
    } catch (e) { setNote({ bad: true, text: e.message }) } finally { setBusy(false) }
  }
  async function test(key) {
    setNote(null)
    try {
      const r = await staffJson(`/api/admin/whatsapp/automations/${key}/test`, { method: 'POST', body: JSON.stringify({ phone: testTo }) })
      setNote(r.error ? { bad: true, text: r.error } : { text: `Test sent to ${testTo} with the template's sample values.` })
    } catch (e) { setNote({ bad: true, text: e.message }) }
  }
  async function runNow() {
    setBusy(true)
    try {
      const r = await staffJson('/api/admin/whatsapp/automations/run', { method: 'POST' })
      setNote({ text: r.error ? r.error : `Queued: ${Object.entries(r.queued || {}).map(([k, n]) => `${k} ${n}`).join(', ') || 'nobody due'} · sent ${r.sent || 0}, held back ${r.skipped || 0}, failed ${r.failed || 0}.` })
      load()
    } catch (e) { setNote({ bad: true, text: e.message }) } finally { setBusy(false) }
  }

  const groups = [...new Set(d.automations.map((a) => a.group))]
  return (
    <>
      <div className="wa-titlebar">
        <h1>Automations</h1>
        <div className="wa-actions">
          <span className="wa-test"><input value={testTo} inputMode="numeric" placeholder="Your mobile (tests)" onChange={(e) => setTestTo(e.target.value.replace(/\D/g, '').slice(0, 10))} /></span>
          <button type="button" className="wa-btn" disabled={busy} onClick={runNow}><I name="refresh" size={16} /> Run now</button>
          <button type="button" className="wa-btn wa-btn--lime" disabled={busy || !dirty} onClick={() => save()}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        </div>
      </div>
      {note && <p className={note.bad ? 'wa-alert' : 'wa-ok'}>{note.text}</p>}
      <p className="wa-muted wa-note">
        Rules for every automation: offers only go to people who said yes to WhatsApp offers (and not STOP), at most 1 a day and 3 a week each,
        between 9 am and 8 pm India time, and not while one of their orders is on its way. Switching one on only reaches people from the last 10 days, never old customers in bulk.
      </p>
      {groups.map((g) => (
        <section key={g} className="wa-dark wa-auto-group">
          <div className="wa-dark-head"><h2>{g}</h2></div>
          <div className="wa-auto-grid">
            {d.automations.filter((a) => a.group === g).map((saved) => {
              const a = { ...saved, ...draft[saved.key] }
              const approved = d.approved.includes(a.template)
              return (
                <div key={a.key} className={'wa-auto' + (a.on ? ' is-on' : '')}>
                  <div className="wa-auto-head">
                    <div>
                      <b>{a.title}</b>
                      <small>{a.category === 'utility' ? 'Utility' : 'Marketing'} · last 30 days: {num(a.last30.sent)} sent, {num(a.last30.read)} read{a.last30.skipped ? `, ${num(a.last30.skipped)} held back` : ''}{a.last30.failed ? `, ${num(a.last30.failed)} failed` : ''}</small>
                    </div>
                    <button type="button" className={'wa-switch' + (a.on ? ' is-on' : '')} disabled={busy || (!a.on && !approved)}
                      title={!approved && !a.on ? 'Get the template approved first' : ''} onClick={() => save({ ...draft, [a.key]: { ...a, on: !a.on } })}>
                      <span className="wa-switch-knob" /> {a.on ? 'On' : 'Off'}
                    </button>
                  </div>
                  <label className="wa-auto-row">Template
                    <select value={a.template} onChange={(e) => set(a.key, { template: e.target.value })}>
                      {[...new Set([a.template, ...d.approved])].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    {approved ? <StatusPill status="APPROVED" /> : <StatusPill status={a.templateStatus === 'MISSING' ? 'DRAFT' : a.templateStatus} />}
                  </label>
                  {Object.keys(a.defaults).map((f) => (
                    <label key={f} className="wa-auto-row">
                      <input type="number" min={1} value={a[f]} onChange={(e) => set(a.key, { [f]: Number(e.target.value) })} />
                      {FIELD_LABELS_BY_KEY[a.key]?.[f] || FIELD_LABELS[f]}
                    </label>
                  ))}
                  <button type="button" className="wa-link" disabled={testTo.length !== 10 || !approved} onClick={() => test(a.key)}>Send a test to my mobile</button>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}
