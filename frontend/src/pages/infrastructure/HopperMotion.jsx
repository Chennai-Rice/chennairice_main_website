/*
  Motion drawn over the raw-paddy hopper image (raw-paddy-hopper.webp, 342 x 440):
  paddy pouring into the hopper. The picture
  itself is untouched; this is an SVG laid exactly over it, in the image's own
  0-100 x 0-128.7 coordinate space (100 wide, height scaled to its ratio).
  Nothing moves for reduced motion.
*/
const H = 128.7

// grains falling into the hopper from above
const POUR = Array.from({ length: 9 }, (_, i) => i)

export default function HopperMotion({ className = '', style }) {
  return (
    <svg className={`hm ${className}`} style={style} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="hm-pour" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3c25c" stopOpacity="0" />
          <stop offset="0.25" stopColor="#f3c25c" stopOpacity="0.9" />
          <stop offset="1" stopColor="#d99a2b" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* paddy pouring in: a soft stream and falling grains */}
      <path className="hm-stream" d="M 42.4 0 L 45.6 0 L 46.6 22 Q 44 24 41.4 22 Z" />
      {POUR.map((i) => (
        <ellipse key={`p${i}`} className="hm-grain hm-fall" cx={42.6 + (i % 3) * 1.4} cy="0" rx="0.75" ry="1.4"
          style={{ animationDelay: `${-i * 0.18}s` }} />
      ))}
      {/* a little splash where it lands */}
      <g className="hm-splash">
        <ellipse cx="44" cy="23.5" rx="4.5" ry="1.1" />
      </g>

    </svg>
  )
}
