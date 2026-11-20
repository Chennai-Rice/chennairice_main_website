import React, { useEffect, useState } from "react";
import { formatRupees } from "../utils/format.js";
import "./discountcode.css";

/**
 * Checkout → order summary: "Have a code?". The server checks the code (useCartQuote) and the page
 * shows what it takes off, or why it does not apply. Spin & Win and Refer a friend fill it in
 * (sessionStorage, CheckoutPage). One code per order.
 * The customer's own offer (Spin & Win prize, referral reward) is used by itself once their mobile number is
 * typed, without its code being shown; pendingOffer is a Spin & Win prize the cart is below the minimum for.
 */
const validTill = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "");
// The server's "Enter your mobile number above to use this code.": not an error before the number is typed.
const NEEDS_PHONE = /mobile number above/i;

export default function DiscountCode({
  applied, discount, error, checking, onApply, onRemove, disabled,
  phoneReady = true, pendingOffer = null, autoRemoved = false, onRemoveAuto, onRestoreAuto,
}) {
  const [open, setOpen] = useState(Boolean(applied));
  const [text, setText] = useState(applied || "");
  useEffect(() => {
    if (applied) { setOpen(true); setText(applied); }
  }, [applied]);

  // The customer's Spin & Win prize, used by itself (no code typed).
  if (discount?.auto && !applied && discount.source === "spin") {
    return (
      <div className="summary-row discount-row discount-auto">
        <dt>
          Spin &amp; Win prize applied <span className="discount-code-chip">{discount.gift ? discount.gift : discount.label}</span>
          {onRemoveAuto && <button type="button" className="discount-remove" onClick={onRemoveAuto} disabled={disabled}>Remove</button>}
          {discount.expiresAt && <span className="discount-auto-note">Valid till {validTill(discount.expiresAt)}</span>}
        </dt>
        <dd>{discount.gift ? "FREE" : "−" + formatRupees(discount.amount)}</dd>
        {discount.gift && <p className="discount-gift">🎁 {discount.gift}, packed with your order</p>}
      </div>
    );
  }

  // The customer's referral reward: used by itself (no code typed), nothing to remove.
  if (discount?.auto && !applied) {
    return (
      <div className="summary-row discount-row">
        <dt>Referral reward <span className="discount-code-chip">Thank you!</span></dt>
        <dd>−{formatRupees(discount.amount)}</dd>
      </div>
    );
  }

  if (applied && discount) {
    return (
      <div className="summary-row discount-row">
        <dt>
          Discount <span className="discount-code-chip">{discount.code}</span>
          <button type="button" className="discount-remove" onClick={() => { onRemove(); setText(""); }} disabled={disabled}>Remove</button>
        </dt>
        <dd>{discount.gift ? "FREE" : "−" + formatRupees(discount.amount)}</dd>
        {discount.gift && <p className="discount-gift">🎁 {discount.gift}, packed with your order</p>}
      </div>
    );
  }

  // A Spin & Win prize waiting for a bigger cart, or one the customer removed: said above the code box.
  const offerNote = !applied && pendingOffer ? (
    <p className="discount-pending" role="status">
      Add {formatRupees(pendingOffer.addMore)} more to use your Spin &amp; Win prize ({pendingOffer.label}).
    </p>
  ) : !applied && autoRemoved && onRestoreAuto ? (
    <p className="discount-pending">
      Your offer is not applied.{" "}
      <button type="button" className="discount-remove" onClick={onRestoreAuto} disabled={disabled}>Use it again</button>
    </p>
  ) : null;

  if (!open) {
    return (
      <div className="discount-open">
        {offerNote}
        <button type="button" className="discount-link" onClick={() => setOpen(true)} disabled={disabled}>Have a discount or referral code?</button>
      </div>
    );
  }

  function apply(e) {
    e.preventDefault();
    const code = text.trim().toUpperCase().replace(/\s+/g, "");
    if (code) onApply(code);
  }

  return (
    <div className="discount-box">
      {offerNote}
      <label className="discount-label" htmlFor="discount-code">Discount code, or a friend's referral code or mobile number</label>
      <div className="discount-entry">
        <input
          id="discount-code"
          className="discount-input"
          value={text}
          onChange={(e) => setText(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") apply(e); }}
          placeholder="e.g. DIWALI50 or 98765 43210"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={24}
          disabled={disabled}
          aria-invalid={Boolean(applied && error)}
          aria-describedby={applied && error ? "discount-error" : undefined}
        />
        <button type="button" className="discount-apply" onClick={apply} disabled={disabled || !text.trim()}>
          {checking ? "Checking…" : "Apply"}
        </button>
      </div>
      {applied && error && !phoneReady && NEEDS_PHONE.test(error) && (
        <p className="discount-hint" role="status">Enter your mobile number to unlock your offer.</p>
      )}
      {applied && error && !(!phoneReady && NEEDS_PHONE.test(error)) && (
        <p id="discount-error" className="discount-error" role="alert">
          {error}{" "}
          <button type="button" className="discount-remove" onClick={() => { onRemove(); setText(""); }}>Remove code</button>
        </p>
      )}
    </div>
  );
}
