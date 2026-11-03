import { useEffect, useMemo, useState } from 'react'
import { plainText, readingMinutes, renderMarkdown } from '../../../lib/markdown.jsx'
import { formatPostDate } from '../../../services/blog.service.js'
import PostCover from './PostCover.jsx'
import '../blog.css'

const MAX_BUTTONS = 6
const NEW_BUTTON = { text: 'New button', href: 'https://chennairiceindustries.com/', x: 50, y: 85, size: 2.2, color: 'white' }
const linkOk = (v) => /^https?:\/\/\S+$/i.test(v.trim()) || /^\/(?!\/)\S*$/.test(v.trim())

/**
 * "Check before you publish": the post drawn with the same markup and styles the public journal uses,
 * first as the card on the journal list, then as the post page, on a computer or a phone width. Nothing is
 * saved from here; Publish now hands back to the editor.
 *
 * "Edit buttons" lets the writer place buttons on the cover: drag to move, drag the round handle (or use the slider)
 * to resize, and set each one's text, link and colour. The changes go to the draft (onChange) and are saved with the post.
 */
export default function PostPreview({ draft, author, live, busy, onBack, onPublish, onChange }) {
  const [device, setDevice] = useState('desktop')
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, busy])

  // The same fallbacks the save applies (blog.service.js), so what is shown here is what gets stored.
  const body = useMemo(() => renderMarkdown(draft.contentMd), [draft.contentMd])
  const excerpt = useMemo(() => {
    const typed = (draft.excerpt || '').trim()
    const text = plainText(draft.contentMd)
    return typed || (text ? text.slice(0, 180).replace(/\s+\S*$/, '') : '')
  }, [draft.excerpt, draft.contentMd])
  const minutes = readingMinutes(draft.contentMd)
  const when = draft.publishedAt || new Date().toISOString()
  const name = author?.display_name || ''
  const title = draft.title.trim() || 'Untitled post'

  const buttons = draft.coverButtons || []
  const current = buttons.find((b) => b.id === selected) || null
  const setButtons = (next) => onChange({ coverButtons: next, coverTouched: true })
  const patch = (id, change) => setButtons(buttons.map((b) => (b.id === id ? { ...b, ...change } : b)))
  const add = () => {
    const id = `b${Date.now().toString(36)}`
    setButtons([...buttons, { ...NEW_BUTTON, id }])
    setSelected(id)
  }
  const remove = (id) => {
    setButtons(buttons.filter((b) => b.id !== id))
    setSelected('')
  }
  const toggleEditing = () => {
    setEditing((on) => !on)
    if (!selected && buttons[0]) setSelected(buttons[0].id)
  }

  return (
    <div className="st-pv" role="dialog" aria-modal="true" aria-label="Preview before publishing">
      <div className="st-pv-bar">
        <div>
          <strong>Preview</strong>
          <span className="st-hint"> — this is how readers will see it. Nothing is published yet.</span>
        </div>
        <div className="st-pv-devices" role="group" aria-label="Screen size and buttons">
          <button type="button" aria-pressed={editing} className={`st-tab${editing ? ' is-active' : ''}`} onClick={toggleEditing}>
            {editing ? 'Done editing buttons' : 'Edit buttons'}
          </button>
          {[['desktop', 'Computer'], ['phone', 'Phone']].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={device === id}
              className={`st-tab${device === id ? ' is-active' : ''}`} onClick={() => setDevice(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="st-pv-scroll">
        <div className={`st-pv-frame${device === 'phone' ? ' is-phone' : ''}`}>
          <p className="st-pv-label">On the journal list</p>
          <div className="st-pv-page">
            <article className="blog-card" style={{ maxWidth: 360, width: '100%' }}>
              <div className="blog-card-link">
                <div className="blog-card-media" style={draft.coverUrl ? { '--cover': `url("${draft.coverUrl}")` } : undefined}>
                  {draft.coverUrl
                    ? <img src={draft.coverUrl} alt={draft.coverAlt} />
                    : <span className="blog-card-placeholder" aria-hidden="true" />}
                </div>
                <div className="blog-card-body">
                  <h2 className="blog-card-title">{draft.cardTitle.trim() || title}</h2>
                  {excerpt && <p className="blog-card-excerpt">{excerpt}</p>}
                  <p className="blog-card-meta">
                    <span>{name}</span><span aria-hidden="true">·</span>
                    <time dateTime={when}>{formatPostDate(when)}</time>
                    {minutes ? <><span aria-hidden="true">·</span><span>{minutes} min read</span></> : null}
                  </p>
                </div>
              </div>
            </article>
          </div>

          <p className="st-pv-label">The post page</p>

          {editing && (
            <section className="st-pv-edit" aria-label="Edit the cover buttons">
              {!draft.coverUrl ? (
                <p className="st-hint">Add a cover image first. The buttons are placed on it.</p>
              ) : (
                <>
                  <p className="st-hint">
                    Drag a button on the cover to move it. Drag its round handle to make it bigger or smaller. Arrow keys nudge the
                    selected button. On the live post a button opens its link.
                  </p>
                  <div className="st-pv-edit-row">
                    <button type="button" className="st-btn" disabled={buttons.length >= MAX_BUTTONS} onClick={add}>+ Add a button</button>
                    {buttons.map((b, n) => (
                      <button key={b.id} type="button" className={`st-btn st-pv-pick${b.id === selected ? ' is-on' : ''}`} onClick={() => setSelected(b.id)}>
                        {n + 1}. {b.text.slice(0, 22) || 'Button'}
                      </button>
                    ))}
                  </div>

                  {current ? (
                    <div className="st-pv-edit-grid">
                      <label className="st-field"><span>Text on the button</span>
                        <input className="st-input" value={current.text} maxLength={80} onChange={(e) => patch(current.id, { text: e.target.value })} />
                      </label>
                      <label className="st-field"><span>Opens this link</span>
                        <input className="st-input" value={current.href} maxLength={500} placeholder="https://…" onChange={(e) => patch(current.id, { href: e.target.value })} />
                        {!linkOk(current.href) && <small className="st-pv-warn">A link must start with https:// (or / for a page of this site). Without one the button is not saved.</small>}
                      </label>
                      <label className="st-field"><span>Colour</span>
                        <select className="st-input" value={current.color} onChange={(e) => patch(current.id, { color: e.target.value })}>
                          <option value="white">White</option>
                          <option value="maroon">Maroon</option>
                        </select>
                      </label>
                      <label className="st-field"><span>Size</span>
                        <input type="range" min="0.8" max="6" step="0.1" value={current.size} onChange={(e) => patch(current.id, { size: Number(e.target.value) })} />
                      </label>
                      <div className="st-field st-pv-del">
                        <button type="button" className="st-btn st-btn-danger" onClick={() => remove(current.id)}>Delete this button</button>
                      </div>
                    </div>
                  ) : (
                    <p className="st-hint">{buttons.length ? 'Select a button on the cover, or in the list above.' : 'No buttons yet. Add one.'}</p>
                  )}

                  <div className="st-pv-edit-grid st-pv-edit-cover">
                    <label className="st-field"><span>Extra height under the picture</span>
                      <input type="range" min="0" max="40" step="1" value={draft.coverExtra || 0}
                        onChange={(e) => onChange({ coverExtra: Number(e.target.value), coverTouched: true })} />
                    </label>
                    <label className="st-field"><span>Colour of the extra height</span>
                      <input type="color" value={draft.coverFill || '#3a0a10'} onChange={(e) => onChange({ coverFill: e.target.value, coverTouched: true })} />
                    </label>
                  </div>
                </>
              )}
            </section>
          )}

          <div className="st-pv-page">
            <article className="blog-post">
              <header className="blog-post-head">
                <h1 className="blog-post-title">{title}</h1>
                <p className="blog-post-meta">
                  <span>{name}</span><span aria-hidden="true">·</span>
                  <time dateTime={when}>{formatPostDate(when)}</time>
                  {minutes ? <><span aria-hidden="true">·</span><span>{minutes} min read</span></> : null}
                </p>
              </header>
              {draft.coverUrl && (
                <PostCover
                  url={draft.coverUrl}
                  alt={draft.coverAlt}
                  buttons={buttons}
                  extra={draft.coverExtra || 0}
                  fill={draft.coverFill || ''}
                  editing={editing}
                  selected={selected}
                  onSelect={setSelected}
                  onChange={setButtons}
                />
              )}
              <div className="blog-prose">{body}</div>
            </article>
          </div>
          <p className="st-hint st-pv-web">Web address: chennairiceindustries.com/blog/{draft.slug || '…'}</p>
        </div>
      </div>

      <div className="st-pv-foot">
        <button type="button" className="st-btn" disabled={busy} onClick={onBack}>Back to editing</button>
        <button type="button" className="st-btn st-btn-primary" disabled={busy} onClick={onPublish}>
          {busy ? 'Publishing…' : live ? 'Update now' : 'Publish now'}
        </button>
      </div>
    </div>
  )
}
