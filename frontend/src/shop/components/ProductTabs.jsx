import React, { useState } from "react";
import ComingSoonNote from "./ComingSoonNote.jsx";

const TABS = [
  { id: "description", label: "Description" },
  { id: "nutrition", label: "Nutrition Facts" },
  { id: "cooking", label: "How to Cook" },
  { id: "storage", label: "Storage" },
  { id: "specifications", label: "Specifications" },
];

function DescriptionPanel({ product, details }) {
  return (
    <div className="pdp-tab-panel">
      <h3>About This Rice</h3>
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

function CookingPanel({ cooking }) {
  if (!cooking) {
    return (
      <div className="pdp-tab-panel">
        <h3>How to Cook</h3>
        <ComingSoonNote>
          Recommended water ratio and cooking time for this pack are being confirmed and will appear here shortly.
        </ComingSoonNote>
      </div>
    );
  }
  const steps = [
    { num: "01", title: "Rinse", text: cooking.rinse },
    { num: "02", title: "Measure", text: cooking.ratio },
    { num: "03", title: "Cook", text: cooking.cookTime },
    { num: "04", title: "Serve", text: cooking.serve },
  ];
  return (
    <div className="pdp-tab-panel">
      <h3>How to Cook</h3>
      <div className="pdp-cook-steps">
        {steps.map((s) => (
          <div className="pdp-cook-step" key={s.num}>
            <span className="pdp-cook-num">{s.num}</span>
            <strong>{s.title}</strong>
            <span>{s.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StoragePanel() {
  return (
    <div className="pdp-tab-panel">
      <h3>Storage</h3>
      <ComingSoonNote>
        Storage guidance for this pack is being finalised and will be published here shortly.
      </ComingSoonNote>
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

export default function ProductTabs({ product, details }) {
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  return (
    <div className="pdp-tabs-block">
      <div className="pdp-tabs-nav" role="tablist" aria-label="Product information">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`pdp-tab${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "description" && <DescriptionPanel product={product} details={details} />}
      {activeTab === "nutrition" && <NutritionPanel nutrition={details.nutrition} />}
      {activeTab === "cooking" && <CookingPanel cooking={details.cooking} />}
      {activeTab === "storage" && <StoragePanel />}
      {activeTab === "specifications" && <SpecificationsPanel product={product} />}
    </div>
  );
}
