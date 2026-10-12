import React, { useEffect, useRef, useState } from "react";
import Img from "../../components/Img.jsx";

/**
 * The grain's journey: a row of circles with titles. Each step's details show
 * in a bubble above its circle on hover or keyboard focus; on touch screens a
 * tap opens it and a tap elsewhere closes it.
 */
export default function JourneyTimeline({ steps }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);

  // A tap outside the timeline closes an open bubble (touch screens).
  useEffect(() => {
    if (open === null) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="pdp-journey-wrap" ref={ref}>
      <div className="pdp-journey-line" aria-hidden="true" />
      <ol className="pdp-journey-track">
      {steps.map((step, i) => (
        <li className={`pdp-journey-step${open === i ? " is-open" : ""}`} key={step.num}>
          <button
            type="button"
            className="pdp-journey-trigger"
            aria-describedby={`journey-tip-${i}`}
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseLeave={() => setOpen((cur) => (cur === i ? null : cur))}
          >
            <span className="pdp-journey-figure">
              <Img src={step.image} alt="" aria-hidden="true" />
              <span className="pdp-journey-num">{step.num}</span>
            </span>
            <span className="pdp-journey-title">{step.title}</span>
          </button>
          <span className="pdp-journey-tip" role="tooltip" id={`journey-tip-${i}`}>
            {step.text}
          </span>
        </li>
      ))}
      </ol>
    </div>
  );
}
