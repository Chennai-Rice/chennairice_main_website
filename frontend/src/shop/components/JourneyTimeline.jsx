import React from "react";
import Img from "../../components/Img.jsx";

export default function JourneyTimeline({ steps }) {
  return (
    <div className="pdp-journey-track">
      <div className="pdp-journey-line" aria-hidden="true" />
      {steps.map((step) => (
        <div className="pdp-journey-step" key={step.num}>
          <div className="pdp-journey-figure">
            <Img src={step.image} alt="" aria-hidden="true" />
            <span className="pdp-journey-num">{step.num}</span>
          </div>
          <h4>{step.title}</h4>
          <p>{step.text}</p>
        </div>
      ))}
    </div>
  );
}
