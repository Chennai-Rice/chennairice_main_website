import { useEffect, useMemo, useState } from "react";
import { useCart } from "./useCart.jsx";

// We deliver within Tamil Nadu only for now; the server refuses other states.
export const DELIVERY_STATE = "Tamil Nadu";

/**
 * The server's price for the cart: subtotal, delivery charge and total, for
 * delivery in Tamil Nadu. The same pricing checkout charges, so what the cart
 * shows is what the customer pays. Brings the saved cart's prices up to date
 * and, until the quote arrives (or if the server cannot be reached), falls
 * back to the cart's own arithmetic.
 */
export default function useCartQuote() {
  const { items, subtotal, syncPrices } = useCart();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");

  const key = useMemo(() => items.map((i) => `${i.id}:${i.qty}`).join(","), [items]);

  useEffect(() => {
    if (!key) {
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
          body: JSON.stringify({ items: items.map((i) => ({ id: i.id, qty: i.qty })), state: DELIVERY_STATE }),
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

  // Before the quote: the packs' own delivery charges, if every pack has one.
  const localDelivery = items.every((i) => i.delivery != null)
    ? items.reduce((t, i) => t + i.delivery * i.qty, 0)
    : null;

  const shipping = quote ? quote.shipping : localDelivery;
  const sub = quote ? quote.subtotal : subtotal;
  return {
    subtotal: sub,
    shipping, // null = not known yet
    total: sub + (shipping || 0),
    error,
    ready: Boolean(quote),
  };
}
