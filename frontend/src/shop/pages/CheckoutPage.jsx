import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteLayout from "../layouts/SiteLayout.jsx";
import { useCart } from "../hooks/useCart.jsx";
import { formatRupees } from "../utils/format.js";
import usePageMeta from "../hooks/usePageMeta.js";
import PaymentReceipt from "../components/PaymentReceipt.jsx";
import {
  initiatePayment,
  openPaymentWidget,
  confirmPayment,
  GatewayUnavailableError,
  PaymentCancelledError,
} from "../../services/payments.service.js";

/**
 * Guest checkout — delivery details, then whichever gateway's widget the server
 * chose (Razorpay by default, Zoho Payments as the fallback).
 *
 * The totals shown here are the cart's own arithmetic, for display only. What
 * the customer is actually charged is priced again on the server from the
 * catalog (api/_lib/checkout.js), so a tampered localStorage cart changes what
 * is bought, never what it costs. If the two ever disagree, the server wins and
 * the amount in the widget is the server's — which is also the amount printed
 * on the receipt afterwards.
 */

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "Tamil Nadu",
  pincode: "",
  landmark: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+()\-\s\d]{8,16}$/;
const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

/** Mirrors the server's checks so a typo is caught before an order row exists. */
function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = "Please tell us your name.";
  if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "A valid email address is required.";
  if (!PHONE_PATTERN.test(form.phone.trim())) errors.phone = "A valid phone number is required.";
  if (!form.addressLine1.trim()) errors.addressLine1 = "Please add your delivery address.";
  if (!form.city.trim()) errors.city = "Please add your city or town.";
  if (!form.state.trim()) errors.state = "Please add your state.";
  if (!PINCODE_PATTERN.test(form.pincode.trim())) errors.pincode = "A valid 6-digit PIN code is required.";
  return errors;
}

