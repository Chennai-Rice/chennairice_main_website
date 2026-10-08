import React, { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { formatRupees } from "../utils/format.js";

/**
 * The paid-order receipt: a printed slip easing out of a printer, with a burst
 * of confetti behind it.
 *
 * Everything on the slip is real. The order number, amount, timestamp, gateway
 * and card last-four all come from the server's verified confirmation (see
 * confirmCheckout in api/_lib/checkout.js), never from anything the browser
 * assembled — a receipt showing invented details would be worse than no
 * receipt at all. Fields the gateway did not give us (Zoho reports no card
 * digits, for instance) are omitted rather than faked.
 *
 * The printer, the confetti and the tear-line notches are decoration and are
 * hidden from assistive tech; the slip itself is ordinary semantic markup, so a
 * screen reader hears the receipt and none of the theatre.
 */

const CONFETTI_COLORS = [
  "var(--maroon-600)",
  "var(--gold-500)",
  "var(--gold-300)",
  "var(--pack-orange)",
  "#4C9A6B",
  "#4A7FB5",
];

const CONFETTI_COUNT = 44;

// Kept in step with the clip-reveal transition on .receipt in
// styles.scoped.css — if that duration changes, change this with it or the
// confetti starts over a half-printed slip.
const START_DELAY_MS = 120;
const PRINT_MS = 2200;

/** Deterministic-enough scatter, generated once so a re-render cannot reshuffle
 *  mid-animation. */
function useConfetti(active) {
  return useMemo(() => {
    if (!active) return [];
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.6,
      duration: 3.4 + Math.random() * 2.6,
      drift: (Math.random() - 0.5) * 120,
      spin: 360 + Math.random() * 720,
      size: 6 + Math.random() * 7,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      round: Math.random() > 0.65,
    }));
  }, [active]);
}

function Confetti({ pieces }) {
  if (!pieces.length) return null;
  return (
    <div className="receipt-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`confetti-bit${p.round ? " confetti-bit--round" : ""}`}
          style={{
            left: p.left + "%",
            width: p.size + "px",
            height: p.size * (p.round ? 1 : 1.6) + "px",
            background: p.color,
            animationDelay: p.delay + "s",
            animationDuration: p.duration + "s",
            "--drift": p.drift + "px",
            "--spin": p.spin + "deg",
          }}
        />
      ))}
    </div>
  );
}

/** QR as an <svg> string from qrcode-generator — no network request, no image
 *  to load, and it scales cleanly at any size. */
