/**
 * Gold decorative flourish used on both sides of section labels
 * (the «≺◆≻» motif in the design). flip renders the mirrored side.
 */
export default function Ornament({ flip = false }) {
  return (
    <svg
      width="52"
      height="14"
      viewBox="0 0 52 14"
      fill="none"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden="true"
    >
      <path d="M0 7h20" stroke="#c69a3f" strokeWidth="1" />
      <path d="M24 7l4-4 4 4-4 4-4-4z" fill="#c69a3f" />
      <path d="M34 7l3-3 3 3-3 3-3-3z" fill="#c69a3f" opacity="0.75" />
      <path d="M42 7l2.5-2.5L47 7l-2.5 2.5L42 7z" fill="#c69a3f" opacity="0.5" />
    </svg>
  )
}
