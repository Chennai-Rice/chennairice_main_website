import { useEffect, useRef, useState } from "react";

/**
 * IntersectionObserver reveal, carried over from app.js including both of its
 * safety behaviours:
 *   - the element is only marked "will animate" once we know we can reveal it,
 *     so a failure degrades to "no animation" rather than "no content";
 *   - a timeout backstop reveals anyway if the observer never fires.
 */
export function useRevealOnScroll({ threshold = 0.2, fallbackMs = 3000 } = {}) {
  const ref = useRef(null);
  const [armed, setArmed] = useState(false);   // -> .will-animate
  const [revealed, setRevealed] = useState(false); // -> .is-visible

  useEffect(() => {
    const node = ref.current;
    if (!node || !("IntersectionObserver" in window)) return;

    setArmed(true);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          setRevealed(true);
          observer.unobserve(entry.target); // play once
        });
      },
      { threshold }
    );
    observer.observe(node);

    const backstop = window.setTimeout(() => setRevealed(true), fallbackMs);

    return () => {
      observer.disconnect();
      window.clearTimeout(backstop);
    };
  }, [threshold, fallbackMs]);

  return { ref, armed, revealed };
}