function QrCode({ value, size = 104 }) {
  const html = useMemo(() => {
    if (!value) return null;
    // Type 0 lets the library pick the smallest version that fits; M recovers
    // from roughly 15% damage, which is plenty for a screen.
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
  }, [value]);

  if (!html) return null;
  return (
    <div
      className="receipt-qr-code"
      style={{ width: size, height: size }}
      role="img"
      aria-label={"QR code for order " + value}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** "card" -> "Card", "netbanking" -> "Net banking", "upi" -> "UPI". */
function prettyMethod(method) {
  if (!method) return null;
  const known = {
    card: "Card",
    netbanking: "Net banking",
    upi: "UPI",
    wallet: "Wallet",
    emi: "EMI",
    paylater: "Pay later",
  };
  return known[method] || method.charAt(0).toUpperCase() + method.slice(1);
}

function formatStamp(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return day + " · " + time;
}

export default function PaymentReceipt({ receipt, children }) {
  const { orderNumber, shipmentId, amount, paidAt, customerName, gatewayLabel, method, last4 } = receipt;

  // Two beats, not one. The print starts just after mount so the printer is on
  // screen before anything moves; the confetti waits until the slip is fully
  // out, so the celebration lands on a finished receipt rather than competing
  // with it halfway through.
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const timers = useRef([]);

  useEffect(() => {
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      // No theatre: the receipt is simply there, and nothing falls.
      setPrinting(true);
      return undefined;
    }

    timers.current = [
      window.setTimeout(() => setPrinting(true), START_DELAY_MS),
      // Held until the reveal has actually finished, so the last line is on the
      // paper before the first confetti appears.
      window.setTimeout(() => setPrinted(true), START_DELAY_MS + PRINT_MS),
    ];
    return () => timers.current.forEach((id) => window.clearTimeout(id));
  }, []);

  const pieces = useConfetti(printed);

  const payerLine = [prettyMethod(method), last4 ? "•••• " + last4 : null].filter(Boolean).join(" · ");

  return (
    <div
      className={`receipt-stage${printing ? " is-printing" : ""}${printed ? " is-printed" : ""}`}
    >
      <Confetti pieces={pieces} />

      {/* The printer body. Purely scenery — the slip slides from behind it. */}
      <div className="receipt-printer" aria-hidden="true">
        <span className="receipt-printer-slot" />
      </div>

      {/* The badge sits at the printer's mouth, and so must paint above it.
          It lives here rather than inside <article> because .receipt carries a
          z-index of its own: that makes it a stacking context, and any child of
          it — however high its z-index — is trapped below the printer. */}
      <div className="receipt-badge" aria-hidden="true">
        <img src="/assets/shop/logo.png" alt="" width="64" height="64" loading="eager" />
      </div>

      <article className="receipt" aria-label={"Receipt for order " + orderNumber}>
        {/* The shop name is branding on a slip, not the page's heading — the
            page supplies that, so this stays a paragraph and the document
            outline keeps one h1. */}
        <header className="receipt-head">
          <p className="receipt-store">Chennai Rice</p>
          <p className="receipt-sub">Industries India (P) Ltd. · Chennai</p>
          <p className="receipt-sub">Receipt #{orderNumber}</p>
        </header>

        {/* Tear line: notches are pseudo-elements on this row, so the dashes
            always meet the edges however wide the slip gets. */}
        <div className="receipt-perf" aria-hidden="true" />

        <dl className="receipt-grid">
          <div className="receipt-cell">
            <dt>Order no</dt>
            <dd className="receipt-mono">{orderNumber}</dd>
          </div>
          <div className="receipt-cell receipt-cell--end">
            <dt>Amount</dt>
            <dd className="receipt-amount">{formatRupees(amount)}</dd>
          </div>
          <div className="receipt-cell">
            <dt>Date &amp; time</dt>
            <dd>{formatStamp(paidAt)}</dd>
          </div>
          <div className="receipt-cell receipt-cell--end">
            <dt>Status</dt>
            <dd>
              <span className="receipt-status">Paid in full</span>
            </dd>
          </div>
          {/* Issued by the server with the order, so it is the same ID
              dispatch uses and the customer can quote it when tracking. */}
          {shipmentId && (
            <>
              <div className="receipt-cell">
                <dt>Shipment ID</dt>
                <dd className="receipt-mono">{shipmentId}</dd>
              </div>
              <div className="receipt-cell receipt-cell--end">
                <dt>Shipping</dt>
                <dd>
                  <span className="receipt-status receipt-status--pending">To be dispatched</span>
                </dd>
              </div>
            </>
          )}
        </dl>

        <div className="receipt-payer">
          <span className="receipt-payer-mark" aria-hidden="true">
            <img src="/assets/shop/logo.png" alt="" width="28" height="28" />
          </span>
          <span className="receipt-payer-text">
            <strong>{customerName}</strong>
            {/* Only rendered when the gateway actually told us how they paid. */}
            {payerLine && (
              <span className="receipt-payer-method">
                {gatewayLabel} ({payerLine})
              </span>
            )}
            {!payerLine && gatewayLabel && (
              <span className="receipt-payer-method">Paid via {gatewayLabel}</span>
            )}
          </span>
        </div>

        <figure className="receipt-qr">
          <QrCode value={orderNumber} />
          <figcaption>Scan to verify authenticity</figcaption>
        </figure>

        {children && <div className="receipt-actions">{children}</div>}
      </article>
    </div>
  );
}
