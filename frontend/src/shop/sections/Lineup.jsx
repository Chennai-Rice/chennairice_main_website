import React from "react";
import { useProducts } from "../data/products.js";
import { useRevealOnScroll } from "../hooks/useRevealOnScroll.js";

/**
 * The closing CSS-3D stage: the full range standing in gathered arcs on a
 * reflective floor.
 *
 * All of the depth is CSS (`perspective` on .stage, `preserve-3d` on the row,
 * per-item rotateY/translateZ driven by the --i custom property). React only
 * supplies the two classes the keyframes are gated on — `will-animate` arms the
 * hidden state and `is-visible` releases the staggered entrance — so the
 * animation itself is untouched by the migration.
 */
// Thirteen packs shoulder to shoulder read as a strip of wallpaper, so the
// stage is split across two rows. The smaller row goes on top, which keeps the
// arrangement bottom-heavy and stops the upper row's reflections crowding the
// packs beneath them.
const TOP_ROW = 6;

function toRows(lineup) {
  // `stagger` rides along so the entrance animation can keep one continuous
  // index across both rows.
  const withStagger = lineup.map((pack, stagger) => ({ ...pack, stagger }));
  if (withStagger.length <= TOP_ROW) return [withStagger];
  return [withStagger.slice(0, TOP_ROW), withStagger.slice(TOP_ROW)];
}

/**
 * The gathered arc, computed per row rather than hard-coded per child.
 *
 * It used to be four nth-child rules, which silently stopped applying the
 * moment the catalogue grew past four packs — every extra one stood flat. This
 * derives the same shape from an item's position in its own row, so a row of
 * six and a row of seven both curve correctly, and so will any other count.
 *
 * Outer packs turn inward and sit further back; the falloff is squared so the
 * depth builds toward the ends instead of ramping evenly.
 */
function arcFor(index, count) {
  const centre = (count - 1) / 2;
  const t = centre === 0 ? 0 : (index - centre) / centre;
  return {
    "--ry": (-t * 15).toFixed(2) + "deg",
    "--tz": (-(t * t) * 55).toFixed(1) + "px",
  };
}

export default function Lineup() {
  const { ref, armed, revealed } = useRevealOnScroll({ threshold: 0.2 });
  const { lineup } = useProducts();

  const stageClass = ["stage", armed && "will-animate", revealed && "is-visible"]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="lineup" aria-labelledby="lineup-heading">
      <p className="lineup-eyebrow">The complete range</p>
      {/* Counted from the catalogue rather than written in. The previous copy
          said "Four packs" long after the range had grown to thirteen, because
          the number lived in the markup and nothing tied it to the data. */}
      <h2 id="lineup-heading" className="lineup-title">
        {lineup.length} packs.
        <br />
        One standard.
      </h2>
      <p className="lineup-sub">
        From the 5&nbsp;kg Kitchidi Ponni to the 26&nbsp;kg Chennai Bullets &mdash; every pack milled, graded and
        sealed at our own Erode facility.
      </p>

      <div className={stageClass} ref={ref}>
        {toRows(lineup).map((row, rowIndex) => (
          <ul className="lineup-row" key={rowIndex}>
            {row.map((pack, i) => (
              <li
                className="lineup-item"
                key={pack.id}
                // --i keeps counting across both rows so the entrance still
                // cascades left-to-right, top row then bottom, rather than two
                // rows starting at once.
                style={{ "--i": pack.stagger, ...arcFor(i, row.length) }}
              >
                <img src={pack.image} alt={pack.alt} width={pack.width} height={pack.height} loading="lazy" />
                {/* mirrored copy beneath each pack */}
                <img className="reflect" src={pack.image} alt="" aria-hidden="true" loading="lazy" />
              </li>
            ))}
          </ul>
        ))}
      </div>

      {/* "Sealed at 10 kg" was true of the old four-pack range; the current one
          runs from 5 kg family packs to 26 kg trade packs. */}
      <p className="lineup-note">Milled in Erode &middot; 5&nbsp;kg to 26&nbsp;kg &middot; 100% vegetarian</p>
    </section>
  );
}
