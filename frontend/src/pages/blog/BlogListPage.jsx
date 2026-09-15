import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Ornament from '../../components/Ornament.jsx'
import { fetchPublishedPosts, formatPostDate } from '../../services/blog.service.js'
import '../page.css'
import './blog.css'

/**
 * /blog — everything published, newest first.
 *
 * Reads through the ordinary anon client, so what appears here is decided
 * by the RLS policy rather than by this query: drafts and scheduled posts
 * are not filtered out of the results, they are never in them.
 */
export default function BlogListPage() {
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchPublishedPosts()
      .then((rows) => {
        if (!cancelled) setPosts(rows)
      })
      .catch((err) => {
        if (cancelled) return
        // A missing table is a setup step the owner has not done yet, not
        // something a reader can act on — so they get a plain apology
        // rather than the name of a database table.
        setError(
          err?.setupRequired
            ? 'The journal is not available just yet. Please check back soon.'
            : err.message || 'Could not load the journal.'
        )
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="page">
      <div className="container page-inner page-inner--wide">
        <div className="section-label">
          <Ornament />
          <span>Journal</span>
          <Ornament flip />
        </div>
        <h1 className="page-title">From the Mill</h1>
        <p className="page-text">
          Notes from the fields, the mill floor and the kitchen.
        </p>

        {error && <p className="blog-alert" role="alert">{error}</p>}

        {!posts && !error && (
          <p className="blog-status" role="status">Loading the journal…</p>
        )}

        {posts && posts.length === 0 && (
          <p className="blog-status">
            Nothing has been published yet. The first notes are being written.
          </p>
        )}

        {posts && posts.length > 0 && (
          <ul className="blog-grid">
            {posts.map((post) => (
              <li key={post.id}>
                <article className="blog-card">
                  <Link className="blog-card-link" to={`/blog/${post.slug}`}>
                    <div className="blog-card-media">
                      {post.coverUrl ? (
                        <img src={post.coverUrl} alt={post.coverAlt} loading="lazy" />
                      ) : (
                        /* A post without a cover keeps the same card shape,
                           so a row of cards never goes ragged. */
                        <span className="blog-card-placeholder" aria-hidden="true" />
                      )}
                    </div>

                    <div className="blog-card-body">
                      <h2 className="blog-card-title">{post.title}</h2>
                      {post.excerpt && <p className="blog-card-excerpt">{post.excerpt}</p>}

                      <p className="blog-card-meta">
                        <span>{post.author}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
                        {post.readingMinutes ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{post.readingMinutes} min read</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
