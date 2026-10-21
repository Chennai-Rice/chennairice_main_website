import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

// Who gets the staff emails: the daily 9 o'clock summary (new paid orders, cancellations,
// orders waiting, low stock). Owners and IT only (settings.manage); the backend checks again and
// rejects anything that is not an email address.
export default function AlertEmails({ say, onAuthError }) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    staffJson('/api/admin/settings')
      .then((r) => {
        const v = (r.settings.find((s) => s.key === 'staff_notify_emails')?.value || '').split(/[\s,;]+/).filter(Boolean).join('\n')
        setText(v)
        setSaved(v)
      })
      .catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
  }, [onAuthError, say])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await staffJson('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ staff_notify_emails: text }) })
      say('Order alert emails saved.')
      load()
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="wh-panel">
      <h2 className="wh-panel-title">Order alert emails</h2>
      <p className="wh-muted wh-small">
        These addresses get one summary email a day, at 9:00 am: the new paid orders (new or repeat customer, and where they came
        from), cancellations, orders waiting too long, and low stock. Nothing new and nothing waiting means no email that day.
        One address per line. Leave it empty to use the default inbox.
      </p>
      <form onSubmit={save}>
        <label className="wh-field">
          <span>Email addresses</span>
          <textarea className="wh-input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'orders@chennairiceindustries.com\nowner@chennairiceindustries.com'} />
        </label>
        <button type="submit" className="wh-btn wh-btn--primary" disabled={busy || text === saved}>{busy ? 'Saving…' : text === saved ? (saved ? 'Saved ✓' : 'Save') : 'Save'}</button>
        {text !== saved && <span className="wh-muted wh-small"> You have unsaved changes.</span>}
      </form>

    </section>
  )
}
