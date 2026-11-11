import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import SiteLayout from "../layouts/SiteLayout.jsx";
import { useCart } from "../hooks/useCart.jsx";
import useCartQuote from "../hooks/useCartQuote.js";
import { currentAttribution } from "../../services/attribution.js";
import { trackEvent } from "../../services/events.js";
import { recordJourney, endJourney, journeyItems, journeyValue } from "../../services/journey.js";
import { formatRupees } from "../utils/format.js";
import usePageMeta from "../hooks/usePageMeta.js";
import PaymentReceipt from "../components/PaymentReceipt.jsx";
import DeliveryChoice from "../components/DeliveryChoice.jsx";
import DiscountCode from "../components/DiscountCode.jsx";
import SuggestInput from "../components/SuggestInput.jsx";
import { matchTowns } from "../data/indianTowns.js";
import ReferralShare from "../components/ReferralShare.jsx";

// The discount code for this visit (sessionStorage): typed here, or filled in by Spin & Win or a referral.
export const DISCOUNT_CODE_KEY = "cr.checkout.code";
function readDiscountCode() {
  try { return window.sessionStorage.getItem(DISCOUNT_CODE_KEY) || ""; } catch { return ""; }
}
function saveDiscountCode(code) {
  try {
    if (code) window.sessionStorage.setItem(DISCOUNT_CODE_KEY, code);
    else window.sessionStorage.removeItem(DISCOUNT_CODE_KEY);
  } catch { /* private mode: kept for this page only */ }
}

