import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { renderMarkdown } from '../../lib/markdown.jsx'
import { fetchPostBySlug, formatPostDate } from '../../services/blog.service.js'
import '../page.css'
import './blog.css'

/**
 * /blog/:slug — one post.
 *
 * A signed-in author reading their own unpublished post gets it here, which
 * is the preview: it falls out of the RLS policy rather than needing a
 * separate route. The draft banner exists so that is never mistaken for
 * something the public can see.
 */
export default function BlogPostPage() {
  const { slug } = useParams()
  const [post, setPost] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setPost(null)

    fetchPostBySlug(slug)
      .then((row) => {
        if (cancelled) return
        setPost(row)
        setState(row ? 'ready' : 'missing')
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err?.setupRequired
            ? 'The journal is not available just yet. Please check back soon.'
            : err.message || 'Could not load this post.'
        )
        setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  // Parsing is the expensive part of this page, so it happens once per post
  // rather than on every render.
  const body = useMemo(() => (post ? renderMarkdown(post.contentMd) : []), [post])

  if (state === 'loading') {
    return (
      <main className="page">
        <div className="container page-inner page-inner--wide">
          <p className="blog-status" role="status">Loading…</p>
        </div>
      </main>
    )
  }

  if (state === 'error' || state === 'missing') {
    return (
      <main className="page page-center">
        <div className="container page-inner">
          <h1 className="page-title">{state === 'missing' ? 'Post not found' : 'Something went wrong'}</h1>
          <p className="page-text">
            {state === 'missing'
              ? 'This post may have been moved, or it has not been published yet.'
              : error}
          </p>
          <Link className="btn-maroon" to="/blog">
            Back to the Journal
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="container page-inner page-inner--wide">
        {post.status !== 'published' && (
          <p className="blog-draft-note">
            This is a draft. Only you can see it — it is not on the public journal.
          </p>
        )}

        <article className="blog-post">
          <header className="blog-post-head">
            <h1 className="blog-post-title">{post.title}</h1>
            <p className="blog-post-meta">
              <span>{post.author}</span>
              {post.publishedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
                </>
              )}
              {post.readingMinutes ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{post.readingMinutes} min read</span>
                </>
              ) : null}
            </p>
          </header>

          {post.coverUrl && (
            <figure className="blog-post-cover">
              <img src={post.coverUrl} alt={post.coverAlt} />
            </figure>
          )}

          {/* renderMarkdown returns React elements, never an HTML string —
              there is no dangerouslySetInnerHTML anywhere in this feature. */}
          <div className="blog-prose">{body}</div>
        </article>

        <Link className="blog-back" to="/blog">
          &larr; All posts
        </Link>
      </div>
    </main>
  )
}
