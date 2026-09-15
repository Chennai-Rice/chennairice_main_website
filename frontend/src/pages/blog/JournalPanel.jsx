import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchMyPosts,
  fetchPostById,
  formatPostDate,
} from '../../services/blog.service.js'
import PostEditor from './components/PostEditor.jsx'
import './studio.css'

/**
 * The writing tool, as a panel rather than a page.
 *
 * It carries no login of its own and no shell: /admin is the one staff
 * portal, and this renders inside it once an account that is in
 * blog_authors signs in. What it may read and write is still decided by the
 * RLS policies in database/migrations/add_blog.sql, not by the fact that it
 * is being shown.
 *
 * The .st-scope wrapper is what brings the tool's own tokens with it — see
 * the token block in studio.css, which is shared with the standalone shell.
 */
export default function JournalPanel({ author }) {
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [opening, setOpening] = useState(false)

  const load = useCallback(() => {
    fetchMyPosts()
      .then((rows) => {
        setPosts(rows)
        setError('')
      })
      .catch((err) => setError(err.message || 'Could not load your posts.'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openPost = async (id) => {
    setError('')
    setOpening(true)
    try {
      const full = await fetchPostById(id)
      if (!full) {
        setError('That post could not be opened. It may have been deleted.')
        load()
        return
      }
      setEditing(full)
    } catch (err) {
      setError(err.message || 'Could not open that post.')
    } finally {
      setOpening(false)
    }
  }

  const closeEditor = () => {
    setEditing(null)
    load()
  }

  return (
    <div className="st-scope">
      {error && <p className="st-alert" role="alert">{error}</p>}

      {editing ? (
        <PostEditor
          key={editing.id || 'new'}
          post={editing.id ? editing : null}
          author={author}
          onSaved={load}
          onClose={closeEditor}
          onDeleted={closeEditor}
        />
      ) : (
        <>
          <div className="st-list-head">
            <div>
              <h2 className="st-heading">Posts</h2>
              <p className="st-hint">
                Writing as {author.display_name}
                {author.role === 'editor' && <span className="st-role">Editor</span>}
              </p>
            </div>
            <div className="st-list-head-actions">
              <Link className="st-btn st-btn-quiet" to="/blog">View journal</Link>
              <button
                type="button"
                className="st-btn st-btn-primary"
                onClick={() => setEditing({ id: null })}
              >
                Write a post
              </button>
            </div>
          </div>

          {!posts && !error && <p className="st-hint">Loading…</p>}

          {posts && posts.length === 0 && (
            <div className="st-empty">
              <p className="st-empty-title">Nothing written yet</p>
              <p className="st-hint">
                Your first post starts as a draft — only you can see it until you publish.
              </p>
            </div>
          )}

          {posts && posts.length > 0 && (
            <ul className="st-list">
              {posts.map((post) => (
                <li key={post.id}>
                  <button
                    type="button"
                    className="st-list-item"
                    disabled={opening}
                    onClick={() => openPost(post.id)}
                  >
                    <span className="st-list-media">
                      {post.coverUrl ? (
                        <img src={post.coverUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="st-list-media-empty" aria-hidden="true" />
                      )}
                    </span>

                    <span className="st-list-body">
                      <span className="st-list-title">{post.title || 'Untitled'}</span>
                      <span className="st-list-meta">
                        <span className={`st-badge${post.status === 'published' ? ' is-live' : ''}`}>
                          {post.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                        {post.status === 'published' && post.publishedAt && (
                          <span>{formatPostDate(post.publishedAt)}</span>
                        )}
                        {/* Whose post it is only matters to an editor, who
                            can see everyone's. An author sees only their
                            own, so the byline would be noise. */}
                        {author.role === 'editor' && <span>{post.author}</span>}
                        <span className="st-list-slug">/blog/{post.slug}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
