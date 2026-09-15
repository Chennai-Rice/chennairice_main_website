import React from "react";
import { Link } from "react-router-dom";
import SiteLayout from "../layouts/SiteLayout.jsx";
import Scale from "../sections/about/Scale.jsx";
import PromiseCta from "../sections/about/PromiseCta.jsx";
import StatementCard from "../components/StatementCard.jsx";
import SectionCurve from "../components/SectionCurve.jsx";
import Timeline from "../components/Timeline.jsx";
import { useRevealGroup } from "../hooks/useScrollFx.js";
import usePageMeta from "../hooks/usePageMeta.js";
import "../styles/about.css";

/* warehouse mark that sits in the filled disc beside the "Storage" label */
const STORAGE_BADGE_ICON = (
  <>
    <path d="M4 20v-9l8-5 8 5v9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M9.2 20v-5.4a2.8 2.8 0 0 1 5.6 0V20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M3.4 20h17.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </>
);

/* Faint field-and-farm engraving that runs off the right edge of the band —
   the same trick as the reference: palm, shed, and plough furrows drawn as
   one weight of hairline so it reads as watermark, not illustration. */
const STORAGE_DECOR_PATHS = [
  // palm: trunk, then fronds fanning off its crown
  "M152 268c-6-52-2-99 9-140",
  "M161 128c-19-15-42-17-59-4",
  "M161 128c-7-21-24-36-45-40",
  "M161 128c15-17 36-23 57-17",
  "M161 128c11-19 30-30 51-30",
  "M161 128c3 21-6 40-23 53",
  // shed
  "M38 306v-58l46-31 46 31v58",
  "M70 306v-35h29v35",
  "M38 262h92",
  // furrows
  "M0 372c72-27 154-35 246-25",
  "M0 398c76-31 162-39 246-29",
  "M0 424c80-35 170-43 246-33",
  "M0 450c84-39 178-47 246-37"
];

/* A single ear of paddy, drawn at the same hairline weight as the storage
   engraving so the two decorations read as one family. Grains are one shape
   repeated down the spine rather than a dozen hand-drawn paths. */
const PADDY_STEM_PATHS = [
  "M70 292V150", // stem
  "M70 150V44", // spine of the ear
  "M70 44c-5 8-8 16-8 25", // awn, left
  "M70 44c5 8 8 16 8 25", // awn, right
  "M70 238C50 230 37 211 34 188c22 6 34 24 36 50", // blade, left
  "M70 212c20-8 33-27 36-50-22 6-34 24-36 50" // blade, right
];

const PADDY_GRAINS = [
  { x: 62, y: 142 }, { x: 78, y: 142 },
  { x: 62, y: 124 }, { x: 78, y: 124 },
  { x: 62, y: 106 }, { x: 78, y: 106 },
  { x: 63, y: 88 }, { x: 77, y: 88 },
  { x: 64, y: 70 }, { x: 76, y: 70 },
  { x: 66, y: 54 }, { x: 74, y: 54 }
];

