import { useEffect, useMemo, useState } from 'react'
import { plainText, readingMinutes, renderMarkdown } from '../../../lib/markdown.jsx'
import { formatPostDate } from '../../../services/blog.service.js'
import '../blog.css'

/**
 * "Check before you publish": the post drawn with the same markup and styles the public journal uses,
 * first as the card on the journal list, then as the post page, on a computer or a phone width. Nothing is
 * saved from here; Publish now hands back to the editor.
 */
export default function PostPreview({ draft, author, live, busy, onBack, onPublish }) {
  const [device, setDevice] = useState('desktop')

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

  return (
    <div className="st-pv" role="dialog" aria-modal="true" aria-label="Preview before publishing">
      <div className="st-pv-bar">
        <div>
          <strong>Preview</strong>
          <span className="st-hint"> — this is how readers will see it. Nothing is published yet.</span>
        </div>
        <div className="st-pv-devices" role="group" aria-label="Screen size">
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
                <div className="blog-card-media">
                  {draft.coverUrl
                    ? <img src={draft.coverUrl} alt={draft.coverAlt} />
                    : <span className="blog-card-placeholder" aria-hidden="true" />}
                </div>
                <div className="blog-card-body">
                  <h2 className="blog-card-title">{title}</h2>
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
                <figure className="blog-post-cover"><img src={draft.coverUrl} alt={draft.coverAlt} /></figure>
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
