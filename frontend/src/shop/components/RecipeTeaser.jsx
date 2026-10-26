import React from "react";
import { Link } from "react-router-dom";

const DEFAULT_DISHES = ["Curd Rice", "Sambar Rice", "Idly"];

// One photo per dish (owner's dish photos, Oct 2026), matched by name — the
// more specific names first (Sakkarai before Pongal, Kuzhambu before Rice).
const D = "/assets/dishes/";
const PHOTOS = [
  { match: /sakkarai/i, image: D + "sakkarai-pongal.webp" },
  { match: /ven pongal|pongal/i, image: D + "ven-pongal.webp" },
  { match: /kitchadi|kichadi|khichdi/i, image: D + "nei-kitchadi.webp" },
  { match: /kuzhambu/i, image: D + "kuzhambu-rice.webp" },
  { match: /sambar/i, image: D + "sambar-rice.webp" },
  { match: /rasam/i, image: D + "rasam-rice.webp" },
  { match: /curd/i, image: D + "curd-rice.webp" },
  { match: /lemon/i, image: D + "lemon-rice.webp" },
  { match: /tamarind|puli/i, image: D + "tamarind-rice.webp" },
  { match: /uthappam/i, image: D + "uthappam.webp" },
  { match: /dosa/i, image: D + "dosa.webp" },
  { match: /idl/i, image: D + "idli.webp" },
  { match: /lunch box/i, image: D + "lunch-box.webp" },
  { match: /saapadu|banana|festival|feast|pooja|gathering|family|daily/i, image: D + "tamil-saapadu.webp" },
];
const FALLBACK_PHOTO = "/assets/shop/gallery/rice-bowl-cooked.jpg";

const photoFor = (dish) => PHOTOS.find((p) => p.match.test(dish))?.image || FALLBACK_PHOTO;

/**
 * "Best Dishes to Cook with <name> Rice": three dishes per pack, from the SEO
 * sheet. There is no per-recipe content yet, so each card goes to the same
 * honest "coming soon" /recipes page rather than inventing recipe copy.
 */
export default function RecipeTeaser({ dishes }) {
  const list = dishes?.length ? dishes : DEFAULT_DISHES;
  return (
    <div className="pdp-recipe-track">
      {list.map((dish) => (
        <Link className="pdp-recipe-card" to="/recipes" key={dish}>
          <div className="pdp-recipe-media">
            <img src={photoFor(dish)} alt={dish} loading="lazy" />
          </div>
          <h3>{dish}</h3>
          <span className="pdp-recipe-link">
            View Recipe
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 12h15m0 0l-6-6m6 6l-6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </Link>
      ))}
    </div>
  );
}
