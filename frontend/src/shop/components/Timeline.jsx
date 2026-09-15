import React, { useState } from "react";

/**
 * Zigzag timeline for the heritage band.
 *
 * Steps alternate either side of a central rail. Hovering (or focusing) a step
 * reveals a photograph on the opposite side, which is what the empty half of
 * each row is there for.
 *
 * Each step points at a real photo first and falls back to the placeholder, so
 * dropping files into /assets/about/timeline/ replaces them with no code change.
 */
const PLACEHOLDER = "/assets/about/timeline/placeholder.svg";

const STEPS = [
  {
    year: "1950s",
    title: "Heritage begins",
    note: "Three generations in the rice trade.",
    photo: "/assets/about/timeline/1950s.jpg"
  },
  {
    year: "2013",
    title: "Company incorporated",
    note: "Founded by Mr. M. S. Tamilselvan.",
    photo: "/assets/about/timeline/2013.jpg"
  },
  {
    year: "Today",
    title: "1,000+ tonnes a day",
    note: "Across three production units.",
    photo: "/assets/about/timeline/today.jpg"
  },
  {
    year: "Next",
    title: "Pan-India reach",
    note: "300+ distributors and growing.",
    photo: "/assets/about/timeline/next.jpg"
  }
];

function Step({ step, index }) {
  const [src, setSrc] = useState(step.photo);
  const side = index % 2 === 0 ? "left" : "right";

  return (
    <li className={`tl-item tl-item--${side} reveal reveal--${side} d${Math.min(index, 3)}`} tabIndex={0}>
      <span className="tl-dot" aria-hidden="true" />

      <div className="tl-body">
        <span className="tl-year">{step.year}</span>
        <span className="tl-title">{step.title}</span>
        <span className="tl-note">{step.note}</span>
      </div>

      <span className="tl-photo" aria-hidden="true">
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setSrc((c) => (c === step.photo ? PLACEHOLDER : c))}
        />
      </span>
    </li>
  );
}

export default function Timeline() {
  return (
    <ol className="tl" aria-label="Company milestones">
      {STEPS.map((step, i) => (
        <Step key={step.year + step.title} step={step} index={i} />
      ))}
    </ol>
  );
}
