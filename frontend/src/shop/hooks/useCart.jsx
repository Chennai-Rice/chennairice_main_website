import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { trackAddToCart } from "../../services/events.js";

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

  // Persist on every change; swap this for an API call when a backend exists.
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable — the cart just won't persist */
    }
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
    setItems((current) =>
      qty < 1
        ? current.filter((item) => item.id !== id)
        : current.map((item) => (item.id === id ? { ...item, qty } : item))
    );
  }, []);

  const remove = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  // Emptied once an order is paid for — leaving the packs in the cart after
  // checkout invites the customer to buy them a second time.
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => {
    const count = items.reduce((total, item) => total + item.qty, 0);
    const subtotal = items.reduce((total, item) => total + item.price * item.qty, 0);
    return { items, count, subtotal, add, setQty, remove, clear };
  }, [items, add, setQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside <CartProvider>");
  return context;
}
