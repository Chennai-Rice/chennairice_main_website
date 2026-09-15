import { useState } from 'react'

/**
 * Image that tries the real asset first and silently falls back to a
 * bundled placeholder if the real file has not been uploaded yet.
 * Accepts either a string src or an asset object { src, fallback }.
 */
export default function Img({ src, fallback, alt = '', ...rest }) {
  const real = typeof src === 'object' && src !== null ? src.src : src
  const fb = typeof src === 'object' && src !== null ? src.fallback : fallback
  const [cur, setCur] = useState(real)

  return (
    <img
      src={cur}
      alt={alt}
      onError={() => {
        if (fb && cur !== fb) setCur(fb)
      }}
      {...rest}
    />
  )
}
