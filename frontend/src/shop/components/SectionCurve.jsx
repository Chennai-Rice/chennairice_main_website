import React from "react";

/**
 * A curved cut between two layouts.
 *
 * The SVG is filled with the colour of the *neighbouring* section, so it reads
 * as that section flowing over this one's edge rather than as a shape sitting
 * on top. `preserveAspectRatio="none"` lets it stretch to any width without
 * changing the curve's height.
 *
 * place    top | bottom   which edge of the parent it hangs on
 * variant  1 | 2          two different waves so repeats don't look stamped
 */
const WAVES = {
  // gentle S — dips left of centre, lifts to the right
  1: "M0,0 H1440 V44 C1190,104 1010,14 726,52 C452,88 236,26 0,72 Z",
  // mirrored counterpart
  2: "M0,0 H1440 V72 C1204,26 988,88 714,52 C430,14 250,104 0,44 Z"
};

export default function SectionCurve({ place = "top", tone = "rice", variant = 1 }) {
  return (
    <div className={`curve curve--${place}`} aria-hidden="true">
      <svg viewBox="0 0 1440 104" preserveAspectRatio="none" focusable="false">
        <path className={`curve-fill curve-fill--${tone}`} d={WAVES[variant] || WAVES[1]} />
      </svg>
    </div>
  );
}
