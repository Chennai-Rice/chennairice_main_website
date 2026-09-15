import React from "react";
import { useProducts } from "../data/products.js";
import { useRevealOnScroll } from "../hooks/useRevealOnScroll.js";

/**
 * The closing CSS-3D stage: four packs standing in a gathered arc on a
 * reflective floor.
 *
 * All of the depth is CSS (`perspective` on .stage, `preserve-3d` on the row,
 * per-item rotateY/translateZ driven by the --i custom property). React only
 * supplies the two classes the keyframes are gated on — `will-animate` arms the
 * hidden state and `is-visible` releases the staggered entrance — so the
 * animation itself is untouched by the migration.
 */
export default function Lineup() {
  const { ref, armed, revealed } = useRevealOnScroll({ threshold: 0.2 });
  const { lineup } = useProducts();

  const stageClass = ["stage", armed && "will-animate", revealed && "is-visible"]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="lineup" aria-labelledby="lineup-heading">
      <p className="lineup-eyebrow">The complete range</p>
      <h2 id="lineup-heading" className="lineup-title">
        Four packs.
        <br />
        One standard.
      </h2>
      <p className="lineup-sub">
        From the everyday Akshaya to the Rajabhogam Premium &mdash; the same Ponni and Kolam grain, milled and
        sealed at our Erode facility.
      </p>

      <div className={stageClass} ref={ref}>
        <ul className="lineup-row">
          {lineup.map((pack, index) => (
            <li className="lineup-item" key={pack.id} style={{ "--i": index }}>
              <img src={pack.image} alt={pack.alt} width={pack.width} height={pack.height} loading="lazy" />
              {/* mirrored copy beneath each pack */}
              <img className="reflect" src={pack.image} alt="" aria-hidden="true" loading="lazy" />
            </li>
          ))}
        </ul>
      </div>

      <p className="lineup-note">Milled in Erode &middot; Sealed at 10&nbsp;kg &middot; 100% vegetarian</p>
    </section>
  );
}
