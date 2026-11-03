import { useRef } from 'react'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const round = (n) => Math.round(n * 100) / 100

/**
 * A post's cover image with the buttons the writer placed on it (Nov 2026). Each button has its own link, a position
 * (x and y as a % of the cover), a size and a colour, all set in the preview (PostPreview.jsx → "Edit buttons"). The
 * sizes scale with the cover's width, so a button keeps its place and proportions on every screen. `extra` adds height
 * under the picture, filled with `fill`.
 *
 * Read-only by default: the buttons are links. With `editing` they become handles: drag to move, drag the round handle
 * to resize, arrow keys to nudge; they do not open their link.
 */
export default function PostCover({ url, alt, buttons = [], extra = 0, fill = '', editing = false, selected = '', onSelect, onChange }) {
  const box = useRef(null)
  const layered = buttons.length > 0 || extra > 0
  const style = { ...(extra > 0 ? { '--extra': extra } : {}), ...(fill ? { '--fill': fill } : {}) }

  const update = (id, patch) => onChange?.(buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)))

  function drag(e, b) {
    e.preventDefault()
    e.stopPropagation()
    onSelect?.(b.id)
    const rect = box.current.getBoundingClientRect()
    const start = { px: e.clientX, py: e.clientY, x: b.x, y: b.y }
    const move = (ev) => update(b.id, {
      x: round(clamp(start.x + ((ev.clientX - start.px) / rect.width) * 100, 0, 100)),
      y: round(clamp(start.y + ((ev.clientY - start.py) / rect.height) * 100, 0, 100)),
    })
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  // Dragging the handle grows the button on both sides (it is centred on its spot), so a pointer move of dx widens it by 2·dx.
  function resize(e, b) {
    e.preventDefault()
    e.stopPropagation()
    onSelect?.(b.id)
    const width = e.currentTarget.parentElement.getBoundingClientRect().width
    const start = { px: e.clientX, size: b.size }
    const move = (ev) => update(b.id, { size: round(clamp(start.size * (1 + (2 * (ev.clientX - start.px)) / width), 0.8, 6)) })
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  function nudge(e, b) {
    const step = e.shiftKey ? 2 : 0.5
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!move) return
    e.preventDefault()
    update(b.id, { x: round(clamp(b.x + move[0], 0, 100)), y: round(clamp(b.y + move[1], 0, 100)) })
  }

  return (
    <figure ref={box} className={`blog-post-cover${layered ? ' has-layer' : ''}${editing ? ' is-editing' : ''}`} style={style}>
      <img src={url} alt={alt} draggable="false" />
      {extra > 0 && <div className="blog-cover-extra" aria-hidden="true" />}
      {buttons.map((b) => {
        const place = { left: `${b.x}%`, top: `${b.y}%`, '--s': b.size }
        const cls = `blog-cb blog-cb-${b.color === 'maroon' ? 'maroon' : 'white'}`
        if (editing) {
          return (
            <span
              key={b.id}
              role="button"
              tabIndex={0}
              className={`${cls} is-edit${selected === b.id ? ' is-selected' : ''}`}
              style={place}
              onPointerDown={(e) => drag(e, b)}
              onFocus={() => onSelect?.(b.id)}
              onKeyDown={(e) => nudge(e, b)}
              aria-label={`${b.text}: drag to move`}
            >
              {b.text}
              {selected === b.id && <i className="blog-cb-handle" onPointerDown={(e) => resize(e, b)} aria-hidden="true" />}
            </span>
          )
        }
        return (
          <a
            key={b.id}
            className={cls}
            style={place}
            href={b.href}
            {...(/^https?:/i.test(b.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {b.text}
          </a>
        )
      })}
    </figure>
  )
}
