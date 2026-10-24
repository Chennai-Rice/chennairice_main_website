// "Fly to cart": when something is added, a copy of its picture leaves where it is on the page,
// slides down, shrinks and lands on the bag icon of the "Proceed to cart" bar, which gives a small
// bump. The cart itself is updated as before; this is only the show. It does nothing when the
// visitor prefers reduced motion, when there is no picture to fly, or when the bar is not there.

const BAR_ICON = '.checkout-bar-icon'
const FLIGHT_MS = 850

/** Where the bag icon will rest: the bar slides up 16 px when it first appears, so correct for that. */
function iconRect(icon) {
  const rect = icon.getBoundingClientRect()
  const bar = icon.closest('.checkout-bar')
  let lift = 0
  try {
    lift = new DOMMatrixReadOnly(getComputedStyle(bar).transform).m42 || 0
  } catch { /* no transform support: use the rect as it is */ }
  return { left: rect.left, top: rect.top - lift, width: rect.width, height: rect.height }
}

export function flyToCart(picture) {
  if (typeof window === 'undefined' || !picture?.getBoundingClientRect) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const from = picture.getBoundingClientRect()
  if (from.width < 20 || from.height < 20) return

  const flyer = document.createElement('img')
  flyer.src = picture.currentSrc || picture.src
  flyer.alt = ''
  flyer.setAttribute('aria-hidden', 'true')
  Object.assign(flyer.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    objectFit: 'contain',
    margin: '0',
    zIndex: '3000',
    pointerEvents: 'none',
    willChange: 'transform, opacity',
    filter: 'drop-shadow(0 10px 18px rgba(74, 16, 26, 0.35))',
    transformOrigin: 'center center',
  })

  // On the very first add the bar is only mounted a moment later: wait a few frames for it.
  let tries = 0
  const launch = () => {
    const icon = document.querySelector(BAR_ICON)
    if (!icon && tries < 10) { tries += 1; window.setTimeout(launch, 40); return }
    if (!icon) return
    const to = iconRect(icon)
    const dx = to.left + to.width / 2 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - (from.top + from.height / 2)
    const end = Math.max(0.06, Math.min(to.width / from.width, to.height / from.height))
    document.body.appendChild(flyer)
    const animation = flyer.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
        // Drops a little first, then curves into the bag.
        { transform: `translate(${dx * 0.28}px, ${dy * 0.5}px) scale(${Math.max(end, 0.45)})`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(${end})`, opacity: 0.35, offset: 1 },
      ],
      { duration: FLIGHT_MS, easing: 'cubic-bezier(0.45, 0.05, 0.25, 1)', fill: 'forwards' }
    )
    animation.onfinish = animation.oncancel = () => {
      flyer.remove()
      document.querySelector(BAR_ICON)?.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
        { duration: 380, easing: 'ease-out' }
      )
    }
  }
  launch()
}
