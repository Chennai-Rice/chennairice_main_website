import { useMemo, useRef, useState } from 'react'
import { renderMarkdown, slugify } from '../../../lib/markdown.jsx'
import {
  BlogError,
  COVER_TYPES,
  MAX_COVER_BYTES,
  deletePost,
  savePost,
  uploadCover,
} from '../../../services/blog.service.js'

const BLANK = {
  id: null,
  title: '',
  slug: '',
  excerpt: '',
  contentMd: '',
  coverPath: null,
  coverUrl: null,
  coverAlt: '',
  status: 'draft',
  publishedAt: null,
}

const HELP = `## A heading

Write a paragraph like this. Make a word **bold** or *italic*, add a
[link](https://chennairiceindustries.com), and list things:

- one thing
- another thing

> A quote, for something worth pulling out.`

export default function PostEditor({ post, author, onSaved, onClose, onDeleted }) {
  const [draft, setDraft] = useState({ ...BLANK, ...(post || {}) })
  const [tab, setTab] = useState('write')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileRef = useRef(null)

  /* Once the writer edits the address by hand, stop rewriting it from the
     title — otherwise a deliberate choice is undone by the next keystroke.
     An existing post never re-derives it either: its URL is already out in
     the world. */
  const [slugTouched, setSlugTouched] = useState(Boolean(post?.id))

  const set = (patch) => {
    setDraft((current) => ({ ...current, ...patch }))
    setNotice('')
  }

  const onTitle = (value) => {
    set(slugTouched ? { title: value } : { title: value, slug: slugify(value) })
  }

  const preview = useMemo(() => renderMarkdown(draft.contentMd), [draft.contentMd])

  const pickCover = async (event) => {
    const file = event.target.files?.[0]
    // Clear the input so choosing the same file twice still fires a change.
    event.target.value = ''
    if (!file) return

    setError('')
    setBusy('cover')
    try {
      const { path, url } = await uploadCover(file, author)
      set({ coverPath: path, coverUrl: url })
      setNotice('Image uploaded. Add a short description of it below.')
    } catch (err) {
      setError(err instanceof BlogError ? err.message : 'Could not upload that image.')
    } finally {
      setBusy('')
    }
  }

  const save = async (status) => {
    setError('')

    if (status === 'published') {
      if (!draft.contentMd.trim()) {
        setError('Write something before publishing.')
        return
      }
      // Only enforced on publish: a draft is allowed to be half-finished,
      // but a cover that reaches the public site without a description is
      // unusable to anyone reading with a screen reader.
      if (draft.coverPath && !draft.coverAlt.trim()) {
        setError('Describe the cover image before publishing, so it works for screen readers.')
        return
      }
    }

    setBusy(status)
    try {
      const saved = await savePost({ ...draft, status }, author)
      setDraft((current) => ({
        ...current,
        id: saved.id,
        slug: saved.slug,
        status: saved.status,
        publishedAt: saved.published_at,
        excerpt: saved.excerpt || '',
      }))
      setSlugTouched(true)
      setNotice(
        status === 'published'
          ? 'Published. It is live on the journal now.'
          : 'Saved as a draft. Only you can see it.'
      )
      onSaved?.()
    } catch (err) {
      setError(err instanceof BlogError ? err.message : 'Could not save the post.')
    } finally {
      setBusy('')
    }
  }

  const remove = async () => {
    if (!draft.id) return onClose()
    if (!window.confirm(`Delete "${draft.title || 'this post'}"? This cannot be undone.`)) return

    setBusy('delete')
    try {
      await deletePost(draft.id)
      onDeleted?.()
    } catch (err) {
      setError(err instanceof BlogError ? err.message : 'Could not delete the post.')
      setBusy('')
    }
  }

  const live = draft.status === 'published'

  return (
    <div className="st-editor">
      <header className="st-editor-head">
        <button type="button" className="st-link" onClick={onClose}>
          &larr; All posts
        </button>
        <span className={`st-badge${live ? ' is-live' : ''}`}>{live ? 'Published' : 'Draft'}</span>
      </header>

      {error && <p className="st-alert" role="alert">{error}</p>}
      {notice && <p className="st-notice" role="status">{notice}</p>}

      <div className="st-field">
        <label htmlFor="post-title">Title</label>
        <input
          id="post-title"
          className="st-input st-input-title"
          value={draft.title}
          placeholder="What is this post about?"
          onChange={(e) => onTitle(e.target.value)}
        />
      </div>

      <div className="st-row">
        <div className="st-field">
          <label htmlFor="post-slug">Web address</label>
          <div className="st-slug">
            <span className="st-slug-prefix">/blog/</span>
            <input
              id="post-slug"
              className="st-input"
              value={draft.slug}
              placeholder="from-the-fields"
              onChange={(e) => {
                setSlugTouched(true)
                set({ slug: e.target.value })
              }}
              onBlur={(e) => set({ slug: slugify(e.target.value) })}
            />
          </div>
          <p className="st-hint">Lowercase letters, numbers and hyphens. Changing this changes the link.</p>
        </div>

        <div className="st-field">
          <label htmlFor="post-excerpt">Summary</label>
          <input
            id="post-excerpt"
            className="st-input"
            value={draft.excerpt}
            placeholder="Leave blank to use the opening lines"
            onChange={(e) => set({ excerpt: e.target.value })}
          />
          <p className="st-hint">Shown on the journal listing card.</p>
        </div>
      </div>

      {/* ---------- cover ---------- */}
      <div className="st-cover">
        <div className="st-cover-preview">
          {draft.coverUrl ? (
            <img src={draft.coverUrl} alt={draft.coverAlt || 'Cover preview'} />
          ) : (
            <span className="st-cover-empty">No cover image</span>
          )}
        </div>

        <div className="st-cover-controls">
          <p className="st-field-label">Cover image</p>

          <input
            ref={fileRef}
            type="file"
            className="st-sr"
            accept={COVER_TYPES.join(',')}
            onChange={pickCover}
          />
          <div className="st-cover-buttons">
            <button
              type="button"
              className="st-btn"
              disabled={busy === 'cover'}
              onClick={() => fileRef.current?.click()}
            >
              {busy === 'cover' ? 'Uploading…' : draft.coverUrl ? 'Replace image' : 'Choose image'}
            </button>
            {draft.coverUrl && (
              <button
                type="button"
                className="st-btn st-btn-quiet"
                onClick={() => set({ coverPath: null, coverUrl: null, coverAlt: '' })}
              >
                Remove
              </button>
            )}
          </div>

          <p className="st-hint">
            JPEG, PNG, WebP or AVIF, up to {(MAX_COVER_BYTES / 1024 / 1024).toFixed(0)}MB.
          </p>

          {draft.coverUrl && (
            <div className="st-field">
              <label htmlFor="post-alt">Describe the image</label>
              <input
                id="post-alt"
                className="st-input"
                value={draft.coverAlt}
                placeholder="Paddy drying in the sun at the Erode mill"
                onChange={(e) => set({ coverAlt: e.target.value })}
              />
              <p className="st-hint">Read aloud to anyone using a screen reader. Required to publish.</p>
            </div>
          )}
        </div>
      </div>

      {/* ---------- body ---------- */}
      <div className="st-tabs" role="tablist" aria-label="Editor view">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'write'}
          className={`st-tab${tab === 'write' ? ' is-active' : ''}`}
          onClick={() => setTab('write')}
        >
          Write
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'preview'}
          className={`st-tab${tab === 'preview' ? ' is-active' : ''}`}
          onClick={() => setTab('preview')}
        >
          Preview
        </button>
      </div>

      {/* Both panes render at once. On a wide screen CSS shows them side by
          side and hides the tabs; the tab state only takes effect below
          that, so there is no width-dependent JavaScript here. */}
      <div className="st-panes">
        <div className={`st-pane${tab === 'write' ? ' is-active' : ''}`}>
          <label className="st-field-label" htmlFor="post-body">Post</label>
          <textarea
            id="post-body"
            className="st-textarea"
            value={draft.contentMd}
            placeholder={HELP}
            spellCheck
            onChange={(e) => set({ contentMd: e.target.value })}
          />
          <p className="st-hint">
            Markdown: <code>## heading</code>, <code>**bold**</code>, <code>*italic*</code>,{' '}
            <code>[link](url)</code>, <code>- list</code>, <code>&gt; quote</code>.
          </p>
        </div>

        <div className={`st-pane${tab === 'preview' ? ' is-active' : ''}`}>
          <p className="st-field-label">Preview</p>
          <div className="st-preview blog-prose">
            {draft.contentMd.trim() ? preview : <p className="st-hint">Nothing written yet.</p>}
          </div>
        </div>
      </div>

      {/* ---------- actions ---------- */}
      <div className="st-actions">
        <button
          type="button"
          className="st-btn"
          disabled={Boolean(busy)}
          onClick={() => save('draft')}
        >
          {busy === 'draft' ? 'Saving…' : live ? 'Unpublish' : 'Save draft'}
        </button>

        <button
          type="button"
          className="st-btn st-btn-primary"
          disabled={Boolean(busy)}
          onClick={() => save('published')}
        >
          {busy === 'published' ? 'Publishing…' : live ? 'Update' : 'Publish'}
        </button>

        <button
          type="button"
          className="st-btn st-btn-danger"
          disabled={Boolean(busy)}
          onClick={remove}
        >
          {busy === 'delete' ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
