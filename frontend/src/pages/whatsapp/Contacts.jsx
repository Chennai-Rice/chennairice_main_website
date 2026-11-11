import { useCallback, useEffect, useState } from 'react'
import { staffJson, staffFetch } from '../../services/staffAuth.js'
import { I, num, when } from './ui.jsx'

export const BLANK_SEGMENT = { q: '', permission: '', bought: '', lastOrderMin: '', lastOrderMax: '', packKg: '', city: '', spinUnused: false, source: '', tag: '' }

/** The filters Contacts and Broadcasts share. */
export function SegmentFilters({ f, set, tags = [], compact = false }) {
  const v = (k) => (e) => set({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (
    <div className={'wa-segf' + (compact ? ' wa-segf--compact' : '')}>
      {!compact && <div className="wa-search"><I name="search" size={16} /><input value={f.q} placeholder="Name or number" onChange={v('q')} /></div>}
      <select value={f.permission} onChange={v('permission')}>
        <option value="">WhatsApp offers: anyone</option>
        <option value="in">Said yes to offers</option>
        <option value="none">Not asked yet</option>
        <option value="out">Said STOP</option>
        <option value="not_out">Anyone except STOP</option>
      </select>
      <select value={f.source} onChange={v('source')}>
        <option value="">From: anywhere</option>
        <option value="buyer">Website buyers</option>
        <option value="spin">Spin & Win players</option>
        <option value="whatsapp">WhatsApp chats</option>
      </select>
      <select value={f.bought} onChange={v('bought')}>
        <option value="">Bought: any</option>
        <option value="yes">Has bought</option>
        <option value="no">Never bought</option>
      </select>
      <label className="wa-segf-days">Last order
        <input value={f.lastOrderMin} inputMode="numeric" placeholder="min" onChange={v('lastOrderMin')} />–
        <input value={f.lastOrderMax} inputMode="numeric" placeholder="max" onChange={v('lastOrderMax')} /> days ago
      </label>
      <select value={f.packKg} onChange={v('packKg')}>
        <option value="">Last pack: any</option>
        <option value="5">5 kg</option>
        <option value="10">10 kg</option>
        <option value="26">26 kg</option>
      </select>
      <input className="wa-segf-city" value={f.city} placeholder="City" onChange={v('city')} />
      <select value={f.tag} onChange={v('tag')}>
        <option value="">Tag: any</option>
        {tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.n})</option>)}
      </select>
      <label className="wa-segf-check"><input type="checkbox" checked={!!f.spinUnused} onChange={v('spinUnused')} /> Spin code unused</label>
    </div>
  )
}

export const segmentQuery = (f) => new URLSearchParams(Object.entries(f).filter(([, x]) => x !== '' && x !== false && x != null))

function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim())
  const split = (l) => { const out = []; let cur = ''; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = '' } else cur += ch } out.push(cur); return out.map((x) => x.trim()) }
  const head = split(lines[0] || '').map((h) => h.toLowerCase())
  const col = (names) => head.findIndex((h) => names.some((n) => h.includes(n)))
  const ip = col(['phone', 'mobile', 'number'])
  const iname = col(['name'])
  const itags = col(['tag'])
  const iopt = col(['opt', 'consent', 'whatsapp'])
  if (ip < 0) throw new Error('The file needs a "phone" (or "mobile") column.')
  return lines.slice(1).map((l) => { const c = split(l); return { phone: c[ip], name: iname >= 0 ? c[iname] : '', tags: itags >= 0 ? c[itags] : '', optIn: iopt >= 0 ? c[iopt] : '' } })
}

