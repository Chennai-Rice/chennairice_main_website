import React, { useEffect, useMemo, useState } from "react";
import { formatRupees } from "../utils/format.js";
import useDeliveryPin, { PIN_PATTERN } from "../hooks/useDeliveryPin.js";

/**
 * "Delivery to your PIN code" before checkout (audit UX-01). The customer types a PIN once (remembered on
 * this device, and checkout starts with it); the charge comes from the same quote checkout charges from, so
 * it is the delivery and total they will pay, never an estimate.
 *
 *   items       [{ id: "slug-10kg", qty }] — the pack on a product page
 *   fromCharge  the lowest delivery for this pack anywhere (rupees), shown before a PIN is given
 *   compact     only the PIN code (the cart prices it in its own summary)
 */
export default function DeliveryCheck({ items, fromCharge = null, compact = false }) {
  const [pin, savePin] = useDeliveryPin();
  const [editing, setEditing] = useState(!pin);
  const [typed, setTyped] = useState(pin);
  const [state, setState] = useState({ loading: false, quote: null, error: "" });

  const key = useMemo(() => (items || []).map((i) => `${i.id}:${i.qty}`).join(","), [items]);

  useEffect(() => {
    if (compact || !pin || !key) { setState({ loading: false, quote: null, error: "" }); return undefined; }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: "" }));
    fetch("/api/checkout/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items.map((i) => ({ id: i.id, qty: i.qty })), pincode: pin }),
      signal: ctrl.signal,
    })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) setState({ loading: false, quote: null, error: body.error || "We could not check this PIN code. Please try again." });
        else setState({ loading: false, quote: body, error: "" });
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setState({ loading: false, quote: null, error: "We could not check this PIN code. Please try again." });
      });
    return () => ctrl.abort();
    // items is read through key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, key, compact]);

  // Another page (or the cart) changed the PIN: show it.
  useEffect(() => { setTyped(pin); if (pin) setEditing(false); }, [pin]);

  const submit = (e) => {
    e.preventDefault();
    const v = typed.trim();
    if (!PIN_PATTERN.test(v)) {
      setState({ loading: false, quote: null, error: "Please enter a 6-digit PIN code." });
      return;
    }
    savePin(v);
    setEditing(false);
  };

  const q = state.quote;
  const options = q?.deliveryOptions || [];
  const cheapest = options.length ? options.reduce((a, b) => (b.charge < a.charge ? b : a)) : null;

  return (
    <div className="dlv-check">
      {editing || !pin ? (
        <form className="dlv-form" onSubmit={submit}>
          <label className="dlv-label" htmlFor="dlv-pin">
            Delivery charge to your PIN code
            {fromCharge != null && <span className="dlv-from"> · from {formatRupees(fromCharge)}</span>}
          </label>
          <div className="dlv-row">
            <input
              id="dlv-pin"
              className="dlv-input"
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="e.g. 600001"
              value={typed}
              onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))}
              aria-describedby={state.error ? "dlv-error" : undefined}
            />
            <button type="submit" className="dlv-btn">Check</button>
          </div>
        </form>
      ) : (
        <div className="dlv-head">
          <span>
            Delivery to <strong>{pin}</strong>
            {q?.region?.name && <span className="dlv-region"> · {q.region.name}</span>}
          </span>
          <button type="button" className="dlv-change" onClick={() => setEditing(true)}>Change</button>
        </div>
      )}

      {!compact && <div className="dlv-result" aria-live="polite">
        {state.error && <p className="dlv-error" id="dlv-error">{state.error}</p>}
        {!state.error && pin && !editing && state.loading && !q && <p className="dlv-muted">Checking…</p>}
        {!state.error && pin && !editing && q && (
          <>
            {options.length > 1 ? (
              <ul className="dlv-options">
                {options.map((o) => (
                  <li key={o.method} className={o === cheapest ? "is-best" : ""}>
                    <span>{o.method === "in_house" ? "Our own delivery team" : "Courier"} <small>({o.promise})</small></span>
                    <strong>{o.charge === 0 ? "Free" : formatRupees(o.charge)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dlv-line">
                <span>Delivery{cheapest?.promise ? <small> ({cheapest.promise})</small> : null}</span>
                <strong>{q.shipping == null ? "—" : q.shipping === 0 ? "Free" : formatRupees(q.shipping)}</strong>
              </p>
            )}
            {q.shipping != null && (
              <p className="dlv-total">
                {formatRupees(q.subtotal)} + {q.shipping === 0 ? "free delivery" : `${formatRupees(q.shipping)} delivery`} ={" "}
                <strong>{formatRupees(q.subtotal + q.shipping)}</strong>
              </p>
            )}
          </>
        )}
      </div>}
      {compact && state.error && <p className="dlv-error" id="dlv-error">{state.error}</p>}
    </div>
  );
}
