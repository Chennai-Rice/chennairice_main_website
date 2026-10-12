import React, { useState } from "react";
import ComingSoonNote from "./ComingSoonNote.jsx";

const TABS = [
  { id: "nutrition", label: "Nutrition Facts" },
  { id: "cooking", label: "How to Cook" },
  { id: "storage", label: "How to Store" },
  { id: "specifications", label: "Specifications" },
];

/** "About <name> Rice": its own H2 section above the tabs. */
export function ProductAbout({ product, details, riceName }) {
  return (
    <div className="pdp-about">
      <h2>About {riceName}</h2>
      <p>{product.description}</p>
      {details.aboutBullets.length > 0 ? (
        <ul className="pdp-bullets">
          {details.aboutBullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <ComingSoonNote>
          Detailed product notes for this pack are being finalised and will appear here shortly.
        </ComingSoonNote>
      )}
    </div>
  );
}

function NutritionPanel({ nutrition }) {
  if (!nutrition) {
    return (
      <div className="pdp-tab-panel">
        <h3>Nutrition Facts</h3>
        <ComingSoonNote>
          Nutrition values for this pack are being confirmed against pack labelling and will be published here shortly.
        </ComingSoonNote>
      </div>
    );
  }
  const half = Math.ceil(nutrition.rows.length / 2);
  const left = nutrition.rows.slice(0, half);
  const right = nutrition.rows.slice(half);
  return (
    <div className="pdp-tab-panel">
      <h3>Nutrition Facts</h3>
      <p className="pdp-panel-subtitle">Per {nutrition.per} — Raw Rice</p>
      <div className="pdp-nutrition-grid">
        <ul className="pdp-nutrition-col">
          {left.map((row) => (
            <li key={row.label}>
              <span>{row.label}</span>
              <span>{row.value}</span>
            </li>
          ))}
        </ul>
        <ul className="pdp-nutrition-col">
          {right.map((row) => (
            <li key={row.label}>
              <span>{row.label}</span>
              <span>{row.value}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="pdp-disclaimer">Nutrition values are based on available product/labelling data.</p>
    </div>
  );
}

function CookingPanel({ cooking, riceName }) {
  if (!cooking) {
    return (
      <div className="pdp-tab-panel">
        <h3>How to Cook {riceName}</h3>
        <ComingSoonNote>
          Recommended water ratio and cooking time for this pack are being confirmed and will appear here shortly.
        </ComingSoonNote>
      </div>
    );
  }
  return (
    <div className="pdp-tab-panel">
      <h3>How to Cook {riceName}</h3>
      <div className="pdp-cook-prep">
        <span className="pdp-cook-num">01</span>
        <div>
          <strong>Before cooking</strong>
          <p>{cooking.prep}</p>
        </div>
      </div>

      <p className="pdp-cook-label">Cooking measures</p>
      <div className="pdp-cook-methods">
        <div className="pdp-cook-method">
          <strong>Open pan</strong>
          <ul>{cooking.openPan.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
        <div className="pdp-cook-method">
          <strong>Closed pan</strong>
          <ul>{cooking.closedPan.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      </div>

      <p className="pdp-cook-note">{cooking.note}</p>
    </div>
  );
}

const STORAGE_TIPS = [
  "Keep the rice in a cool, dry place, away from direct sunlight and moisture.",
  "Once the pack is open, move the rice to a clean, airtight container, or close the pack tightly after each use.",
  "Always scoop with a dry measure or cup, so no water gets into the rice.",
  "Store it off the floor and away from strong-smelling foods, soaps and spices, so it keeps its natural aroma.",
];

function StoragePanel({ riceName }) {
  return (
    <div className="pdp-tab-panel">
      <h3>How to Store {riceName}</h3>
      <ul className="pdp-bullets">
        {STORAGE_TIPS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function SpecificationsPanel({ product }) {
  const rows = [
    { label: "Rice Type", value: product.tag },
    { label: "Pack Sizes", value: product.packSizes.map((s) => `${s.kg} kg`).join(", ") },
  ];
  return (
    <div className="pdp-tab-panel">
      <h3>Specifications</h3>
      <ul className="pdp-spec-list">
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <span>{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "<name> Rice Product Description": four tabs. Every panel stays in the page
 * (the inactive ones hidden) so each H3 is part of the document, not only the
 * tab that happens to be open.
 */
export default function ProductTabs({ product, details, riceName }) {
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  return (
    <div className="pdp-tabs-block">
      <div className="pdp-tabs-nav" role="tablist" aria-label="Product information">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`pdp-tab-${tab.id}`}
            aria-controls={`pdp-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={`pdp-tab${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`pdp-panel-${tab.id}`}
          aria-labelledby={`pdp-tab-${tab.id}`}
          hidden={activeTab !== tab.id}
        >
          {tab.id === "nutrition" && <NutritionPanel nutrition={details.nutrition} />}
          {tab.id === "cooking" && <CookingPanel cooking={details.cooking} riceName={riceName} />}
          {tab.id === "storage" && <StoragePanel riceName={riceName} />}
          {tab.id === "specifications" && <SpecificationsPanel product={product} />}
        </div>
      ))}
    </div>
  );
}