export default function Contacts() {
  const [f, setF] = useState(BLANK_SEGMENT)
  const [data, setData] = useState(null)
  const [more, setMore] = useState([])
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const load = useCallback(() => {
    setMore([])
    return staffJson('/api/admin/whatsapp/contacts?' + segmentQuery(f)).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message))
  }, [f])
  useEffect(() => { const id = setTimeout(load, 300); return () => clearTimeout(id) }, [load])

  const rows = [...(data?.contacts || []), ...more]
  async function loadMore() {
    const p = segmentQuery(f)
    p.set('offset', String(rows.length))
    const d = await staffJson('/api/admin/whatsapp/contacts?' + p)
    setMore((m) => [...m, ...d.contacts])
  }
  async function download() {
    const res = await staffFetch('/api/admin/whatsapp/contacts.csv?' + segmentQuery(f))
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = 'whatsapp-contacts.csv'
    a.click()
    URL.revokeObjectURL(url)
  }
  async function upload(file) {
    try {
      const parsed = parseCsv(await file.text())
      const r = await staffJson('/api/admin/whatsapp/contacts/import', { method: 'POST', body: JSON.stringify({ rows: parsed }) })
      setNote(`Imported ${r.added} contacts${r.skipped ? `, skipped ${r.skipped} without a valid mobile` : ''}.`)
      load()
    } catch (e) { setError(e.message) }
  }
  const permission = async (phone, value) => {
    try { await staffJson(`/api/admin/whatsapp/contacts/${phone}/permission`, { method: 'PUT', body: JSON.stringify({ value }) }); load() } catch (e) { setError(e.message) }
  }

  return (
    <>
      <div className="wa-titlebar">
        <h1>Contacts</h1>
        <div className="wa-actions">
          <label className="wa-btn" title="CSV with phone, name, tags and opt-in (yes) columns">
            <I name="upload" size={16} /> Import CSV
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
          </label>
          <button type="button" className="wa-btn" onClick={download}><I name="arrow" size={16} /> Download CSV</button>
        </div>
      </div>
      {data && (
        <div className="wa-stat-strip">
          <div><b>{num(data.totals.all)}</b><span>people</span></div>
          <div><b>{num(data.totals.buyers)}</b><span>buyers</span></div>
          <div className="is-lime"><b>{num(data.totals.opted_in)}</b><span>said yes to WhatsApp offers</span></div>
          <div><b>{num(data.totals.opted_out)}</b><span>said STOP</span></div>
        </div>
      )}
      <SegmentFilters f={f} set={setF} tags={data?.tags || []} />
      {note && <p className="wa-ok">{note}</p>}
      {error && <p className="wa-alert">{error}</p>}
      <section className="wa-dark">
        <div className="wa-dark-head"><h2>{data ? `${num(data.total)} matching` : 'Loading…'}</h2></div>
        <div className="wa-table-wrap">
          <table className="wa-table">
            <thead><tr><th>Customer</th><th>From</th><th>Orders</th><th>Last order</th><th>Spin & Win</th><th>Last chat</th><th>WhatsApp offers</th><th>Tags</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.phone}>
                  <td><b>{p.name || '—'}</b><small>{p.phone}{p.city ? ` · ${p.city}` : ''}</small></td>
                  <td>{p.sources.map((s) => <span key={s} className="wa-chipx">{s}</span>)}</td>
                  <td>{p.orders || '—'}{p.orders ? <small>₹{num(p.spent)}</small> : null}</td>
                  <td>{p.lastOrderAt ? when(p.lastOrderAt) : '—'}{p.lastPackKg ? <small>{p.lastProduct} {p.lastPackKg} kg</small> : null}</td>
                  <td>{p.prize || '—'}{p.spinUnused ? <small className="wa-green">code unused</small> : null}</td>
                  <td>{p.lastChatAt ? when(p.lastChatAt) : '—'}</td>
                  <td>
                    <select value={p.optedOutAt ? 'out' : p.optedInAt ? 'in' : ''} onChange={(e) => permission(p.phone, e.target.value || 'none')}>
                      <option value="">Not asked</option>
                      <option value="in">Yes{p.optInSource ? ` (${p.optInSource})` : ''}</option>
                      <option value="out">STOP</option>
                    </select>
                  </td>
                  <td>{p.tags.map((t) => <span key={t} className="wa-chipx">{t}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && rows.length < data.total && <button type="button" className="wa-btn wa-btn--small wa-more" onClick={loadMore}>Show more</button>}
      </section>
      <p className="wa-muted wa-foot">Only mark someone "Yes" if they agreed to get offers on WhatsApp (a ticked box, a form, or they asked). WhatsApp may block the number if people report messages they did not want.</p>
    </>
  )
}
