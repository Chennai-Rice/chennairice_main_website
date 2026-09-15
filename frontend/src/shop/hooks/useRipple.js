import { useCallback } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

/**
 * The button ripple from the original app.js.
 *
 * This is the one place real DOM work is still the right tool: the ripple is a
 * throwaway node that must be positioned from the click coordinates and removed
 * when its animation ends. Modelling it as React state would re-render the
 * button on every press for a purely decorative effect.
 */
export function useRipple() {
  const reducedMotion = useReducedMotion();

  return useCallback(
    (event) => {
      if (reducedMotion) return;

      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      // Keyboard activation reports no coordinates — centre the ripple.
      const x = event.clientX ? event.clientX - rect.left : rect.width / 2;
      const y = event.clientY ? event.clientY - rect.top : rect.height / 2;

      const ripple = document.createElement("span");
      ripple.className = "ripple";
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${x - size / 2}px`;
      ripple.style.top = `${y - size / 2}px`;
      ripple.addEventListener("animationend", () => ripple.remove());
      button.appendChild(ripple);
    },
    [reducedMotion]
  );
}
