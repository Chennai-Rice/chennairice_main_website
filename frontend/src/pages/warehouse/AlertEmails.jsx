import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

// Who gets the staff emails: the daily 9 o'clock summary (new paid orders, cancellations,
// orders waiting, low stock). Owners and IT only (settings.manage); the backend checks again and
// rejects anything that is not an email address.
//
// The saved addresses are listed below the box (each can be removed); the box itself is only
// for adding new ones, so it is empty after every save.
export default function AlertEmails({ say, onAuthError }) {
  const [list, setList] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    staffJson('/api/admin/settings')
      .then((r) => {
        const v = r.settings.find((s) => s.key === 'staff_notify_emails')?.value || ''
        setList(v.split(/[\s,;]+/).filter(Boolean))
      })
      .catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
  }, [onAuthError, say])
  useEffect(() => { load() }, [load])

  async function saveList(next, message) {
    setBusy(true)
    try {
      await staffJson('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ staff_notify_emails: next.join(', ') }) })
      say(message)
      setList(next)
      return true
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const typed = draft.split(/[\s,;]+/).filter(Boolean).map((e) => e.toLowerCase())
  const bad = typed.filter((e) => !EMAIL.test(e))

  async function add(e) {
    e.preventDefault()
    if (!typed.length) return
    if (bad.length) return say(`${bad[0]} does not look like an email address.`, 'error')
    const next = [...new Set([...list, ...typed])]
    if (await saveList(next, typed.length === 1 ? 'Added.' : `${typed.length} addresses added.`)) setDraft('')
  }

  return (
    <section className="wh-panel">
      <h2 className="wh-panel-title">Order alert emails</h2>
      <p className="wh-muted wh-small">
        These addresses get one summary email a day, at 9:00 am: the new paid orders (new or repeat customer, and where they came
        from), cancellations, orders waiting too long, and low stock. Nothing new and nothing waiting means no email that day.
        If the list is empty, the default inbox is used.
      </p>

      <form onSubmit={add}>
        <label className="wh-field">
          <span>Add email addresses</span>
          <textarea
            className="wh-input"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={'name@chennairiceindustries.com\n(one address per line, or several separated by commas)'}
          />
        </label>
        <button type="submit" className="wh-btn wh-btn--primary" disabled={busy || !typed.length}>{busy ? 'Saving…' : 'Add'}</button>
        {bad.length > 0 && <span className="wh-muted wh-small"> {bad[0]} does not look like an email address.</span>}
      </form>

      <h3 className="wh-panel-title" style={{ marginTop: 24 }}>Receiving the alerts ({list.length})</h3>
      {list.length === 0 && <p className="wh-muted wh-small">No addresses yet.</p>}
      <ul className="wh-alert-list">
        {list.map((email) => (
          <li key={email}>
            <span>{email}</span>
            <button
              type="button"
              className="wh-btn wh-btn--outline wh-btn--small"
              disabled={busy}
              onClick={() => saveList(list.filter((x) => x !== email), 'Removed.')}
              aria-label={`Remove ${email}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
