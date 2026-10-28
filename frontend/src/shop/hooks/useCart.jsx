import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { trackAddToCart } from "../../services/events.js";
import { trackMetaEvent } from "../../services/metaPixel.js";
import { recordJourney, journeyItems, journeyValue } from "../../services/journey.js";

/**
 * The cart, ported from js/cart-store.js.
 *
 * Same storage key and same line-item shape, so a cart saved by the old site is
 * still read correctly. What changes is that state now lives in React and is
 * shared through context, which is what lets the header badge, the product
 * cards and the cart page stay in sync without any manual repainting.
 */

const KEY = "chennai-rice-cart";
const CartContext = createContext(null);

function readStorage() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    // Private mode, disabled storage, or corrupt JSON — start empty rather
    // than break the page.
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readStorage);
  // The pack added last: the "Proceed to cart" bar shows its picture. Not saved; falls back to the newest line.
  const [lastAddedId, setLastAddedId] = useState(null);

  // Persist on every change; swap this for an API call when a backend exists.
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable — the cart just won't persist */
    }
  }, [items]);

  // Checkout journey, step 1: the cart (after the shopper changes it, not on page load).
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) { loaded.current = true; return undefined; }
    if (!items.length) return undefined;
    const t = window.setTimeout(() => recordJourney("cart", { items: journeyItems(items), value: journeyValue(items) }), 1200);
    return () => window.clearTimeout(t);
  }, [items]);

  // Keep tabs in step with each other.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === KEY) setItems(readStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((product) => {
    // Fired outside the state updater: React may invoke that function more
    // than once, which would record duplicate events for a single add.
    // Best-effort and gated on analytics consent inside trackAddToCart.
    trackAddToCart(product);
    setLastAddedId(product.id);
    trackMetaEvent("AddToCart", {
      content_ids: [product.id], content_name: product.name, content_type: "product",
      value: product.price, currency: "INR",
    });

    setItems((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          tag: product.tag,
          price: product.price,
          image: product.image,
          qty: 1
        }
      ];
    });
  }, []);

  const setQty = useCallback((id, qty) => {
    if (qty >= 1) setLastAddedId(id);
    setItems((current) =>
      qty < 1
        ? current.filter((item) => item.id !== id)
        : current.map((item) => (item.id === id ? { ...item, qty } : item))
    );
  }, []);

  const remove = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  // The server's prices win: a cart saved before a price change is brought up
  // to date from the checkout quote (unit price and size per pack).
  const syncPrices = useCallback((lines) => {
    const byId = new Map((lines || []).map((l) => [l.id, l]))
    setItems((current) => {
      let changed = false
      const next = current.map((item) => {
        const l = byId.get(item.id)
        if (!l) return item
        const packKg = item.packKg ?? l.packKg
        if (l.unitPrice === item.price && packKg === item.packKg) return item
        changed = true
        return { ...item, price: l.unitPrice, packKg }
      })
      return changed ? next : current
    })
  }, []);

  // Emptied once an order is paid for — leaving the packs in the cart after
  // checkout invites the customer to buy them a second time.
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => {
    const count = items.reduce((total, item) => total + item.qty, 0);
    const subtotal = items.reduce((total, item) => total + item.price * item.qty, 0);
    const lastAdded = items.find((item) => item.id === lastAddedId) || items[items.length - 1] || null;
    return { items, count, subtotal, lastAdded, add, setQty, remove, clear, syncPrices };
  }, [items, lastAddedId, add, setQty, remove, clear, syncPrices]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside <CartProvider>");
  return context;
}
