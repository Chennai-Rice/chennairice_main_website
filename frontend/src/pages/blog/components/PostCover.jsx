/**
 * A post's cover image. The buttons the post starts with (see splitLeadButtons in lib/markdown.jsx) sit in a band at the
 * bottom of the cover, as white buttons, so the cover is a little taller and carries its own actions.
 */
export default function PostCover({ url, alt, buttons = [] }) {
  return (
    <figure className="blog-post-cover">
      <img src={url} alt={alt} />
      {buttons.length > 0 && (
        <div className="blog-cover-actions">
          {buttons.map((b) => (
            <a
              key={b.href + b.text}
              className="blog-cover-btn"
              href={b.href}
              {...(/^https?:/i.test(b.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {b.text}
            </a>
          ))}
        </div>
      )}
    </figure>
  )
}
