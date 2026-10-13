import React, { useId } from "react";

// The Super Slogan Contest dress: the maroon-and-gold plaque (on the
// Kitchidi Ponni card and, larger, on its product page) and the page's
// carnival decorations: falling petals and
// fireworks bursting in the background.

// Products in the contest.
export const CONTEST_PRODUCTS = ["kitchidi-ponni-rice"];

// The plaque's outline: straight top and bottom, scalloped ends.
const PLAQUE = "M34 5 H266 C280 5 282 13 289 17 C298 22 298 48 289 53 C282 57 280 65 266 65 H34 C20 65 18 57 11 53 C2 48 2 22 11 17 C18 13 20 5 34 5 Z";

/** Maroon plaque, double gold border, "✦ Super ✦" over "Slogan Contest". */
export function ContestPlaque({ className = "" }) {
  const id = useId().replace(/:/g, "");
  return (
    <span className={`contest-plaque ${className}`}>
      <svg className="contest-plaque-shape" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8b1a24" />
            <stop offset="1" stopColor="#5a0f16" />
          </linearGradient>
          <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff1b8" />
            <stop offset="0.35" stopColor="#e2b650" />
            <stop offset="0.65" stopColor="#b8862b" />
            <stop offset="1" stopColor="#f5d77e" />
          </linearGradient>
        </defs>
        <path d={PLAQUE} fill={`url(#${id}-fill)`} stroke={`url(#${id}-gold)`} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <path d={PLAQUE} fill="none" stroke="#e2b650" strokeOpacity="0.55" strokeWidth="1" vectorEffect="non-scaling-stroke"
          transform="translate(150 35) scale(0.95 0.82) translate(-150 -35)" />
      </svg>
      <span className="contest-plaque-text">
        <span className="contest-plaque-small">✦ Super ✦</span>
        <span className="contest-plaque-main">Slogan Contest</span>
        <span className="contest-plaque-rule" aria-hidden="true" />
      </span>
    </span>
  );
}

/* ------------------------------------------------------------ the page */

// Firework bursts: where (percent of the page) and when they go off.
const BURSTS = [
  { x: 8, y: 9, c: "#e11d48", d: 0 }, { x: 90, y: 7, c: "#f59e0b", d: 1.1 },
  { x: 74, y: 30, c: "#db2777", d: 2.2 }, { x: 20, y: 38, c: "#f97316", d: 3.0 },
  { x: 52, y: 3, c: "#c99a3a", d: 1.7 }, { x: 95, y: 50, c: "#e11d48", d: 3.8 },
  { x: 5, y: 64, c: "#f59e0b", d: 2.6 }, { x: 82, y: 76, c: "#db2777", d: 0.6 },
  { x: 35, y: 18, c: "#a3202b", d: 3.4 }, { x: 64, y: 58, c: "#f97316", d: 1.4 },
]

/** Skyshots: a rising trail, then a ring of sparks that bursts and fades. */
function Fireworks() {
  return (
    <div className="contest-fireworks" aria-hidden="true">
      {BURSTS.map((b, i) => (
        <span key={i} className="contest-burst" style={{ left: `${b.x}%`, top: `${b.y}%`, "--c": b.c, animationDelay: `${b.d}s` }}>
          <span className="contest-trail" style={{ animationDelay: `${b.d}s` }} />
          {[...Array(18)].map((_, k) => (
            <span key={k} className="contest-spark-ray" style={{ "--a": `${(360 / 18) * k}deg`, animationDelay: `${b.d}s` }} />
          ))}
        </span>
      ))}
    </div>
  );
}

/** Marigold and rose petals drifting down. */
function Petals({ count = 22 }) {
  return (
    <div className="contest-petals" aria-hidden="true">
      {[...Array(count)].map((_, i) => (
        <span key={i} className={`contest-petal contest-petal--${i % 4}`}
          style={{ left: `${(i * 47) % 100}%`, animationDelay: `${(i * 0.83) % 9}s`, animationDuration: `${10 + (i % 5) * 1.8}s` }} />
      ))}
    </div>
  );
}

/** The decorated top of the contest product page. */
export function ContestPageTop() {
  return (
    <div className="contest-page-top">
      {/* Flower-and-bell garland hanging in the top right corner. */}
      <img className="contest-corner-garland" src="/assets/contest/corner-garland.webp" alt="" aria-hidden="true" />
      <div className="contest-page-plaque">
        <ContestPlaque className="contest-plaque--hero" />
      </div>
    </div>
  );
}

/** Background layers for the whole contest page. */
export function ContestPageBackdrop() {
  return (
    <>
      <Fireworks />
      <Petals />
    </>
  );
}
