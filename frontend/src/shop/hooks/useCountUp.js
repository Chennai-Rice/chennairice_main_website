import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

/**
 * Counts a number up once it scrolls into view.
 *
 * Driven by requestAnimationFrame with an ease-out curve so the figure decelerates
 * into its final value instead of ticking linearly. Reduced-motion users get the
 * final number immediately.
 */
export function useCountUp(target, { duration = 1600 } = {}) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  const reduced = useReducedMotion();
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (reduced || !("IntersectionObserver" in window)) {
      setValue(target);
      return;
    }

    const run = () => {
      if (done.current) return;
      done.current = true;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        setValue(Math.round(target * eased));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && run()),
      { threshold: 0.4 }
    );
    observer.observe(el);

    // never leave a zero on screen
    const backstop = window.setTimeout(run, 3500);
    return () => {
      observer.disconnect();
      window.clearTimeout(backstop);
    };
  }, [target, duration, reduced]);

  return { ref, value };
}
