import { useEffect, useState } from 'react'
import { staffJson, staffFetch } from '../../services/staffAuth.js'
import { I } from './ui.jsx'

/** /whatsappbot → Settings: the WhatsApp Business profile customers see (photo, About, description, address…). */
export default function ProfileCard() {
  const [p, setP] = useState(null)
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState(null)
  const load = () => staffJson('/api/admin/whatsapp/profile').then((d) => { setP(d); setF({ ...d, websites: [...d.websites, '', ''].slice(0, 2) }) }).catch((e) => setNote({ bad: true, text: e.message }))
  useEffect(() => { load() }, [])
  if (!f) return <section className="wa-card"><h2 className="wa-h2">WhatsApp profile</h2><p className="wa-muted">{note?.text || 'Loading…'}</p></section>

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function save() {
    setBusy('save')
    setNote(null)
    try {
      const d = await staffJson('/api/admin/whatsapp/profile', { method: 'PUT', body: JSON.stringify({ ...f, websites: f.websites.filter(Boolean) }) })
      setP(d)
      setNote({ text: 'Saved to WhatsApp. Customers see it within a few minutes.' })
    } catch (e) { setNote({ bad: true, text: e.message }) } finally { setBusy('') }
  }
  async function photo(file) {
    setBusy('photo')
    setNote(null)
    try {
      const res = await staffFetch('/api/admin/whatsapp/profile/photo', { method: 'POST', body: file, headers: { 'Content-Type': file.type } })
      setP(await res.json())
      setNote({ text: 'New photo saved to WhatsApp.' })
    } catch (e) { setNote({ bad: true, text: e.message }) } finally { setBusy('') }
  }

  return (
    <section className="wa-card wa-profile">
      <h2 className="wa-h2">WhatsApp profile</h2>
      <p className="wa-muted">What customers see when they tap “Chennai Rice Industries” in WhatsApp.</p>
      <div className="wa-profile-top">
        {p.photo ? <img src={p.photo} alt="WhatsApp profile photo" width="96" height="96" /> : <span className="wa-profile-nophoto">No photo</span>}
        <label className="wa-btn wa-btn--small">
          <I name="upload" size={14} /> {busy === 'photo' ? 'Uploading…' : 'Change photo'}
          <input type="file" hidden accept="image/jpeg,image/png" onChange={(e) => e.target.files[0] && photo(e.target.files[0])} />
        </label>
        <small className="wa-muted">Square JPG or PNG, 640 × 640 is best.</small>
      </div>
      <label className="wa-lbl">About <small>{f.about.length}/139</small>
        <input value={f.about} maxLength={139} onChange={set('about')} />
      </label>
      <label className="wa-lbl">Description <small>{f.description.length}/512</small>
        <textarea rows={5} value={f.description} maxLength={512} onChange={set('description')} />
      </label>
      <label className="wa-lbl">Address<input value={f.address} maxLength={256} onChange={set('address')} /></label>
      <label className="wa-lbl">Email<input value={f.email} type="email" onChange={set('email')} /></label>
      {[0, 1].map((i) => (
        <label key={i} className="wa-lbl">Website {i + 1}
          <input value={f.websites[i] || ''} placeholder="https://" onChange={(e) => { const w = [...f.websites]; w[i] = e.target.value; setF({ ...f, websites: w }) }} />
        </label>
      ))}
      <label className="wa-lbl">Category
        <select value={f.vertical || 'GROCERY'} onChange={set('vertical')}>
          <option value="GROCERY">Grocery</option><option value="RETAIL">Retail / shopping</option>
          <option value="RESTAURANT">Food</option><option value="OTHER">Other</option>
        </select>
      </label>
      {note && <p className={note.bad ? 'wa-alert' : 'wa-ok'}>{note.text}</p>}
      <div className="wa-inline wa-mt">
        <button type="button" className="wa-btn wa-btn--lime" disabled={!!busy} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save to WhatsApp'}</button>
        <button type="button" className="wa-link" onClick={() => setF({ ...f, ...p.suggested, websites: [...p.suggested.websites] })}>Use the suggested text</button>
      </div>
    </section>
  )
}
