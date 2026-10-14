import React from "react";
import SiteLayout from "../layouts/SiteLayout.jsx";
import ContestHero from "../components/ContestHero.jsx";
import usePageMeta from "../hooks/usePageMeta.js";
import "./contest.css";

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
export default function ContestPage() {
  usePageMeta(
    "Super Slogan Contest — Chennai Rice Industries",
    "Craft the best slogan and bring home the grand prize. Buy a Kitchidi Ponni Rice 5 kg or 26 kg bag, find the coupon inside, scan it and register."
  );

  return (
    <SiteLayout skipTo="contest-main" skipLabel="Skip to the contest">
      <main id="contest-main" className="contest-page">
        <img className="contest-garland contest-garland-right" src="/image.png" alt="" aria-hidden="true" />
        <img className="contest-garland contest-garland-left" src="/image.png" alt="" aria-hidden="true" />
        <ContestHero />

        {/* How to Participate: the designed artwork carries its own heading,
            so the image stands alone; its alt text repeats the three steps. */}
        <section className="contest-howto" aria-label="How to Participate">
          <img
            src="/assets/contest-how-to-participate.webp"
            width="2172"
            height="724"
            loading="lazy"
            alt="How to Participate. 1, Buy Chennai Rice: purchase any Chennai Rice product and find the unique code. 2, Scan and Enter: scan the QR code and submit your details. 3, Share Your Slogan: win exciting prizes with your best slogan."
          />
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
