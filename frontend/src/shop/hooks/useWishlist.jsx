import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Saved items, stored the same way as the cart: React state shared through
 * context, mirrored to localStorage and kept in step across tabs.
 *
 * Only ids are stored. Product copy, pricing and imagery are looked up from
 * the catalogue at render time, so a saved item can never go stale against
 * the real product data.
 */

const KEY = "chennai-rice-wishlist";
const WishlistContext = createContext(null);

function readStorage() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const ids = raw ? JSON.parse(raw) : [];
    // Ignore anything that is not a list of ids rather than trusting it.
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    // Private mode, disabled storage, or corrupt JSON — start empty rather
    // than break the page.
    return [];
  }
}

export function WishlistProvider({ children }) {
  const [ids, setIds] = useState(readStorage);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* storage unavailable — saved items just won't persist */
    }
  }, [ids]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === KEY) setIds(readStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((id) => {
    if (!id) return;
    setIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }, []);

  const remove = useCallback((id) => {
    setIds((current) => current.filter((item) => item !== id));
  }, []);

  const clear = useCallback(() => setIds([]), []);

  const value = useMemo(
    () => ({
      ids,
      count: ids.length,
      has: (id) => ids.includes(id),
      toggle,
      remove,
      clear
    }),
    [ids, toggle, remove, clear]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used inside <WishlistProvider>");
  return context;
}
