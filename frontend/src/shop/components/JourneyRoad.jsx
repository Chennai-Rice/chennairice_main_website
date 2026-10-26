import React from "react";
import Img from "../../components/Img.jsx";

/**
 * The grain's journey as a winding road (owner's reference, Oct 2026): a
 * maroon road with a dashed centre line runs left to right, turns, and comes
 * back; each step sits on it as a photo with a numbered badge, its name and
 * what happens there. On phones the road runs straight down.
 */
export default function JourneyRoad({ steps }) {
  const half = Math.ceil(steps.length / 2);
  const lanes = [steps.slice(0, half), steps.slice(half)];
  return (
    <div className="jr" style={{ "--per-lane": half }}>
      <span className="jr-start" aria-hidden="true">Field</span>
      {lanes.map((lane, l) => (
        <ol key={l} className={`jr-lane jr-lane-${l + 1}`} start={l * half + 1}>
          {lane.map((step) => (
            <li key={step.num} className="jr-step">
              <span className="jr-photo">
                <Img src={step.image} alt="" aria-hidden="true" />
                <span className="jr-num" aria-hidden="true">{Number(step.num)}</span>
              </span>
              <h3 className="jr-title">{step.title}</h3>
              <p className="jr-text">{step.text}</p>
            </li>
          ))}
        </ol>
      ))}
      <span className="jr-turn" aria-hidden="true" />
      <span className="jr-end" aria-hidden="true">Family</span>
    </div>
  );
}
