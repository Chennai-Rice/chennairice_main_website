import React from "react";

/**
 * A punctuation mark between sections: one short, bold claim on a card that
 * breaks the grid rather than sitting inside it.
 *
 * tone   dark | gold | outline
 * align  left | right   — which side of the shell it hangs off
 * lift   pulls the card up over the boundary of the section above it
 */
export default function StatementCard({
  tone = "dark",
  align = "left",
  lift = false,
  kicker,
  children,
  footnote,
  bare = false // render just the card, for composing inside another layout
}) {
  const card = (
    <div className={`sc sc--${tone} reveal reveal--${align === "right" ? "right" : "left"}`}>
      {kicker && <span className="sc-kicker">{kicker}</span>}
      <p className="sc-text">{children}</p>
      {footnote && <span className="sc-foot">{footnote}</span>}
    </div>
  );

  if (bare) return card;

  return (
    <div className={`sc-wrap${lift ? " sc-wrap--lift" : ""} sc-wrap--${align}`}>{card}</div>
  );
}