function PaddySprig({ className }) {
  return (
    <svg className={className} viewBox="0 0 140 300" aria-hidden="true" focusable="false">
      {PADDY_STEM_PATHS.map((d) => (
        <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      ))}
      {PADDY_GRAINS.map((g) => (
        <ellipse
          key={`${g.x}-${g.y}`}
          cx="0"
          cy="0"
          rx="9"
          ry="3.4"
          /* grains on the left of the spine lean up-left, those on the
             right lean up-right, so the ear reads as symmetrical */
          transform={`translate(${g.x} ${g.y}) rotate(${g.x < 70 ? -58 : 58})`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

/**
 * Scale → heritage → statement → statement → close.
 *
 * The statement cards are the connective tissue: each one lands on the seam
 * between two sections, alternating side, so the page reads as a sequence of
 * claims rather than a stack of blocks.
 */
export default function AboutPage() {
  const pageRef = useRevealGroup();

  usePageMeta(
    "About Us — Chennai Rice Industries",
    "70+ years of rice industry heritage. Integrated paddy procurement, storage, processing and pan-India distribution, rooted in Tamil Nadu."
  );

  return (
    <SiteLayout skipTo="about-content-start" skipLabel="Skip to content">
      <div className="about-page" ref={pageRef}>
        {/* Each curve is filled with the colour of the block BELOW it, so the
            next section reads as flowing up over this one's edge. Waves
            alternate (variant 1/2) so repeated cuts don't look stamped. */}

        {/* Scale is first now, so "skip to content" lands here rather than
            on the hero heading further down the page. */}
        <div className="ab-flow-block" id="about-content-start">
          <Scale />
          <SectionCurve place="bottom" tone="rice" variant={1} />
        </div>

        <div className="ab-flow-block ab-flow-block--rice">
          {/* photo beside the heading, with the full company description
              stacked directly under it in the same column — plain
              typography, no card, so it reads as one continuous piece of
              the page rather than a pull-quote */}
          <div className="about-shell ab-heritage">
            <div className="ab-heritage-intro">
              <figure className="ab-heritage-photo reveal reveal--left">
                <img
                  src="/assets/about/heritage-generations.png"
                  alt="Three generations of the family, from grandfather to grandson, each holding rice or paddy in the fields"
                  loading="lazy"
                />
              </figure>
              <div className="ab-heritage-intro-text reveal reveal--right d1">
                <p className="eyebrow">Our Heritage</p>
                <span className="ab-heritage-rule" aria-hidden="true" />
                <h2 className="ab-heritage-kicker">Since the 1950s</h2>
                <p className="ab-heritage-tagline">
                  Seven decades of rice knowledge, running on modern infrastructure.
                </p>
                <div className="ab-heritage-intro-right">
                  <p>
                    Chennai Rice Industries India Private Limited, incorporated in 2013 under the
                    leadership of Mr.&nbsp;M.&nbsp;S.&nbsp;Tamilselvan, brings together deep
                    agricultural expertise, large-scale paddy procurement, advanced processing
                    capabilities, extensive storage infrastructure, and a growing pan-India
                    distribution network.
                  </p>
                  <p>
                    With 70+ years of industry heritage, we combine the knowledge of generations
                    with modern technology and operational capabilities to move from paddy
                    procurement to processed rice and market distribution through an integrated
                    value chain.
                  </p>
                  <p>
                    Today, Chennai Rice Industries is building a stronger, more efficient, and
                    future-ready presence in India&rsquo;s rice industry.
                  </p>
                </div>
              </div>
            </div>

            <Timeline />
          </div>
        </div>

        <div className="ab-flow-block ab-flow-block--rice">
          {/* the silo farm sits beside the claim it evidences */}
          <div className="about-shell ab-storage">
            <svg
              className="ab-storage-decor"
              viewBox="0 0 246 470"
              aria-hidden="true"
              focusable="false"
            >
              {STORAGE_DECOR_PATHS.map((d) => (
                <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              ))}
            </svg>

            <figure className="ab-storage-photo reveal reveal--left">
              <div className="ab-storage-photo-frame">
                <img
                  src="/assets/about/silos.png"
                  alt="Aerial view of the paddy storage silo farm"
                  loading="lazy"
                />
              </div>
            </figure>

            <div className="ab-storage-copy reveal reveal--right d1">
              <p className="ab-storage-eyebrow">
                <span className="ab-storage-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
                    {STORAGE_BADGE_ICON}
                  </svg>
                </span>
                Storage
              </p>

              <h2 className="ab-storage-title">South India&rsquo;s largest paddy storage facility.</h2>

              <span className="ab-storage-rule" aria-hidden="true" />

              <p className="ab-storage-lead">Six warehouses across Tamil Nadu.</p>

              <p className="ab-storage-body">
                Engineered for scale. Built for freshness. Delivering safe storage and dependable
                quality, season after season.
              </p>

              {/* No dedicated /storage page exists on this site — /infrastructure
                  already covers the storage facility (its 'storage' slide),
                  so the CTA points there rather than at a route that 404s. */}
              <Link className="ab-storage-cta" to="/infrastructure">
                Explore Our Storage
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </div>
        </div>

        {/* same ground as the bands either side of it — no cream inset, so
            no curve is needed to transition into it */}
        <div className="ab-flow-block ab-flow-block--rice">
          <div className="ab-founder-card">
            <PaddySprig className="ab-founder-sprig ab-founder-sprig--left" />
            <PaddySprig className="ab-founder-sprig ab-founder-sprig--right" />
            <StatementCard tone="outline" align="left" kicker="Our founder" footnote="M. S. Tamilselvan · Founder &amp; Chairman" bare>
              “Build capabilities today that create scale for tomorrow.”
            </StatementCard>
            <Link className="ab-founder-link" to="/founder">
              Meet the founder
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>

        <div className="ab-flow-block">
          <PromiseCta />
        </div>
      </div>
    </SiteLayout>
  );
}