// The delivery method the customer picked on this visit (sessionStorage); until they choose, 'auto':
// the server preselects the cheaper of courier and our own team.
const DELIVERY_CHOICE_KEY = "cr.checkout.delivery";
function readDeliveryChoice() {
  try {
    const v = window.sessionStorage.getItem(DELIVERY_CHOICE_KEY);
    return v === "courier" || v === "in_house" ? v : "auto";
  } catch {
    return "auto";
  }
}
import { metaCheckoutSignal, trackMetaEvent, trackMetaPurchase } from "../../services/metaPixel.js";
import { trackGooglePurchase } from "../../services/googleAnalytics.js";
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
  const { items, count, clear, replace: replaceCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(EMPTY_FORM);
  // Courier, or Chennai Rice's own team where it delivers (offered once the PIN code is known, and only
  // when it costs less than the courier). Our team is the default: where it is not offered, the server's
  // quote answers with the courier, and that answer (deliveryMethod) is what is shown and paid. The
  // choice is kept for the visit, so it is still there if the customer goes back to the cart and returns.
  const [deliveryChoice, setDeliveryChoiceState] = useState(readDeliveryChoice);
  const setDeliveryChoice = useCallback((method) => {
    setDeliveryChoiceState(method);
    try { window.sessionStorage.setItem(DELIVERY_CHOICE_KEY, method); } catch { /* private mode: kept for this page only */ }
  }, []);
  const [discountCode, setDiscountCodeState] = useState(readDiscountCode);
  const setDiscountCode = useCallback((code) => { setDiscountCodeState(code); saveDiscountCode(code); }, []);
  const {
    subtotal, shipping, region, total, hasPin, deliveryOptions, deliveryMethod, discount, discountError, error: quoteError,
  } = useCartQuote(form.pincode, deliveryChoice, { discountCode, phone: form.phone, email: form.email });
  const ownDelivery = deliveryMethod === "in_house";
  const [errors, setErrors] = useState({});
  // After payment the receipt moves to /order-confirmed (a page of its own
  // for ad and Tag Manager conversion tracking). The receipt rides in the
  // browser history, so a refresh there still shows it.
  const onConfirmedPage = location.pathname === "/order-confirmed";
  const fromHistory = onConfirmedPage ? location.state?.confirmed ?? null : null;
  const [status, setStatus] = useState(fromHistory ? "done" : "idle"); // idle | paying | done
  const [failure, setFailure] = useState("");
  const [confirmed, setConfirmed] = useState(fromHistory);

  // Google Analytics / Google Ads and Meta: the sale, once, when the order-confirmed page opens (it only
  // shows for a payment the server has confirmed), with the amount the gateway captured. A refresh of the
  // page is de-duplicated by the order number.
  useEffect(() => {
    if (!onConfirmedPage || status !== "done" || !confirmed) return;
    trackMetaPurchase({ orderNumber: confirmed.orderNumber, value: confirmed.amount, items: confirmed.items || [] });
    trackGooglePurchase({
      transactionId: confirmed.orderNumber,
      value: Number(confirmed.amount),
      shipping: confirmed.shipping,
      coupon: confirmed.coupon,
      items: confirmed.items || [],
    });
  }, [onConfirmedPage, status, confirmed]);

  usePageMeta(
    onConfirmedPage ? "Order confirmed — Chennai Rice" : "Checkout — Chennai Rice",
    onConfirmedPage ? "Your Chennai Rice order is confirmed." : "Complete your Chennai Rice order.",
    { noindex: true }
  );

  const set = (key) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [key]: value }));
    // Clear a field's error as soon as it is touched, rather than leaving a
    // stale complaint under a field the customer is actively fixing.
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  // A cart reminder email's "Complete my order" link (/checkout?resume=…): the cart, the details and email 2's
  // code come back, so the customer only presses Pay. The link is then dropped from the address bar.
  const [resumeNote, setResumeNote] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("resume");
    if (!token) return undefined;
    let gone = false;
    fetch(`/api/cart/resume/${encodeURIComponent(token)}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (gone) return;
        if (!ok) { setResumeNote(body.error || "This link has expired."); return; }
        if (body.items?.length) replaceCart(body.items);
        const c = body.contact || {};
        setForm((current) => {
          const next = { ...current };
          for (const k of ["name", "email", "phone", "addressLine1", "addressLine2", "city", "state", "pincode"]) if (c[k]) next[k] = c[k];
          return next;
        });
        if (body.code) setDiscountCode(body.code);
        setResumeNote(body.code ? `Welcome back! Your cart is ready, and code ${body.code} is applied.` : "Welcome back! Your cart and details are ready. Just check and press Pay.");
      })
      .catch(() => {})
      .finally(() => { if (!gone) navigate(location.pathname, { replace: true }); });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fill several address fields at once (a picked suggestion), clearing their errors.
  const fill = (values) => {
    setForm((current) => ({ ...current, ...values }));
    setErrors((current) => {
      const next = { ...current };
      Object.keys(values).forEach((k) => { next[k] = undefined; });
      return next;
    });
  };

  // Address suggestions (India Post directory through our server): a full PIN gives its city, state and areas;
  // three letters of an area give matching areas with their PIN.
  const [pinInfo, setPinInfo] = useState(null);
  const [areaHits, setAreaHits] = useState([]);
  useEffect(() => {
    const pin = String(form.pincode || "").replace(/\D/g, "");
    if (!PINCODE_PATTERN.test(pin)) { setPinInfo(null); return undefined; }
    let gone = false;
    fetch(`/api/places/pin/${pin}`).then((r) => (r.ok ? r.json() : null)).then((info) => {
      if (gone || !info?.pin) return;
      setPinInfo(info);
      setForm((current) => ({ ...current, city: current.city || info.city, state: current.state || info.state }));
    }).catch(() => {});
    return () => { gone = true; };
  }, [form.pincode]);
  useEffect(() => {
    const q = String(form.addressLine2 || "").trim();
    if (q.length < 3) { setAreaHits([]); return undefined; }
    let gone = false;
    const t = window.setTimeout(() => {
      fetch(`/api/places/areas?${new URLSearchParams({ q, state: form.state || "" })}`)
        .then((r) => (r.ok ? r.json() : null)).then((d) => { if (!gone) setAreaHits(d?.areas || []); }).catch(() => {});
    }, 350);
    return () => { gone = true; window.clearTimeout(t); };
  }, [form.addressLine2, form.state]);
  const citySuggestions = useMemo(() => {
    const typed = String(form.city || "").trim().toLowerCase();
    const list = matchTowns(form.city, form.state);
    return list.length === 1 && list[0].name.toLowerCase() === typed ? [] : list.map((t) => ({ key: t.name + t.state, label: t.name, sub: t.state, city: t.name, state: t.state }));
  }, [form.city, form.state]);
  const areaSuggestions = useMemo(() => {
    const typed = String(form.addressLine2 || "").trim().toLowerCase();
    const fromPin = (pinInfo?.areas || [])
      .filter((a) => !typed || a.toLowerCase().includes(typed))
      .map((a) => ({ key: "p" + a, label: a, sub: `${pinInfo.city} ${pinInfo.pin}`, area: a }));
    const fromSearch = areaHits.map((h) => ({ key: h.area + h.pin, label: h.area, sub: `${h.city}, ${h.state} ${h.pin}`, area: h.area, city: h.city, state: h.state, pin: h.pin }));
    const all = [...fromPin, ...fromSearch.filter((h) => !fromPin.some((p) => p.label === h.label))].slice(0, 8);
    return all.length === 1 && all[0].label.toLowerCase() === typed ? [] : all;
  }, [form.addressLine2, pinInfo, areaHits]);

  const isEmpty = items.length === 0;

  // Meta: the customer reached checkout with something in the cart (once).
  const startedCheckout = !isEmpty && status === "idle";
  const [checkoutTracked, setCheckoutTracked] = useState(false);
  useEffect(() => {
    if (!startedCheckout || checkoutTracked) return;
    setCheckoutTracked(true);
    // Checkout journey, step 2: proceeded to checkout.
    recordJourney("checkout", { items: journeyItems(items), value: journeyValue(items) });
    trackMetaEvent("InitiateCheckout", {
      content_ids: items.map((i) => i.id), content_type: "product",
      num_items: items.reduce((n, i) => n + i.qty, 0),
      value: subtotal, currency: "INR",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedCheckout]);
  const busy = status === "paying";

  // Checkout journey, step 3 as the form is filled: once there is a 10-digit
  // mobile number, the details are saved (and again after each change, a
  // moment after typing stops), so the team can help someone who stops before
  // paying. The form says so, with a link to the Privacy Policy.
  const sentDetails = useRef("");
  useEffect(() => {
    if (isEmpty || status !== "idle") return undefined;
    if (String(form.phone).replace(/\D/g, "").length < 10) return undefined;
    const contact = { name: form.name, phone: form.phone, email: form.email, city: form.city, state: form.state, pincode: form.pincode };
    const key = JSON.stringify(contact);
    if (key === sentDetails.current) return undefined;
    const t = window.setTimeout(() => {
      sentDetails.current = key;
      recordJourney("details", { items: journeyItems(items), value: journeyValue(items), contact });
    }, 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name, form.phone, form.email, form.city, form.state, form.pincode, status, isEmpty]);

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

    // A code that does not apply (wrong mobile number, minimum not met…) is explained in the summary;
    // the order is not started until it is fixed or removed, so nobody pays without the discount they expected.
    if (discountCode && discountError) {
      setFailure(`Your code ${discountCode} cannot be used: ${discountError} Remove it to continue without it.`);
      return;
    }

    setStatus("paying");
    // Checkout journey, step 3: details filled (the form passed its checks).
    recordJourney("details", {
      items: journeyItems(items), value: journeyValue(items),
      contact: { name: form.name, phone: form.phone, email: form.email, city: form.city, state: form.state, pincode: form.pincode },
    });

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
          deliveryMethod: deliveryMethod || "courier",
          ...(discountCode ? { discountCode } : {}),
          items: items.map((item) => ({ id: item.id, qty: item.qty })),
          attribution: currentAttribution(),
          meta: metaCheckoutSignal(),
          ...(orderId ? { orderId } : {}),
          ...(excludeGateway.length ? { excludeGateway } : {}),
        });
        orderId = session.orderId;
        // Checkout journey, step 4: continued to payment (the order exists now).
        recordJourney("payment", { orderId });
      } catch (error) {
        recordJourney("failed", { error: error.message || "Could not start the order" });
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
        // Checkout journey, step 5: payment cancelled by the shopper, or failed.
        recordJourney(error instanceof PaymentCancelledError ? "cancelled" : "failed", {
          orderId,
          error: error instanceof PaymentCancelledError ? "Cancelled by the customer" : error.message || "Payment failed",
        });
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
      recordJourney("failed", { orderId, error: "The payment window could not open" });
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
      const receipt = {
        orderId: session.orderId,
        orderNumber: result.orderNumber,
        amount: result.amount ?? session.amount,
        paidAt: result.paidAt,
        gatewayLabel: result.gatewayLabel,
        method: result.method,
        last4: result.last4,
        customerName: form.name,
        customerEmail: form.email,
        // What was bought, kept on the receipt (the cart is emptied below) for the Google purchase event
        // sent when the order-confirmed page opens.
        shipping: shipping || 0,
        discount: session.discount?.amount || 0,
        coupon: session.discount?.code || "",
        deliveryMethod: session.deliveryMethod || deliveryMethod || "courier",
        // The customer's own referral code (while Refer a friend is on), to share from the receipt.
        referralCode: result.referralCode || null,
        items: items.map((i) => ({ id: i.id, name: i.name, price: i.price, packKg: i.packKg, qty: i.qty })),
      };
      setConfirmed(receipt);
      // The code is used: the next order starts without it.
      saveDiscountCode("");
      // The Meta Purchase event is sent when /order-confirmed opens (below the receipt state).
      // Checkout journey: purchased (the server checks the order really is paid).
      recordJourney("purchased", { orderId: session.orderId });
      endJourney();
      setStatus("done");
      navigate("/order-confirmed", { replace: true, state: { confirmed: receipt } });
      // The funnel's "Paid" step (/admin). Only for visitors who accepted
      // analytics cookies; best effort, never in the way of the receipt.
      trackEvent("purchase", { orderRef: result.orderNumber, valueInr: Number(result.amount ?? session.amount) }).catch(() => {});
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

  // /order-confirmed opened without a receipt (a shared or bookmarked link).
  if (onConfirmedPage && !(status === "done" && confirmed)) {
    return <Navigate to="/track-order" replace />;
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
            {confirmed.deliveryMethod === "in_house" && (
              <p className="receipt-own-delivery">
                <strong>Chennai Rice delivery:</strong> our own team will bring your order. We will call before we come.
              </p>
            )}
            {confirmed.referralCode && <ReferralShare code={confirmed.referralCode} compact />}
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
            <Link className="checkout-btn checkout-btn--link" to="/rice-products">
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
            <Link className="checkout-btn checkout-btn--link" to="/rice-products">
              Browse the packs
            </Link>
          </div>
        ) : (
          <div className="cart-layout">
            {/* The pay button lives in the summary aside, not inside this
                form, so it is associated by id instead of by nesting. */}
            <form id="checkout-form" className="checkout-form" onSubmit={handleSubmit} noValidate>
              <h2 className="checkout-form-title">Where should we deliver?</h2>
              {resumeNote && <p className="checkout-resume-note" role="status">{resumeNote}</p>}
              <p className="checkout-form-note">
                We save these details as you fill them in, so our team can help if you can't finish your order.{" "}
                <Link to="/privacy">Privacy Policy</Link>
              </p>

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
                <SuggestInput
                  value={form.addressLine2}
                  onChange={set("addressLine2")}
                  items={areaSuggestions}
                  onPick={(it) => fill(it.pin ? { addressLine2: it.area, city: it.city, state: it.state, pincode: it.pin } : { addressLine2: it.area })}
                  inputProps={{ placeholder: "Area, nearby landmark", autoComplete: "off", disabled: busy }}
                />
              </label>

              <div className="checkout-field-row">
                <label className="field">
                  <span className="field-label">City / town</span>
                  <SuggestInput
                    value={form.city}
                    onChange={set("city")}
                    items={citySuggestions}
                    onPick={(it) => fill({ city: it.city, state: it.state })}
                    inputProps={{ placeholder: "Chennai", autoComplete: "off", "aria-invalid": !!errors.city, disabled: busy }}
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
                  {!errors.pincode && <span className="field-hint">The delivery charge is worked out from your PIN code.</span>}
                </label>
              </div>

              <DeliveryChoice options={deliveryOptions} value={deliveryMethod || deliveryChoice} onChange={setDeliveryChoice} disabled={busy} />

              {(failure || quoteError) && (
                <p className="field-error checkout-failure" role="alert">
                  {failure || quoteError}
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
                <div className="summary-row">
                  <dt>
                    {ownDelivery ? "Chennai Rice delivery" : "Delivery charge"}
                    {region && !ownDelivery && <span className="summary-sub"> ({region.name})</span>}
                  </dt>
                  <dd>{shipping == null ? (hasPin ? "—" : "Enter PIN code") : formatRupees(shipping)}</dd>
                </div>
                <DiscountCode
                  applied={discountCode}
                  discount={discount}
                  error={discountError}
                  checking={Boolean(discountCode && !discount && !discountError)}
                  onApply={setDiscountCode}
                  onRemove={() => setDiscountCode("")}
                  disabled={busy}
                />
                <div className="summary-row summary-row--total">
                  <dt>Total</dt>
                  <dd>{formatRupees(total)}</dd>
                </div>
              </dl>

              <button className="checkout-btn" type="submit" form="checkout-form" disabled={busy}>
                <strong>{busy ? "Opening payment…" : shipping == null ? "Continue to payment" : "Pay " + formatRupees(total)}</strong>
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
