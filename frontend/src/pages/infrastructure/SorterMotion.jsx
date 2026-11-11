/*
  A colour sorter at work, drawn over its picture (colour-sorter-white.webp,
  380 x 440) inside the line's SVG: the machine body stays still, as a real one
  does. What moves is what moves in the machine:
    - the vibratory feeder under the hopper buzzes (a fine, fast jitter),
    - grain streams down the four chutes past the sensors,
    - the sensor lights flicker slightly,
    - the air ejectors fire short puffs now and then, flicking a bad grain out.
  Coordinates are the picture's own: 0-100 across, 0-H down (H = 100 / ratio).
*/
const H = (100 * 440) / 380

// the four chutes: where each grain stream starts (under its light) and ends
const CHUTES = [
  [[25.5, 40.4], [21.2, 49.2]],
  [[36.9, 41.5], [33, 50.8]],
  [[48.3, 43], [44.4, 52.3]],
  [[60.1, 44], [55.8, 53.4]],
].map(([a, b]) => [[a[0], (a[1] / 100) * H], [b[0], (b[1] / 100) * H]])

const LIGHTS = [[25.4, 39.4], [36.8, 40.5], [48.2, 42], [60.1, 43]].map(([x, y]) => [x, (y / 100) * H])

// feeder tray under the hopper (the grain bed that vibrates)
const FEEDER = { x: 38, y: (19 / 100) * H, w: 22, h: (6.5 / 100) * H }

// each ejector fires on its own rhythm, so the puffs never line up
const PUFF = [2.3, 3.1, 1.9, 2.7]

export default function SorterMotion({ href, x, y, w, h }) {
  const angle = (k) => {
    const [[x0, y0], [x1, y1]] = CHUTES[k]
    return (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI
  }
  return (
    <svg x={x} y={y} width={w} height={h} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" overflow="visible" aria-hidden="true">
      <defs>
        <clipPath id="sm-feeder"><rect x={FEEDER.x} y={FEEDER.y} width={FEEDER.w} height={FEEDER.h} rx="1" /></clipPath>
        <radialGradient id="sm-glow">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#e9f6ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#e9f6ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* the vibratory feeder: the same picture, clipped to the tray, jittering */}
      <g clipPath="url(#sm-feeder)">
        <image href={href} x="0" y="0" width="100" height={H} preserveAspectRatio="none">
          <animateTransform attributeName="transform" type="translate" values="0 0; 0.25 -0.2; -0.2 0.15; 0.15 0.2; 0 0" dur="0.09s" repeatCount="indefinite" />
        </image>
      </g>

      {/* grain streaming down each chute */}
      {CHUTES.map(([[x0, y0], [x1, y1]], k) => (
        <g key={`c${k}`}>
          {Array.from({ length: 6 }, (_, j) => (
            <ellipse key={j} rx="0.9" ry="0.45" fill="#fbf6ea" opacity="0.9" transform={`rotate(${angle(k)})`}>
              <animateMotion dur="0.75s" begin={`${(-j * 0.125 - k * 0.05).toFixed(3)}s`} repeatCount="indefinite"
                path={`M ${x0} ${y0} L ${x1} ${y1}`} />
            </ellipse>
          ))}
        </g>
      ))}

      {/* sensor lights: a slight flicker, each at its own pace */}
      {LIGHTS.map(([lx, ly], k) => (
        <circle key={`l${k}`} cx={lx} cy={ly} r="3.2" fill="url(#sm-glow)">
          <animate attributeName="opacity" values="0.75;1;0.85;1;0.75" dur={`${(0.7 + k * 0.13).toFixed(2)}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* air ejectors: a short puff two-thirds down a chute, and a dark grain flicked out */}
      {CHUTES.map(([[x0, y0], [x1, y1]], k) => {
        const px = x0 + (x1 - x0) * 0.66
        const py = y0 + (y1 - y0) * 0.66
        const dur = `${PUFF[k]}s`
        const kt = '0;0.04;0.12;1'
        return (
          <g key={`e${k}`}>
            <circle cx={px} cy={py} r="0" fill="#ffffff" opacity="0">
              <animate attributeName="r" values="0;2.4;3.2;3.2" keyTimes={kt} dur={dur} begin={`${-k * 0.6}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.85;0;0" keyTimes={kt} dur={dur} begin={`${-k * 0.6}s`} repeatCount="indefinite" />
            </circle>
            <ellipse cx={px} cy={py} rx="0.85" ry="0.45" fill="#3a2f2a" opacity="0">
              <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.02;0.14;0.18;1" dur={dur} begin={`${-k * 0.6}s`} repeatCount="indefinite" />
              <animateTransform attributeName="transform" type="translate" values="0 0;3.5 1.5;3.5 1.5" keyTimes="0;0.16;1" dur={dur} begin={`${-k * 0.6}s`} repeatCount="indefinite" />
            </ellipse>
          </g>
        )
      })}
    </svg>
  )
}
