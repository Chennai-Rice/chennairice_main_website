import React from "react";
import SiteLayout from "../layouts/SiteLayout.jsx";
import ContestHero from "../components/ContestHero.jsx";
import usePageMeta from "../hooks/usePageMeta.js";
import "./contest.css";
import { PAGE_META } from "../../seo.js";

/**
 * The Super Slogan Contest page, opened from the "Contest" button in the
 * navigation. The festive garland hangs from both top corners (one artwork,
 * the left copy mirrored in CSS); the title, mascot, coupon-style introduction
 * and falling party paper live in ContestHero. How to Participate, the gifts, then Prize
 * Winners, with
 * empty photo frames until the winners are announced.
 */
const WINNER_SLOTS = 3;

// The gifts on offer, from public/assets/gift. Where the folder holds two
// versions of a gift, the sharper one is used.
const GIFTS = [
  { name: "Car", img: "prize-car.webp" },
  { name: "Scooter", img: "prize-scooter.webp" },
  { name: "Gold Jewellery", img: "jewellery.webp" },
  { name: "Gold Coin", img: "prize-gold-coin.webp" },
  { name: "LED TV", img: "prize-tv.webp" },
  { name: "Refrigerator", img: "prize-fridge.webp" },
  { name: "Smartphone", img: "prize-smartphone.webp" },
  { name: "Silk Sarees", img: "saree.webp" },
  { name: "Mixer Grinder", img: "mixer.webp" },
  { name: "Gas Stove", img: "stove.webp" },
  { name: "Pressure Cooker", img: "cooker.webp" },
  { name: "Cookware Set", img: "prize-cookware.webp" },
];
// How to Participate, as the artwork shows it (used on phones).
const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24", width: 30, height: 30 };
const STEPS = [
  {
    title: "Buy Chennai Rice",
    text: "Purchase any Chennai Rice product and find the unique code.",
    icon: (
      <svg {...ICON}>
        <path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2" />
        <circle cx="9.5" cy="19.5" r="1.3" />
        <circle cx="16.5" cy="19.5" r="1.3" />
      </svg>
    ),
  },
  {
    title: "Scan & Enter",
    text: "Scan the QR code and submit your details.",
    icon: (
      <svg {...ICON}>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <rect x="7.5" y="7.5" width="3.5" height="3.5" />
        <rect x="13" y="7.5" width="3.5" height="3.5" />
        <rect x="7.5" y="13" width="3.5" height="3.5" />
        <path d="M13 13h1.5v1.5M16.5 13v3.5H13" />
      </svg>
    ),
  },
  {
    title: "Share Your Slogan",
    text: "Win exciting prizes with your best slogan.",
    icon: (
      <svg {...ICON}>
        <rect x="4" y="9" width="16" height="4" rx="0.8" />
        <path d="M5.5 13v6a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-6M12 9v11" />
        <path d="M12 9c-1.5-3.5-5-4-5-1.5C7 9 12 9 12 9zM12 9c1.5-3.5 5-4 5-1.5C17 9 12 9 12 9z" />
      </svg>
    ),
  },
];

export default function ContestPage() {
  usePageMeta(PAGE_META.contest.title, PAGE_META.contest.description);

  return (
    <SiteLayout skipTo="contest-main" skipLabel="Skip to the contest">
      <main id="contest-main" className="contest-page">
        <img className="contest-garland contest-garland-right" src="/image.png" alt="" aria-hidden="true" />
        <img className="contest-garland contest-garland-left" src="/image.png" alt="" aria-hidden="true" />
        <ContestHero />

        {/* How to Participate: on wide screens the designed artwork, which
            carries its own heading (its alt text repeats the three steps). On
            phones the same three steps as stacked cards, so nothing scrolls
            sideways or shrinks past reading size. */}
        {/* SEO Optimization Plan, Oct 2026. */}
        <p className="contest-intro">
          Have a great slogan for Chennai Rice? Take part in the Chennai Rice Super Slogan Contest 2026 and
          share your creativity. Eligible promotional packs contain a coupon code that participants can use
          to submit their entry through the official contest portal or designated WhatsApp participation
          channel.
        </p>
        <section className="contest-howto" aria-label="How to Participate">
          <img
            className="contest-howto-art"
            src="/assets/contest-how-to-participate.webp"
            width="2172"
            height="724"
            loading="lazy"
            alt="How to Participate. 1, Buy Chennai Rice: purchase any Chennai Rice product and find the unique code. 2, Scan and Enter: scan the QR code and submit your details. 3, Share Your Slogan: win exciting prizes with your best slogan."
          />
          <div className="contest-howto-mobile">
            <h2 className="contest-howto-title">How to Participate</h2>
            <span className="contest-howto-orn" aria-hidden="true" />
            <ol className="contest-steps">
              {STEPS.map((step, i) => (
                <li key={step.title} className="contest-step">
                  <span className="contest-step-no" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <span className="contest-step-icon" aria-hidden="true">{step.icon}</span>
                  <h3>{step.title}</h3>
                  <span className="contest-howto-orn" aria-hidden="true" />
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="contest-gifts" aria-labelledby="contest-gifts-heading">
          <div className="contest-bar">
            <span className="contest-bar-orn" aria-hidden="true">&#10022;</span>
            <h2 id="contest-gifts-heading">Exciting Gifts</h2>
            <span className="contest-bar-orn" aria-hidden="true">&#10022;</span>
          </div>

          <ul className="contest-gift-grid">
            {GIFTS.map((g) => (
              <li key={g.name} className="contest-gift">
                <div className="contest-gift-media">
                  <img src={`/assets/gift/${g.img}`} alt={g.name} loading="lazy" />
                </div>
                <p className="contest-gift-name">{g.name}</p>
              </li>
            ))}
          </ul>
          <p className="contest-gifts-note">T&amp;C apply</p>
        </section>

        <section className="contest-winners" aria-labelledby="contest-winners-heading">
          <div className="contest-bar">
            <span className="contest-bar-orn" aria-hidden="true">&#10022;</span>
            <h2 id="contest-winners-heading">Prize Winners</h2>
            <span className="contest-bar-orn" aria-hidden="true">&#10022;</span>
          </div>

          <ul className="contest-frames">
            {Array.from({ length: WINNER_SLOTS }, (_, i) => (
              <li key={i} className="contest-frame">
                <div className="contest-frame-photo">
                  <span className="contest-frame-q" aria-hidden="true">?</span>
                </div>
                <p className="contest-frame-note">Yet to be announced</p>
              </li>
            ))}
          </ul>

          <span className="contest-note-rule" aria-hidden="true"><i /><b /><i /></span>
          <p className="contest-winners-note">
            The winners of the Chennai Rice Super Slogan Contest will be announced right here once the
            contest closes. Every slogan is read with care, and the finest ones will be celebrated on
            this page with their names and prizes. Keep your coupon safe, and check back soon to see if
            your slogan is among the winners.
          </p>
        </section>
      </main>
    </SiteLayout>
  );
}
