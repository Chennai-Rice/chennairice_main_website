import React from "react";
import { Link } from "react-router-dom";

const RECIPES = [
  { name: "Curd Rice", image: "/assets/about/curd-rice.webp" },
  { name: "Sambar Rice", image: "/assets/about/sambar.jpg" },
  { name: "Idly", image: "/assets/about/idly.png" },
];

/**
 * The recipes section isn't backed by real per-recipe content yet, so this
 * teases the idea with existing food photography and sends everyone to the
 * same honest "coming soon" /recipes page rather than inventing recipe copy.
 */
export default function RecipeTeaser() {
  return (
    <div className="pdp-recipe-track">
      {RECIPES.map((recipe) => (
        <Link className="pdp-recipe-card" to="/recipes" key={recipe.name}>
          <div className="pdp-recipe-media">
            <img src={recipe.image} alt={recipe.name} loading="lazy" />
          </div>
          <h4>{recipe.name}</h4>
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
