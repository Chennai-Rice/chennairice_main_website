import React, { useEffect, useRef, useState } from "react";
import { Wheel, startSpin, pictureSlice, deviceId } from "../../components/SpinWheel.jsx";
import { landingAngle } from "../../components/wheelSlices.js";
import { currentAttribution } from "../../services/attribution.js";
import { trackGoogleEcommerce } from "../../services/googleAnalytics.js";
import "../../components/spinwheel.css";
import "./checkoutspin.css";

/**
 * Checkout → order summary (Nov 2026): a mobile number that has never spun and has no paid order is offered
 * one spin here (the quote's checkoutSpin, backend spin.js checkoutSpinOpen). The wheel opens over the page;
 * the prize code is locked to the number, so the next quote applies it by itself (discounts.js autoOffer) and
 * the order summary shows it. Never in the way of paying: the card is small, "No thanks" hides it, closing the
 * wheel leaves the form as it was, and a spin that fails just closes with a short note.
 * GA4: checkout_spin_shown, checkout_spin_won, checkout_spin_skipped.
 */
export default function CheckoutSpin({ available, phone, name, subtotal = 0, onWon, disabled }) {
  const mobile = String(phone || "").replace(/\D/g, "").slice(-10);
  const [hiddenFor, setHiddenFor] = useState("");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState("ready"); // ready | spinning | won
  const [who, setWho] = useState(name || "");
  const [prize, setPrize] = useState(null);
  const [error, setError] = useState("");
  const [slices, setSlices] = useState([]);
  const rotorRef = useRef(null);
  const angleRef = useRef(0);
  const spinRef = useRef(null);
  const shown = useRef(new Set());
  useEffect(() => () => spinRef.current?.cancel(), []);
  useEffect(() => { if (!open) setWho(name || ""); }, [name, open]);

  // Kept on the page while the wheel is open: after a win the quote no longer offers a spin.
  const visible = Boolean(available) && mobile.length === 10 && hiddenFor !== mobile;
  useEffect(() => {
    if (!visible || shown.current.has(mobile)) return;
    shown.current.add(mobile);
    trackGoogleEcommerce("checkout_spin_shown", { value: 0 });
  }, [visible, mobile]);

  useEffect(() => {
    if (!open || slices.length) return undefined;
    let live = true;
    fetch("/api/spin").then((r) => (r.ok ? r.json() : null)).then((c) => { if (live && c?.prizes) setSlices(c.prizes); }).catch(() => {});
    return () => { live = false; };
  }, [open, slices.length]);

  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === "Escape" && state !== "spinning") close(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });

  if (!visible && !open) return null;

  function skip() {
    setHiddenFor(mobile);
    trackGoogleEcommerce("checkout_spin_skipped", { value: 0 });
  }

  function close() {
    if (state === "spinning") return;
    setOpen(false);
    if (state === "won") { setHiddenFor(mobile); return; }
    setError("");
    trackGoogleEcommerce("checkout_spin_skipped", { value: 0 });
  }

  async function go(e) {
    e.preventDefault();
    setError("");
    const cleanName = who.trim().replace(/\s+/g, " ");
    if (cleanName.length < 2) return setError("Please enter your name.");
    setState("spinning");
    spinRef.current?.cancel();
    const spin = startSpin(rotorRef, angleRef);
    spinRef.current = spin;
    try {
      const res = await fetch("/api/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, phone: mobile, deviceId: deviceId(), attribution: currentAttribution(), from: "checkout" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.prize) throw new Error(data?.error || "The spin is not available right now. You can pay as usual.");
      spin.land(landingAngle(pictureSlice(data.prize)), () => {
        setPrize(data);
        setState("won");
        trackGoogleEcommerce("checkout_spin_won", { value: 0, prize: data.prize.label });
        onWon?.();
      });
    } catch (err) {
      spin.land(null);
      setState("ready");
      setError(err.message);
      // Nothing more to try here (already spun on this phone, closed for the month…): the card goes.
      setHiddenFor(mobile);
    }
  }

  return (
    <>
      {visible && !open && (
        <div className="cospin-card" role="note">
          <span className="cospin-card-icon" aria-hidden="true">🎁</span>
          <span className="cospin-card-text">
            <strong>First order?</strong> Spin once and win an offer for this order.
          </span>
          <span className="cospin-card-actions">
            <button type="button" className="cospin-card-go" onClick={() => { setOpen(true); setState("ready"); }} disabled={disabled}>Spin now</button>
            <button type="button" className="cospin-card-skip" onClick={skip} disabled={disabled}>No thanks</button>
          </span>
        </div>
      )}
      {open && (
        <div className="spin-backdrop cospin-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="cospin-dialog" role="dialog" aria-modal="true" aria-labelledby="cospin-title">
            <button type="button" className="spin-close cospin-close" onClick={close} disabled={state === "spinning"} aria-label="Close">×</button>
            <h2 id="cospin-title" className="cospin-title">{state === "won" ? "You won!" : "Spin once for this order"}</h2>
            <div className="cospin-wheel">
              <Wheel slices={slices} rotorRef={rotorRef} angleRef={angleRef} />
            </div>
            {state !== "won" && (
              <form className="cospin-form" onSubmit={go} noValidate>
                {!String(name || "").trim() && (
                  <input className="cospin-input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Your name"
                    autoComplete="name" maxLength={80} disabled={state === "spinning"} aria-label="Your name" />
                )}
                {error && <p className="cospin-error" role="alert">{error}</p>}
                <button type="submit" className="cospin-go" disabled={state === "spinning"}>{state === "spinning" ? "Spinning…" : "Spin"}</button>
                <p className="cospin-fine">One spin per mobile number. The prize is for {mobile.replace(/^(\d{5})/, "$1 ")}.</p>
              </form>
            )}
            {state === "won" && prize && (
              <div className="cospin-won">
                <p className="cospin-prize">{prize.gives || prize.prize.label}</p>
                <p className="cospin-fine">
                  {Number(prize.minOrder) > Number(subtotal)
                    ? `Applied to this order once it is above ₹${Number(prize.minOrder).toLocaleString("en-IN")}.`
                    : "Applied to this order."}
                </p>
                <button type="button" className="cospin-go" onClick={close}>Continue to pay</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
