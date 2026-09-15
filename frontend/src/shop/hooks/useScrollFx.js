import { useEffect, useRef } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

/**
 * Adds `.in` to every `.reveal` inside the returned ref once it enters view.
 *
 * The hidden state lives in CSS but is only *armed* here, so if the observer is
 * unavailable nothing is ever hidden — a failure degrades to "no animation"
 * rather than a blank page.
 */
export function useRevealGroup() {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll(".reveal"));
    if (reduced || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );

    targets.forEach((el) => observer.observe(el));

    // Backstop: anything still hidden after 4s is shown regardless.
    const backstop = window.setTimeout(() => targets.forEach((el) => el.classList.add("in")), 4000);

    return () => {
      observer.disconnect();
      window.clearTimeout(backstop);
    };
  }, [reduced]);

  return ref;
}

/**
 * Vertical parallax on a layer, driven by requestAnimationFrame rather than by
 * reacting to every scroll event — the listener only flags that a frame is
 * needed, so scrolling stays smooth.
 *
 * `speed` is how far the layer moves relative to the page (0.2 = 20%).
 */
export function useParallax(speed = 0.18) {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    let frame = 0;
    let ticking = false;

    const update = () => {
      ticking = false;
      const host = el.parentElement;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      // 0 when the section is centred; ± as it leaves the viewport
      const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * -speed;
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [speed, reduced]);

  return ref;
}

/**
 * Pointer-tracked 3D tilt for the value cards. Writes CSS custom properties
 * instead of setting state, so hovering never triggers a React render.
 */
export function useTilt(max = 7) {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    const onMove = (event) => {
      const rect = el.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      el.style.setProperty("--ry", `${(px * max).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-py * max).toFixed(2)}deg`);
    };
    const reset = () => {
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--rx", "0deg");
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", reset);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", reset);
    };
  }, [max, reduced]);

  return ref;
}
