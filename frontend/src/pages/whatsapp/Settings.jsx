import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { I, when } from './ui.jsx'

const Tick = ({ ok, children }) => (
  <li className={ok ? 'is-ok' : 'is-no'}><span className="wa-tick">{ok ? <I name="check" size={14} /> : <I name="x" size={14} />}</span>{children}</li>
)

export default function Settings() {
  const [s, setS] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState(null)
  const [copied, setCopied] = useState(false)
  const load = useCallback(() => staffJson('/api/admin/whatsapp/settings').then(setS).catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  async function run(label, fn, ok) {
    setBusy(label)
    setNote(null)
    try {
      await fn()
      await load()
      if (ok) setNote({ text: ok })
    } catch (err) {
      setNote({ bad: true, text: err.message })
    } finally {
      setBusy('')
    }
  }

  if (error) return <p className="wa-alert">{error}</p>
  if (!s) return <p className="wa-muted">Loading…</p>
  const phone = s.account?.phone || {}
  const waba = s.account?.waba || {}
  const allSecrets = s.secrets.token && s.secrets.appSecret && s.secrets.verifyToken

  return (
    <>
      <div className="wa-titlebar"><h1>Settings</h1></div>
      {note && <p className={note.bad ? 'wa-alert' : 'wa-ok'}>{note.text}</p>}
      <div className="wa-settings">
        <section className="wa-card">
          <h2 className="wa-h2">Connection</h2>
          <ul className="wa-checks">
            <Tick ok={s.secrets.token}>Access token (WHATSAPP_TOKEN)</Tick>
            <Tick ok={s.secrets.appSecret}>App secret (WHATSAPP_APP_SECRET)</Tick>
            <Tick ok={s.secrets.verifyToken}>Verify token (WHATSAPP_VERIFY_TOKEN)</Tick>
            <Tick ok={!phone.error && !!phone.display_phone_number}>Phone number {phone.display_phone_number ? `${phone.display_phone_number} · ${phone.verified_name || ''}` : phone.error || ''}</Tick>
            <Tick ok={phone.name_status === 'APPROVED' || phone.name_status === 'AVAILABLE_WITHOUT_REVIEW'}>Display name {phone.name_status ? `(${phone.name_status.toLowerCase().replaceAll('_', ' ')})` : ''}</Tick>
          </ul>
          <form className="wa-idform" onSubmit={(e) => {
            e.preventDefault()
            const id = new FormData(e.currentTarget).get('waba').trim()
            run('waba', () => staffJson('/api/admin/whatsapp/settings', { method: 'PUT', body: JSON.stringify({ wabaId: id }) }), 'Account ID saved.')
          }}>
            <label>
              <span>WhatsApp Business Account ID</span>
              <input name="waba" defaultValue={s.ids.waba} inputMode="numeric" key={s.ids.waba} />
            </label>
            <button type="submit" className="wa-btn wa-btn--small" disabled={!!busy}>{busy === 'waba' ? 'Saving…' : 'Save'}</button>
            <small className="wa-muted">Find it in WhatsApp Manager (business.facebook.com/wa/manage): the address bar ends with <b>waba_id=</b> followed by the number. Choose the account with +91 70666 46667.</small>
          </form>
          <details className="wa-meta-raw">
            <summary>What Meta says</summary>
            <pre>{JSON.stringify({ sendsTo: s.metaWebhook, appsOnAccount: s.metaApps, account: s.account?.waba, phone: s.account?.phone, lookup: s.wabaLookup }, null, 2)}</pre>
          </details>
          {s.wabaLookup && !s.wabaLookup.found && (
            <div className="wa-alert">
              <b>The token cannot reach the WhatsApp account that holds this number.</b>{' '}
              In business.facebook.com → Settings → Users → System users → <b>Chennai Rice Messaging</b> (or the user the token was made from) →
              Assign assets → WhatsApp accounts → tick the account with +91 70666 46667 → <b>Full control</b>. Then reload this page.
              {s.wabaLookup.accounts?.length > 0 && (
                <> Accounts the token can reach now: {s.wabaLookup.accounts.map((a) => `${a.id} (${(a.phones || []).map((p) => p.number).join(', ') || 'no numbers'})`).join('; ')}.</>
              )}
              {s.wabaLookup.error && <> ({s.wabaLookup.error})</>}
            </div>
          )}
          {!allSecrets &&<p className="wa-muted">Set the missing secrets with <code>npx firebase functions:secrets:set NAME</code>, then deploy.</p>}
          <dl className="wa-dl">
            <dt>WhatsApp account</dt><dd>{waba.name || '—'} · {s.ids.waba}</dd>
            <dt>Phone number ID</dt><dd>{s.ids.phone}</dd>
            <dt>Quality</dt><dd>{phone.quality_rating || '—'}</dd>
            <dt>Daily limit</dt><dd>{phone.messaging_limit_tier || '—'}</dd>
            <dt>Billing currency</dt><dd>{waba.currency || '—'}</dd>
          </dl>
        </section>

        <section className="wa-card">
          <h2 className="wa-h2">Webhook (messages and delivery reports)</h2>
          <p className="wa-muted">In Meta (developers.facebook.com → your app → WhatsApp → Configuration → Webhook → Edit) paste:</p>
          <div className="wa-copybox">
            <code>{s.webhookUrl}</code>
            <button type="button" className="wa-btn wa-btn--small" onClick={() => { navigator.clipboard?.writeText(s.webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
              <I name="copy" size={14} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="wa-muted">Verify token: the phrase you saved as WHATSAPP_VERIFY_TOKEN. Then press <b>Verify and save</b>, and under Webhook fields subscribe to <b>messages</b>, <b>message_template_status_update</b>, <b>message_template_quality_update</b>, <b>phone_number_quality_update</b> and <b>account_update</b>.</p>
          <ul className="wa-checks">
            <Tick ok={s.subscribed === true}>Our app receives this account's webhooks {s.subscribed === null ? '(unknown)' : ''}</Tick>
            <Tick ok={!!s.lastWebhookAt}>Last call from Meta: {s.lastWebhookAt ? when(s.lastWebhookAt) : 'none yet'}</Tick>
          </ul>
          {s.subscribed !== true && (
            <button type="button" className="wa-btn wa-btn--lime" disabled={!!busy || !s.secrets.token}
              onClick={() => run('hook', () => staffJson('/api/admin/whatsapp/webhook/connect', { method: 'POST' }), 'Connected: Meta will now send this account\'s messages to the website.')}>
              {busy === 'hook' ? 'Connecting…' : 'Connect this account to the webhook'}
            </button>
          )}
        </section>

        <section className="wa-card">
          <h2 className="wa-h2">Order messages ("order placed")</h2>
          <p className="wa-muted">Which route sends the WhatsApp message when a customer pays. Switch to your own number once Meta has approved the <b>order_placed</b> template (now: <b>{s.orderTemplate.toLowerCase()}</b>).</p>
          <div className="wa-seg wa-seg--light">
            <button type="button" className={s.orderVia === 'askeva' ? 'is-on' : ''} disabled={!!busy}
              onClick={() => run('via', () => staffJson('/api/admin/whatsapp/settings', { method: 'PUT', body: JSON.stringify({ orderVia: 'askeva' }) }), 'Order messages go through AskEva.')}>
              AskEva {s.askeva ? '' : '(no token)'}
            </button>
            <button type="button" className={s.orderVia === 'cloud' ? 'is-on' : ''} disabled={!!busy || s.orderTemplate !== 'APPROVED'}
              onClick={() => run('via', () => staffJson('/api/admin/whatsapp/settings', { method: 'PUT', body: JSON.stringify({ orderVia: 'cloud' }) }), 'Order messages now go from your own number.')}>
              Your number (Cloud API)
            </button>
          </div>
        </section>
      </div>
    </>
  )
}
