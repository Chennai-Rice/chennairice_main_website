import React from "react";
import { Link } from "react-router-dom";

const DEFAULT_DISHES = ["Curd Rice", "Sambar Rice", "Idly"];

// Photos we have, matched to each dish by what's on the plate.
const PHOTOS = [
  { match: /idl|dosa|uthappam/i, image: "/assets/about/idly.webp" },
  { match: /curd/i, image: "/assets/about/curd-rice.webp" },
  { match: /pongal|kitchadi|banana|festival|pooja|gathering|feast/i, image: "/assets/about/food.jpg" },
  { match: /sambar|rasam|kuzhambu|saapadu|joint family/i, image: "/assets/about/sambar.jpg" },
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
