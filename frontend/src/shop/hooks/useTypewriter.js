import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

/**
 * Types a phrase out, holds it, deletes it, then moves to the next — looping
 * forever.
 *
 * The timer is rescheduled on every step rather than run on a fixed interval,
 * so typing, deleting and the hold between them can each have their own pace.
 * Reduced-motion users get the first phrase as static text.
 */
export function useTypewriter(
  phrases,
  { typeMs = 65, deleteMs = 32, holdMs = 1900, gapMs = 420 } = {}
) {
  const reduced = useReducedMotion();
  const [text, setText] = useState(reduced ? phrases[0] : "");
  const [done, setDone] = useState(reduced);
  const timer = useRef(null);

  useEffect(() => {
    if (reduced) {
      setText(phrases[0]);
      return;
    }

    let phrase = 0;
    let chars = 0;
    let deleting = false;
    let cancelled = false;

    const step = () => {
      if (cancelled) return;
      const current = phrases[phrase];

      if (!deleting) {
        chars += 1;
        setText(current.slice(0, chars));
        if (chars === current.length) {
          setDone(true);
          deleting = true;
          timer.current = window.setTimeout(step, holdMs);
          return;
        }
        setDone(false);
        timer.current = window.setTimeout(step, typeMs);
        return;
      }

      chars -= 1;
      setText(current.slice(0, chars));
      if (chars === 0) {
        deleting = false;
        phrase = (phrase + 1) % phrases.length;
        timer.current = window.setTimeout(step, gapMs);
        return;
      }
      timer.current = window.setTimeout(step, deleteMs);
    };

    timer.current = window.setTimeout(step, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [phrases, typeMs, deleteMs, holdMs, gapMs, reduced]);

  return { text, done };
}
