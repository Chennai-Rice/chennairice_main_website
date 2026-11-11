import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { staffJson, staffFetch } from '../../services/staffAuth.js'
import { I, StatusPill, WaText, when } from './ui.jsx'

const LINK = 'https://chennairiceindustries.com/w/{{1}}'
const FILTERS = [['all', 'All'], ['DRAFT', 'Drafts'], ['PENDING', 'In review'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']]
const BUTTON_TYPES = { URL: 'Visit website', COPY_CODE: 'Copy code', QUICK_REPLY: 'Quick reply', PHONE_NUMBER: 'Call' }
const NEW_BUTTON = {
  URL: { type: 'URL', text: 'Shop now', url: LINK, sample: 'spin-A745B4' },
  COPY_CODE: { type: 'COPY_CODE', text: 'Copy code', sample: 'SPIN-A745B4' },
  QUICK_REPLY: { type: 'QUICK_REPLY', text: 'Yes, interested' },
  PHONE_NUMBER: { type: 'PHONE_NUMBER', text: 'Call us', phone: '+917066646667' },
}
// Meta's rejection codes, in words.
const REASONS = {
  INCORRECT_CATEGORY: 'Meta thinks the category is wrong: offers, codes and reminders to buy are Marketing, not Utility.',
  INVALID_FORMAT: 'The format is wrong: check the variables ({{1}}, {{2}}…), their samples and the buttons.',
  TAG_CONTENT_MISMATCH: 'The text does not match the category or the language chosen.',
  ABUSIVE_CONTENT: 'Meta found the wording against its rules.',
  SCAM: 'Meta thinks it looks like a scam: make the offer and the sender clear.',
  PROMOTIONAL: 'It reads as promotional: choose Marketing.',
  NONE: '',
}
const blank = () => ({ name: '', category: 'MARKETING', purpose: '', header: { format: 'NONE' }, body: { text: 'Hi {{1}}, ', samples: ['Ravi'] }, footer: 'Reply STOP to opt out', buttons: [] })
const varsOf = (text) => [...new Set([...String(text || '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b)

function fill(text, samples) {
  return String(text || '').replace(/\{\{(\d+)\}\}/g, (all, d) => samples?.[Number(d) - 1] || all)
}

function Preview({ m }) {
  const h = m.header || {}
  return (
    <div className="wa-phone" aria-label="Preview as the customer sees it">
      <div className="wa-phone-top"><img src="/assets/warehouse-logo.png" alt="" width="26" height="26" /> <b>Chennai Rice</b> <I name="shield" size={13} /></div>
      <div className="wa-phone-chat">
        <div className="wa-bubble">
          {h.format === 'TEXT' && <p className="wa-bubble-head">{fill(h.text, [h.sample])}</p>}
          {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(h.format) && <div className="wa-bubble-media">{h.format === 'IMAGE' ? '🖼 Picture' : h.format === 'VIDEO' ? '🎥 Video' : '📄 PDF'}</div>}
          <p className="wa-bubble-body"><WaText text={fill(m.body?.text, m.body?.samples)} /></p>
          {m.footer && <p className="wa-bubble-foot">{m.footer}</p>}
          <span className="wa-bubble-time">10:24</span>
        </div>
        {m.buttons?.map((b, i) => (
          <div key={i} className="wa-bubble-btn">
            <I name={b.type === 'URL' ? 'link' : b.type === 'COPY_CODE' ? 'copy' : b.type === 'PHONE_NUMBER' ? 'phone' : 'reply'} size={14} />
            {b.type === 'COPY_CODE' ? 'Copy code' : b.text || BUTTON_TYPES[b.type]}
          </div>
        ))}
      </div>
    </div>
  )
}

function Editor({ t, onSaved, onDeleted, onDuplicated }) {
  const [m, setM] = useState(() => (t ? structuredClone(t.model) : blank()))
  const [unlocked, setUnlocked] = useState(false)
  const [problems, setProblems] = useState([])
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState(null)
  const [testTo, setTestTo] = useState('')
  const bodyRef = useRef(null)
  const locked = t && ['PENDING', 'IN_APPEAL', 'PENDING_DELETION'].includes(t.status) || (t?.status === 'APPROVED' && !unlocked)
  const dirty = !t || JSON.stringify(m) !== JSON.stringify(t.model)

  useEffect(() => {
    const id = setTimeout(() => {
      staffJson('/api/admin/whatsapp/templates/check', { method: 'POST', body: JSON.stringify(m) }).then((r) => setProblems(r.problems)).catch(() => {})
    }, 350)
    return () => clearTimeout(id)
  }, [m])

  const set = (patch) => setM((x) => ({ ...x, ...patch }))
  const setBody = (text) => setM((x) => {
    const n = Math.max(0, ...varsOf(text))
    const samples = Array.from({ length: n }, (_, i) => x.body.samples?.[i] || '')
    return { ...x, body: { text, samples } }
  })
  const addVar = () => {
    const n = Math.max(0, ...varsOf(m.body.text)) + 1
    const el = bodyRef.current
    const at = el ? el.selectionStart : m.body.text.length
    setBody(m.body.text.slice(0, at) + `{{${n}}}` + m.body.text.slice(at))
  }
  const setButton = (i, patch) => set({ buttons: m.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) })

  async function run(label, fn) {
    setBusy(label)
    setNote(null)
    try {
      await fn()
    } catch (err) {
      setNote({ bad: true, text: err.message })
    } finally {
      setBusy('')
    }
  }
  const save = () => run('save', async () => {
    const saved = await staffJson('/api/admin/whatsapp/templates', { method: 'POST', body: JSON.stringify({ ...m, id: t?.id }) })
    onSaved(saved)
    setNote({ text: 'Saved.' })
  })
  const submit = () => run('submit', async () => {
    let id = t?.id
    if (dirty || !id) id = (await staffJson('/api/admin/whatsapp/templates', { method: 'POST', body: JSON.stringify({ ...m, id }) })).id
    const r = await staffJson(`/api/admin/whatsapp/templates/${id}/submit`, { method: 'POST' })
    onSaved(r)
    setUnlocked(false)
    setNote({ text: r.status === 'APPROVED' ? 'Approved by Meta straight away.' : 'Sent to Meta. Approval usually takes minutes to a day; the status updates here by itself.' })
  })
  const remove = () => {
    const where = t?.metaId ? ' It is deleted from Meta too, and the name cannot be reused for 30 days.' : ''
    if (!window.confirm(`Delete ${t.name}?${where}`)) return
    run('delete', async () => {
      await staffJson(`/api/admin/whatsapp/templates/${t.id}`, { method: 'DELETE' })
      onDeleted(t.id)
    })
  }
  const duplicate = () => run('dup', async () => onDuplicated(await staffJson(`/api/admin/whatsapp/templates/${t.id}/duplicate`, { method: 'POST' })))
  const test = () => run('test', async () => {
    await staffJson('/api/admin/whatsapp/test', { method: 'POST', body: JSON.stringify({ templateId: t.id, phone: testTo }) })
    setNote({ text: `Sent to ${testTo} with the sample values. Check the phone.` })
  })
  const upload = (file) => run('upload', async () => {
    const res = await staffFetch('/api/admin/whatsapp/templates/upload', { method: 'POST', body: file, headers: { 'Content-Type': file.type } })
    const { handle } = await res.json()
    set({ header: { ...m.header, handle, fileName: file.name } })
  })

  const vars = varsOf(m.body.text)
  return (
    <div className="wa-editor">
      <div className="wa-editor-form">
        <div className="wa-detail-head">
          <div>
            <span className="wa-label">{t ? 'Template' : 'New template'}</span>
            <b className="wa-mid"># {m.name || 'new_template'}</b>
          </div>
          {t ? <StatusPill status={t.status} /> : <span className="wa-pill wa-pill--draft">New</span>}
        </div>

        {t?.status === 'REJECTED' && (
          <p className="wa-reject"><b>Rejected by Meta.</b> {REASONS[t.rejectedReason] ?? t.rejectedReason} Fix it and press Submit again.</p>
        )}
        {t?.status === 'APPROVED' && !unlocked && (
          <p className="wa-okbar">Approved and ready to send. <button type="button" className="wa-link" onClick={() => setUnlocked(true)}>Edit it</button> (Meta reviews the change again), or duplicate it.</p>
        )}
        {t?.status === 'PENDING' && <p className="wa-okbar">Meta is reviewing this template. It cannot be changed until Meta answers.</p>}

        <fieldset disabled={locked || !!busy} className="wa-fields">
          <div className="wa-grid2">
            <label className="wa-field"><span>Name</span>
              <input value={m.name} placeholder="spin_reminder" disabled={!!t?.metaId}
                onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '') })} />
            </label>
            <div className="wa-field"><span>Category</span>
              <div className="wa-seg wa-seg--light">
                {['MARKETING', 'UTILITY'].map((c) => (
                  <button key={c} type="button" className={m.category === c ? 'is-on' : ''} onClick={() => set({ category: c })}>{c === 'MARKETING' ? 'Marketing' : 'Utility'}</button>
                ))}
              </div>
            </div>
          </div>
          <label className="wa-field"><span>What it is for (only you see this)</span>
            <input value={m.purpose} placeholder="Spin & Win: reminder 3 days later" onChange={(e) => set({ purpose: e.target.value })} />
          </label>

          <div className="wa-field"><span>Header <small>(optional)</small></span>
            <div className="wa-seg wa-seg--light wa-seg--wrap">
              {['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].map((f) => (
                <button key={f} type="button" className={m.header.format === f ? 'is-on' : ''} onClick={() => set({ header: { format: f, text: m.header.text || '', sample: m.header.sample || '' } })}>
                  {{ NONE: 'None', TEXT: 'Text', IMAGE: 'Picture', VIDEO: 'Video', DOCUMENT: 'PDF' }[f]}
                </button>
              ))}
            </div>
            {m.header.format === 'TEXT' && (
              <div className="wa-grid2 wa-mt">
                <input value={m.header.text} maxLength={60} placeholder="Your offer is ready" onChange={(e) => set({ header: { ...m.header, text: e.target.value } })} />
                {/\{\{1\}\}/.test(m.header.text) && <input value={m.header.sample || ''} placeholder="Sample for {{1}}" onChange={(e) => set({ header: { ...m.header, sample: e.target.value } })} />}
              </div>
            )}
            {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(m.header.format) && (
              <label className="wa-upload wa-mt">
                <I name="upload" size={16} /> {m.header.handle ? `Sample uploaded ✓ ${m.header.fileName || ''}` : `Upload a sample ${m.header.format === 'DOCUMENT' ? 'PDF' : m.header.format.toLowerCase()} for Meta`}
                <input type="file" hidden accept={m.header.format === 'IMAGE' ? 'image/jpeg,image/png' : m.header.format === 'VIDEO' ? 'video/mp4' : 'application/pdf'}
                  onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
              </label>
            )}
          </div>

          <div className="wa-field">
            <span>Message <small>{m.body.text.length} / 1024 · *bold* _italic_</small></span>
            <textarea ref={bodyRef} rows={6} value={m.body.text} onChange={(e) => setBody(e.target.value)} />
            <div className="wa-inline">
              <button type="button" className="wa-btn wa-btn--small" onClick={addVar}><I name="plus" size={14} /> Add variable</button>
              <span className="wa-muted">Variables are filled per customer (name, prize, date…). Meta needs a sample for each.</span>
            </div>
            {vars.length > 0 && (
              <div className="wa-samples">
                {vars.map((v) => (
                  <label key={v}><span>{`{{${v}}}`}</span>
                    <input value={m.body.samples[v - 1] || ''} placeholder="sample" onChange={(e) => {
                      const samples = [...m.body.samples]; samples[v - 1] = e.target.value; set({ body: { ...m.body, samples } })
                    }} />
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="wa-field"><span>Footer <small>(optional, 60)</small></span>
            <input value={m.footer} maxLength={60} placeholder="Reply STOP to opt out" onChange={(e) => set({ footer: e.target.value })} />
          </label>

          <div className="wa-field"><span>Buttons <small>(optional, up to 10)</small></span>
            {m.buttons.map((b, i) => (
              <div key={i} className="wa-btnrow">
                <span className="wa-btnrow-type">{BUTTON_TYPES[b.type]}</span>
                {b.type !== 'COPY_CODE' && <input value={b.text} maxLength={25} placeholder="Label" onChange={(e) => setButton(i, { text: e.target.value })} />}
                {b.type === 'URL' && <input className="wa-grow" value={b.url} placeholder="https://…" onChange={(e) => setButton(i, { url: e.target.value })} />}
                {b.type === 'URL' && /\{\{1\}\}$/.test(b.url) && <input value={b.sample} placeholder="sample ending" onChange={(e) => setButton(i, { sample: e.target.value })} />}
                {b.type === 'COPY_CODE' && <input className="wa-grow" value={b.sample} maxLength={15} placeholder="Sample code, e.g. SPIN-A745B4" onChange={(e) => setButton(i, { sample: e.target.value })} />}
                {b.type === 'PHONE_NUMBER' && <input className="wa-grow" value={b.phone} placeholder="+917066646667" onChange={(e) => setButton(i, { phone: e.target.value })} />}
                <button type="button" className="wa-round wa-round--small" title="Remove" onClick={() => set({ buttons: m.buttons.filter((_, j) => j !== i) })}><I name="x" size={14} /></button>
              </div>
            ))}
            {m.buttons.length < 10 && (
              <div className="wa-inline">
                {Object.keys(BUTTON_TYPES).map((type) => (
                  <button key={type} type="button" className="wa-btn wa-btn--small" onClick={() => set({ buttons: [...m.buttons, { ...NEW_BUTTON[type] }] })}>
                    <I name="plus" size={14} /> {BUTTON_TYPES[type]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </fieldset>

        {problems.length > 0 && !locked && (
          <ul className="wa-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        )}
        {note && <p className={note.bad ? 'wa-alert' : 'wa-ok'}>{note.text}</p>}

        <div className="wa-editor-foot">
          {!locked && <button type="button" className="wa-btn" disabled={!!busy || !dirty} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>}
          {!locked && (
            <button type="button" className="wa-btn wa-btn--lime" disabled={!!busy || problems.length > 0} onClick={submit}>
              {busy === 'submit' ? 'Sending…' : t?.metaId ? 'Submit again to Meta' : 'Submit to Meta'}
            </button>
          )}
          {t && <button type="button" className="wa-round" title="Duplicate" disabled={!!busy} onClick={duplicate}><I name="duplicate" size={16} /></button>}
          {t && <button type="button" className="wa-round" title="Delete" disabled={!!busy} onClick={remove}><I name="trash" size={16} /></button>}
          {t?.status === 'APPROVED' && (
            <span className="wa-test">
              <input value={testTo} inputMode="numeric" placeholder="Your mobile" onChange={(e) => setTestTo(e.target.value.replace(/\D/g, '').slice(0, 10))} />
              <button type="button" className="wa-btn" disabled={!!busy || testTo.length !== 10} onClick={test}><I name="send" size={14} /> {busy === 'test' ? 'Sending…' : 'Send test'}</button>
            </span>
          )}
        </div>
      </div>
      <Preview m={m} />
    </div>
  )
}

export default function Templates() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null) // template id or 'new'
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState('')

  const load = useCallback(() => staffJson('/api/admin/whatsapp/templates').then((d) => { setData(d); return d }).catch((e) => setError(e.message)), [])
  useEffect(() => {
    load().then((d) => { if (d?.templates?.length) setSel((s) => s || d.templates[0].id) })
  }, [load])

  const list = useMemo(() => (data?.templates || []).filter((t) =>
    (filter === 'all' || t.status === filter || (filter === 'PENDING' && t.status === 'IN_APPEAL')) &&
    (!q || (t.name + ' ' + (t.purpose || '')).toLowerCase().includes(q.toLowerCase()))), [data, filter, q])
  const current = sel === 'new' ? null : data?.templates.find((t) => t.id === sel)
  const count = (s) => (s === 'all' ? data?.templates.length : data?.counts?.[s]) || 0

  async function sync() {
    setSyncing(true)
    setSyncNote('')
    try {
      const r = await staffJson('/api/admin/whatsapp/templates/sync', { method: 'POST' })
      await load()
      setSyncNote(`${r.synced} templates read from Meta.`)
    } catch (err) {
      setSyncNote(err.message)
    } finally {
      setSyncing(false)
    }
  }
  const saved = (t) => { setData((d) => ({ ...d, templates: [t, ...d.templates.filter((x) => x.id !== t.id)] })); setSel(t.id); load() }

  return (
    <>
      <div className="wa-titlebar">
        <h1>Templates</h1>
        <div className="wa-actions">
          <button type="button" className="wa-round" title="Sync with Meta" disabled={syncing} onClick={sync}><I name="refresh" /></button>
          <button type="button" className="wa-btn" onClick={() => setSel('new')}><I name="plus" size={16} /> Create a template</button>
        </div>
      </div>
      {syncNote && <p className="wa-muted wa-note">{syncNote}</p>}
      {error && <p className="wa-alert">{error}</p>}
      <div className="wa-filters">
        <div className="wa-search"><I name="search" size={16} /><input value={q} placeholder="Search templates" onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {!data && !error && <p className="wa-muted">Loading…</p>}
      {data && (
        <section className="wa-dark wa-dark--tabs">
          <div className="wa-tabs-notch">
            {FILTERS.map(([id, label]) => (
              <button key={id} type="button" className={filter === id ? 'is-on' : ''} onClick={() => setFilter(id)}>
                {label} {id !== 'all' && <span className="wa-count">{count(id)}</span>}
              </button>
            ))}
          </div>
          <div className="wa-dark-head"><h2>{FILTERS.find((f) => f[0] === filter)[1]} templates</h2></div>
          <div className="wa-split wa-split--templates">
            <ul className="wa-list">
              {list.length === 0 && <li className="wa-empty">Nothing here.</li>}
              {list.map((t) => (
                <li key={t.id}>
                  <button type="button" className={'wa-row wa-row--btn' + (sel === t.id ? ' is-on' : '')} onClick={() => setSel(t.id)}>
                    <span className={'wa-av' + (t.category === 'UTILITY' ? ' wa-av--util' : '')}><I name={t.kind === 'coupon' ? 'tag' : t.category === 'UTILITY' ? 'check' : 'megaphone'} size={15} /></span>
                    <span className="wa-row-main"><b># {t.name}</b><small>{t.purpose || (t.category === 'UTILITY' ? 'Utility' : 'Marketing')} · {when(t.updatedAt)}</small></span>
                    <StatusPill status={t.status} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="wa-detail wa-detail--editor">
              {(current || sel === 'new') ? (
                <Editor key={sel} t={current} onSaved={saved}
                  onDeleted={(id) => { setSel(null); setData((d) => ({ ...d, templates: d.templates.filter((x) => x.id !== id) })); load() }}
                  onDuplicated={saved} />
              ) : <p className="wa-empty">Choose a template, or create one.</p>}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
