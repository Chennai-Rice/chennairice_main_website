import React from "react";
import { FEATURES } from "../data/content.jsx";

export default function FeatureStrip() {
  return (
    <ul className="features" aria-label="What every pack carries">
      {FEATURES.map((feature) => (
        <li className="feature" key={feature.title}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            {feature.icon}
          </svg>
          <span>
            <strong>{feature.title}</strong>
            {feature.note}
          </span>
        </li>
      ))}
    </ul>
  );
}
