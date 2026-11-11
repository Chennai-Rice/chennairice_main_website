import React from "react";
import { formatRupees } from "../utils/format.js";
import "./deliverychoice.css";

/**
 * Checkout: how the order should reach the customer, once the PIN code is known. Shown only where
 * Chennai Rice's own team delivers (the server lists the options); elsewhere the courier is the only
 * way, so nothing is shown. The team's option stands out, with what it
 * saves worked out from the two real charges. Our team is the default choice (CheckoutPage).
 */
const LABEL = { courier: "Courier", in_house: "Chennai Rice delivery" };

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6.5h10.5v9H3z" /><path d="M13.5 10h3.8l2.7 3v2.5h-6.5" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4" /><path d="M12 11v10" />
    </svg>
  );
}

export default function DeliveryChoice({ options, value, onChange, disabled }) {
  const courier = options.find((o) => o.method === "courier");
  const own = options.find((o) => o.method === "in_house");
  if (!courier || !own) return null;
  const saves = Math.round((courier.charge - own.charge) * 100) / 100;

  return (
    <fieldset className="delivery-choice" disabled={disabled}>
      <legend className="delivery-choice-title">How should we deliver?</legend>
      {[courier, own].map((o) => {
        const isOwn = o.method === "in_house";
        return (
          <label key={o.method} className={"delivery-option" + (isOwn ? " delivery-option--own" : "") + (value === o.method ? " is-selected" : "")}>
            <input type="radio" name="deliveryMethod" value={o.method} checked={value === o.method} onChange={() => onChange(o.method)} />
            <span className="delivery-option-icon">{isOwn ? <TruckIcon /> : <BoxIcon />}</span>
            <span className="delivery-option-text">
              <span className="delivery-option-name">
                {LABEL[o.method]}
                {isOwn && <span className="delivery-option-tag">Our own team</span>}
              </span>
              <span className="delivery-option-when">{o.promise}</span>
              {isOwn && saves > 0 && <span className="delivery-option-gain">{formatRupees(saves)} less than courier</span>}
            </span>
            <span className="delivery-option-price">{formatRupees(o.charge)}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
