import React, { useMemo } from "react";
import { Link } from "react-router-dom";

/**
 * Decorative title and introduction for the Super Slogan Contest page: the contest name in maroon
 * and gold with flourishes and dividers, set straight on the page.
 * Drawn in SVG + CSS (no raster file) so it stays sharp at every width.
 */
function Flourish({ className }) {
  // One leafy flourish with a curl and a bead trail; the right-hand copy is
  // this same drawing mirrored in CSS.
  return (
    <svg className={className} viewBox="0 0 180 90" aria-hidden="true">
      <path d="M4 62 C40 70 70 62 96 42 C104 36 110 30 112 22" fill="none" stroke="url(#kb-gold)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M96 42 C84 24 92 10 112 6 C118 22 112 36 96 42Z" fill="url(#kb-gold)" />
      <path d="M72 55 C60 42 62 30 76 24 C84 36 82 48 72 55Z" fill="url(#kb-gold)" opacity="0.9" />
      <path d="M118 36 C132 30 144 34 150 44 C138 52 126 48 118 36Z" fill="url(#kb-gold)" opacity="0.9" />
      <path d="M4 62 C-4 72 8 84 18 78 C26 73 22 64 14 66" fill="none" stroke="url(#kb-gold)" strokeWidth="2" strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={30 + i * 11} cy={78 - i * 1.5} r={2.2 - i * 0.2} fill="url(#kb-gold)" />
      ))}
    </svg>
  );
}

function Divider() {
  return (
    <span className="kb-divider" aria-hidden="true">
      <i />
      <b />
      <i />
    </span>
  );
}

const CONFETTI = 46;
const CONFETTI_COLOURS = ["#a50f1d", "#d9a63c", "#e8452c", "#f4c95d", "#fff4d6", "#2f7a3a", "#e9a0b4"];

/** Party paper falling through the contest section. Pure CSS motion on a
 *  click-through layer; each piece's place, size, colour and speed are fixed
 *  once so a re-render never makes them jump. */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        shape: ["rect", "strip", "dot"][i % 3],
        colour: CONFETTI_COLOURS[Math.floor(Math.random() * CONFETTI_COLOURS.length)],
        size: 7 + Math.random() * 7,
        duration: 6 + Math.random() * 6,
        // Negative delay: the section opens with paper already mid-fall.
        delay: -Math.random() * 12,
        sway: (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 50),
        spin: 360 + Math.random() * 720,
      })),
    []
  );
  return (
    <div className="kb-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <i
          key={p.id}
          className={`kb-conf kb-conf-${p.shape}`}
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.shape === "strip" ? p.size * 2.4 : p.shape === "rect" ? p.size * 1.5 : p.size}px`,
            background: p.colour,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            "--sway": `${p.sway}px`,
            "--spin": `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}

export default function ContestHero() {
  return (
    <div className="kb-wrap">
      <Confetti />
      {/* Shared gold gradient: the corners and flourishes reference it by id,
          so it lives outside any one of them (the flourishes are hidden on
          small screens, which would take the gradient with them). */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <linearGradient id="kb-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9bf55" />
          <stop offset="0.45" stopColor="#c8922a" />
          <stop offset="1" stopColor="#8a5a0c" />
        </linearGradient>
      </defs>
      </svg>
      <div className="kb" role="img" aria-label="Super Slogan Contest">
        <Flourish className="kb-flourish kb-fl-l" />
        <Flourish className="kb-flourish kb-fl-r" />
        <div className="kb-text">
          <Divider />
          {/* The page's H1; "Chennai Rice" is for search and screen readers,
              the artwork shows the contest's own name. */}
          <h1 className="kb-title">
            <span className="visually-hidden">Chennai Rice </span>Super Slogan Contest<span className="visually-hidden"> 2026</span>
          </h1>
          <Divider />
        </div>
      </div>

      {/* The mascot greets the visitor and introduces the contest. The facts
          are the ones on the contest poster (ContestPopup.jsx). The picture is
          the mascot-with-pack promo artwork on a transparent background, so it
          stands directly on the page. */}
      <aside className="kb-intro" aria-label="About the Super Slogan Contest">
        <img
          className="kb-mascot"
          src="/assets/contest-mascot-pack-v2.webp"
          width="760"
          height="950"
          alt="The Chennai Rice mascot, a grain of rice in a straw hat and sunglasses, giving a thumbs up beside a Kitchidi Ponni Rice 5 kg pack"
        />
        {/* The introduction is laid out like a coupon sheet: a ticket with
            notched sides, a dashed tear-off line and a stub. */}
        <div className="kb-copy">
          <div className="kb-ticket">
            <div className="kb-ticket-main">
              <p className="kb-copy-hello">Vanakkam!</p>
              <p>
                Welcome to the Chennai Rice Super Slogan Contest. Craft the best slogan and bring home the grand
                prize. Buy a Kitchidi Ponni Rice 5&nbsp;kg or 26&nbsp;kg bag, find the coupon inside, scan it and
                register, and collect your gift.
              </p>
            </div>
            <div className="kb-ticket-stub" aria-hidden="true">
              <span>Super Slogan Contest</span>
            </div>
          </div>
          {/* Taking part starts with buying a pack (the coupon is inside), so
              the page ends on the way to it. */}
          <Link className="kb-cta" to="/products/kitchidi-ponni-rice">
            Buy Kitchidi Ponni Rice
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </aside>
    </div>
  );
}