export default function CheckoutPage() {
  const { items, count, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | paying | done
  const [failure, setFailure] = useState("");
  const [confirmed, setConfirmed] = useState(null);

  usePageMeta("Checkout — Chennai Rice", "Complete your Chennai Rice order.");

  const set = (key) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [key]: value }));
    // Clear a field's error as soon as it is touched, rather than leaving a
    // stale complaint under a field the customer is actively fixing.
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const isEmpty = items.length === 0;
  const busy = status === "paying";

  const lines = useMemo(
    () => items.map((item) => ({ ...item, lineTotal: item.price * item.qty })),
    [items]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setFailure("");

    const nextErrors = validate(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setStatus("paying");

    // Browser-side failover. The server already skips a gateway whose API is
    // down; this covers what only the browser can see — a checkout script that
    // will not load, or a widget that refuses to open. Each pass asks for a
    // session on a gateway we have not already ruled out, reusing the same
    // order so a retry never leaves a second order behind.
    const excludeGateway = [];
    let session = null;
    let widgetResult = null;
    let orderId;

    // At most one retry: with two gateways, a second failure means neither is
    // usable and looping again would only repeat it.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        session = await initiatePayment({
          ...form,
          items: items.map((item) => ({ id: item.id, qty: item.qty })),
          ...(orderId ? { orderId } : {}),
          ...(excludeGateway.length ? { excludeGateway } : {}),
        });
        orderId = session.orderId;
      } catch (error) {
        setStatus("idle");
        setFailure(error.message || "We could not start your order. Please try again.");
        return;
      }

      try {
        widgetResult = await openPaymentWidget(session);
        break;
      } catch (error) {
        if (error instanceof GatewayUnavailableError) {
          // This gateway is unusable in this browser — try the other one.
          excludeGateway.push(error.gateway);
          continue;
        }
        setStatus("idle");
        setFailure(
          error instanceof PaymentCancelledError
            ? "Payment was cancelled. Your cart is still here if you want to try again."
            : "Payment was not completed: " + (error.message || "please try again.")
        );
        return;
      }
    }

    if (!widgetResult) {
      setStatus("idle");
      setFailure("We could not open a payment window. Please try again in a few minutes, or contact us to order by phone.");
      return;
    }

    try {
      const result = await confirmPayment({
        orderId: session.orderId,
        paymentId: widgetResult.paymentId,
        signature: widgetResult.signature,
      });
      // Every figure on the receipt comes from the server's verified result,
      // not from what this page sent — the amount in particular is the one the
      // gateway actually captured.
      setConfirmed({
        orderId: session.orderId,
        orderNumber: result.orderNumber,
        amount: result.amount ?? session.amount,
        paidAt: result.paidAt,
        gatewayLabel: result.gatewayLabel,
        method: result.method,
        last4: result.last4,
        customerName: form.name,
        customerEmail: form.email,
      });
      setStatus("done");
      clear();
    } catch (error) {
      // The money may well have left the customer's account here, so never
      // suggest they simply pay again — give them the reference instead.
      setStatus("idle");
      setFailure(
        (error.message || "We could not confirm your payment.") +
          " Please contact us quoting order " +
          session.orderNumber +
          " before paying again."
      );
    }
  }

  if (status === "done" && confirmed) {
    return (
      <SiteLayout skipTo="checkout-heading" skipLabel="Skip to confirmation">
        <section className="cart-page cart-page--receipt">
          <p className="eyebrow">Order confirmed</p>
          <h1 id="checkout-heading" className="receipt-page-title">
            Thank you
          </h1>

          <PaymentReceipt receipt={confirmed}>
            {/* No confirmation email is sent yet — nothing in this app sends
                mail — so this says to keep the reference rather than promising
                a message that will never arrive. */}
            <p>
              Keep your order number safe — quote it if you need to ask us anything about this
              order.
            </p>
            {/* Opens the GST invoice in a new tab, which offers its own
                "Download PDF" (the browser's Save as PDF). Needs the order id
                this browser was given at checkout plus the order number. */}
            <a
              className="checkout-btn checkout-btn--link checkout-btn--outline"
              href={`/api/orders/${confirmed.orderId}/invoice?n=${encodeURIComponent(confirmed.orderNumber)}`}
              target="_blank"
              rel="noopener"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v12m0 0l-5-5m5 5l5-5M4 17v3h16v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Download invoice
            </a>
            {/* The private order id lets the tracking page show the status
                at once, without asking for the phone number. */}
            <Link
              className="checkout-btn checkout-btn--link checkout-btn--outline"
              to={`/track-order?order=${encodeURIComponent(confirmed.orderNumber)}&id=${confirmed.orderId}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              Track order
            </Link>
            <Link className="checkout-btn checkout-btn--link" to="/products">
              Continue shopping
            </Link>
          </PaymentReceipt>
        </section>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout skipTo="checkout-heading" skipLabel="Skip to checkout">
      <section className="cart-page">
        <p className="eyebrow">Checkout</p>
        <h1 id="checkout-heading">Delivery &amp; payment</h1>

        {isEmpty ? (
          <div className="cart-empty">
            <p className="cart-empty-title">Your cart is empty</p>
            <p>Add a pack before checking out.</p>
            <Link className="checkout-btn checkout-btn--link" to="/products">
              Browse the packs
            </Link>
          </div>
        ) : (
          <div className="cart-layout">
            {/* The pay button lives in the summary aside, not inside this
                form, so it is associated by id instead of by nesting. */}
            <form id="checkout-form" className="checkout-form" onSubmit={handleSubmit} noValidate>
              <h2 className="checkout-form-title">Where should we deliver?</h2>

              <label className="field">
                <span className="field-label">Full name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={set("name")}
                  placeholder="Your full name"
                  autoComplete="name"
                  aria-invalid={!!errors.name}
                  disabled={busy}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </label>

              <div className="checkout-field-row">
                <label className="field">
                  <span className="field-label">Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    placeholder="you@example.com"
                    autoComplete="email"
                    aria-invalid={!!errors.email}
                    disabled={busy}
                  />
                  {errors.email && <span className="field-error">{errors.email}</span>}
                </label>

                <label className="field">
                  <span className="field-label">Phone</span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    placeholder="+91 12345 67890"
                    autoComplete="tel"
                    aria-invalid={!!errors.phone}
                    disabled={busy}
                  />
                  {errors.phone && <span className="field-error">{errors.phone}</span>}
                </label>
              </div>

              <label className="field">
                <span className="field-label">Address</span>
                <input
                  type="text"
                  value={form.addressLine1}
                  onChange={set("addressLine1")}
                  placeholder="Flat / house no., street"
                  autoComplete="address-line1"
                  aria-invalid={!!errors.addressLine1}
                  disabled={busy}
                />
                {errors.addressLine1 && <span className="field-error">{errors.addressLine1}</span>}
              </label>

              <label className="field">
                <span className="field-label">
                  Area, landmark <span className="field-optional">(optional)</span>
                </span>
                <input
                  type="text"
                  value={form.addressLine2}
                  onChange={set("addressLine2")}
                  placeholder="Area, nearby landmark"
                  autoComplete="address-line2"
                  disabled={busy}
                />
              </label>

              <div className="checkout-field-row">
                <label className="field">
                  <span className="field-label">City / town</span>
                  <input
                    type="text"
                    value={form.city}
                    onChange={set("city")}
                    placeholder="Chennai"
                    autoComplete="address-level2"
                    aria-invalid={!!errors.city}
                    disabled={busy}
                  />
                  {errors.city && <span className="field-error">{errors.city}</span>}
                </label>

                <label className="field">
                  <span className="field-label">State</span>
                  <input
                    type="text"
                    value={form.state}
                    onChange={set("state")}
                    placeholder="Tamil Nadu"
                    autoComplete="address-level1"
                    aria-invalid={!!errors.state}
                    disabled={busy}
                  />
                  {errors.state && <span className="field-error">{errors.state}</span>}
                </label>

                <label className="field">
                  <span className="field-label">PIN code</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.pincode}
                    onChange={set("pincode")}
                    placeholder="600001"
                    autoComplete="postal-code"
                    aria-invalid={!!errors.pincode}
                    disabled={busy}
                  />
                  {errors.pincode && <span className="field-error">{errors.pincode}</span>}
                </label>
              </div>

              {failure && (
                <p className="field-error checkout-failure" role="alert">
                  {failure}
                </p>
              )}
            </form>

            <aside className="cart-summary" aria-label="Order summary">
              <h2>Order summary</h2>

              <ul className="checkout-lines">
                {lines.map((line) => (
                  <li key={line.id} className="checkout-line">
                    <span className="checkout-line-name">
                      {line.name}
                      {line.qty > 1 && <span className="checkout-line-qty"> × {line.qty}</span>}
                    </span>
                    <span className="checkout-line-price">{formatRupees(line.lineTotal)}</span>
                  </li>
                ))}
              </ul>

              <dl className="summary-rows">
                <div className="summary-row">
                  <dt>Subtotal</dt>
                  <dd>{formatRupees(subtotal)}</dd>
                </div>
                <div className="summary-row">
                  <dt>Packs</dt>
                  <dd>{count}</dd>
                </div>
                <div className="summary-row summary-row--muted">
                  <dt>Delivery</dt>
                  <dd>Free</dd>
                </div>
                <div className="summary-row summary-row--total">
                  <dt>Total</dt>
                  <dd>{formatRupees(subtotal)}</dd>
                </div>
              </dl>

              <button className="checkout-btn" type="submit" form="checkout-form" disabled={busy}>
                <strong>{busy ? "Opening payment…" : "Pay " + formatRupees(subtotal)}</strong>
              </button>

              {/* Which gateway handles the payment is the server's call, and
                  can change mid-attempt if one is unavailable — so the copy
                  here names neither. */}
              <p className="checkout-note">
                Prices include GST. You will be asked to pay securely on the next step.
              </p>

              <button
                className="checkout-back"
                type="button"
                onClick={() => navigate("/cart")}
                disabled={busy}
              >
                Back to cart
              </button>
            </aside>
          </div>
        )}
      </section>
    </SiteLayout>
  );
}
