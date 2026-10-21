import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

const MAIL_KIND = {
  staff_new_order: 'New paid order',
  staff_order_cancelled: 'Order cancelled',
  staff_sla: 'Reminder: order waiting',
  staff_low_stock: 'Low stock',
}

// Who gets the staff emails: every new paid order, every cancellation, and the
// reminders. Owners and IT only (settings.manage); the backend checks again and
// rejects anything that is not an email address.
export default function AlertEmails({ say, onAuthError }) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [mails, setMails] = useState(null)

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

  const loadMails = useCallback(() => {
    staffJson('/api/admin/emails?staff=1&limit=50')
      .then((r) => setMails(r.emails))
      .catch(() => setMails([]))
  }, [])
  useEffect(() => { loadMails() }, [loadMails])

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await staffJson('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ staff_notify_emails: text }) })
      say('Order alert emails saved.')
      load()
      loadMails()
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
        These addresses get an email for every new paid order and every cancellation, plus the delay and low-stock reminders.
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

      <h3 className="wh-panel-title" style={{ marginTop: 24 }}>Alert emails sent</h3>
      <p className="wh-muted wh-small">
        The latest alerts the system has made. Sent means the mail server accepted it; Waiting means it is queued and will go out
        shortly; Failed shows the reason.
      </p>
      <div className="wh-mail-list" role="table" aria-label="Alert emails">
        {(mails || []).map((m) => (
          <div className="wh-mail-row" role="row" key={m.id}>
            <span role="cell" className="wh-small">{new Date(m.sent_at || m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            <span role="cell"><strong>{MAIL_KIND[m.template] || m.template}</strong><br /><span className="wh-muted wh-small">{m.subject}</span></span>
            <span role="cell" className="wh-small">{m.to_email}</span>
            <span role="cell">
              <span className={`wh-badge wh-badge--pay-${m.status === 'sent' ? 'paid' : m.status === 'failed' ? 'failed' : 'refunded'}`}>
                {m.status === 'sent' ? 'Sent' : m.status === 'failed' ? 'Failed' : 'Waiting'}
              </span>
              {m.last_error && m.status !== 'sent' && <span className="wh-muted wh-small"><br />{m.last_error}</span>}
            </span>
          </div>
        ))}
        {mails && !mails.length && <p className="wh-empty">No alert emails yet. They appear here after the next paid or cancelled order.</p>}
      </div>
    </section>
  )
}
