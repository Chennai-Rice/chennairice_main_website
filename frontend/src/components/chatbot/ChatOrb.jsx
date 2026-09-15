const GRAINS = [
  { top: '38%', left: '30%', width: 14, height: 7, rotate: -22 },
  { top: '48%', left: '52%', width: 12, height: 6, rotate: 18 },
  { top: '58%', left: '38%', width: 13, height: 6.5, rotate: -8 },
  { top: '42%', left: '62%', width: 10, height: 5, rotate: 35 },
]

/** Soft glowing AI orb with subtle rice-grain shapes; breathes slowly, never spins or flashes. */
export default function ChatOrb() {
  return (
    <div className="sk-orb" aria-hidden="true">
      <div className="sk-orb-ring" />
      <div className="sk-orb-core">
        {GRAINS.map((g, i) => (
          <span
            key={i}
            className="sk-orb-grain"
            style={{
              top: g.top,
              left: g.left,
              width: g.width,
              height: g.height,
              transform: `rotate(${g.rotate}deg)`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
