import { useEffect, useMemo, useState } from "react";
import { useCart } from "./useCart.jsx";

const PIN = /^[1-9]\d{5}$/;

/**
 * The server's price for the cart: subtotal, and once a PIN code is given,
 * the delivery charge for that PIN code's region and the total. The same
 * pricing checkout charges, so what is shown is what the customer pays.
 * Brings the saved cart's prices up to date. Until the quote arrives (or if
 * the server cannot be reached) the cart's own subtotal is shown.
 */
export default function useCartQuote(pincode = "") {
  const { items, subtotal, syncPrices } = useCart();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");

  const pin = PIN.test(String(pincode).trim()) ? String(pincode).trim() : "";
  const key = useMemo(() => items.map((i) => `${i.id}:${i.qty}`).join(",") + "@" + pin, [items, pin]);

  useEffect(() => {
    if (!items.length) {
      setQuote(null);
      setError("");
      return undefined;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: items.map((i) => ({ id: i.id, qty: i.qty })), pincode: pin }),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setQuote(null);
          setError(data?.error || "");
          return;
        }
        setQuote(data);
        setError("");
        syncPrices(data.lines);
      } catch (err) {
        if (err?.name !== "AbortError") setQuote(null);
      }
    }, 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
    // items is read through key; syncPrices is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const sub = quote ? quote.subtotal : subtotal;
  const shipping = quote ? quote.shipping : null; // null = needs a PIN code
  return {
    subtotal: sub,
    shipping,
    region: quote?.region || null, // { code, name }
    total: sub + (shipping || 0),
    hasPin: Boolean(pin),
    error,
  };
}
