import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { Icon } from './shared.jsx'

// Who can sign in to /warehouse, and with what role. Owners and admins only
// (staff.manage); the backend enforces the same rules again.
const ROLES = [
  { key: 'warehouse', label: 'Warehouse staff', note: 'Orders to dispatch, tracking upload. No prices.' },
  { key: 'dispatch', label: 'Dispatch', note: 'Packing, dispatch and deliveries.' },
  { key: 'sales', label: 'Sales', note: 'Orders, customers, cancellations and refunds.' },
  { key: 'inventory', label: 'Inventory', note: 'Stock, products and prices.' },
  { key: 'plant', label: 'Plant', note: 'Production batches (no warehouse panel).' },
  { key: 'admin', label: 'Warehouse Admin', note: 'Everything, including money and the team.' },
  { key: 'owner', label: 'Owner', note: 'Everything. Only an owner can add another owner.' },
]
const LABEL = Object.fromEntries(ROLES.map((r) => [r.key, r.label]))

export default function TeamView({ me, say, onAuthError }) {
  const [team, setTeam] = useState(null)
  const [form, setForm] = useState({ fullName: '', email: '', role: 'warehouse' })
  const [busy, setBusy] = useState(false)
  const roles = ROLES.filter((r) => r.key !== 'owner' || me.role === 'owner')

  const load = useCallback(() => {
    staffJson('/api/admin/staff')
      .then((r) => setTeam(r.staff))
      .catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
  }, [onAuthError, say])
  useEffect(() => { load() }, [load])

  async function add(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await staffJson('/api/admin/staff', { method: 'POST', body: JSON.stringify(form) })
      say(`${form.fullName} added. They can now sign in with Google using ${form.email}.`)
      setForm({ fullName: '', email: '', role: 'warehouse' })
      load()
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function change(person, patch, message) {
    try {
      await staffJson(`/api/admin/staff/${person.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      say(message)
      load()
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const canEdit = (p) => p.id !== me.id && (p.role !== 'owner' || me.role === 'owner')

  return (
    <section className="wh-panel wh-panel--team">
      <h2 className="wh-panel-title">Team</h2>
      <p className="wh-muted wh-small">
        People listed here can sign in to this panel with the Google account of that email. Turning someone off
        takes their access away at once.
      </p>

      <form className="wh-team-add" onSubmit={add}>
        <label className="wh-field">
          <span>Name</span>
          <input className="wh-input" value={form.fullName} onChange={set('fullName')} required maxLength={100} placeholder="e.g. Ravi Kumar" />
        </label>
        <label className="wh-field">
          <span>Google email</span>
          <input className="wh-input" type="email" value={form.email} onChange={set('email')} required placeholder="name@chennairiceindustries.com" />
        </label>
        <label className="wh-field">
          <span>Role</span>
          <span className="wh-select">
            <select value={form.role} onChange={set('role')}>
              {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </span>
        </label>
        <button type="submit" className="wh-btn wh-btn--primary" disabled={busy}>
          <Icon name="users" size={18} /> {busy ? 'Adding…' : 'Add to team'}
        </button>
        <p className="wh-muted wh-small wh-team-note">{ROLES.find((r) => r.key === form.role)?.note}</p>
      </form>

      {!team ? <p className="wh-muted">Loading…</p> : (
        <ul className="wh-team">
          {team.map((p) => (
            <li key={p.id} className={p.is_active ? '' : 'is-off'}>
              <div>
                <strong>{p.full_name}{p.id === me.id ? ' (you)' : ''}</strong>
                <span className="wh-muted wh-small">{p.email}</span>
              </div>
              {canEdit(p) ? (
                <div className="wh-team-actions">
                  <span className="wh-select">
                    <select value={p.role} aria-label={`Role for ${p.full_name}`}
                      onChange={(e) => change(p, { role: e.target.value }, `${p.full_name} is now ${LABEL[e.target.value]}.`)}>
                      {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </span>
                  <label className="wh-toggle">
                    <input type="checkbox" checked={p.is_active}
                      onChange={(e) => change(p, { isActive: e.target.checked }, `${p.full_name} ${e.target.checked ? 'can sign in again' : 'no longer has access'}.`)} />
                    <span>{p.is_active ? 'Active' : 'Off'}</span>
                  </label>
                </div>
              ) : (
                <span className="wh-role-chip">{LABEL[p.role] || p.role}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
