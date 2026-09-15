import React from "react";

/** Honest placeholder for facts we haven't confirmed yet (nutrition, cooking ratios), rather than a guessed figure. */
export default function ComingSoonNote({ children }) {
  return <p className="pdp-coming-soon">{children}</p>;
}
