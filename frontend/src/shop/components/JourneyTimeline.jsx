import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Img from "../../components/Img.jsx";

const TOUR_STEP_MS = 1100;

/**
 * The grain's journey. A golden grain travels the line to whichever step is
 * active and the line fills behind it; steps already passed are marked done.
 * Details show in a bubble above the active circle: on hover, focus or tap,
 * and once automatically, step by step, when the section first scrolls into
 * view (skipped for visitors who prefer reduced motion).
 */
export default function JourneyTimeline({ steps }) {
  const [active, setActive] = useState(-1); // furthest step reached / pointed at
  const [open, setOpen] = useState(null); // step whose bubble is showing
  const [touring, setTouring] = useState(false);
  const [geo, setGeo] = useState(null); // line geometry, desktop only
  const wrapRef = useRef(null);
  const figRefs = useRef([]);
  const tourTimer = useRef(null);
  const toured = useRef(false);

  const stopTour = useCallback(() => {
    window.clearTimeout(tourTimer.current);
    setTouring(false);
  }, []);

  const pick = useCallback((i, { show = true } = {}) => {
    stopTour();
    setActive(i);
    setOpen(show ? i : null);
  }, [stopTour]);

  // Where the line runs and where each circle's centre sits on it.
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const figs = figRefs.current.filter(Boolean);
    if (!wrap || figs.length < 2) return;
    const w = wrap.getBoundingClientRect();
    const centres = figs.map((f) => {
      const r = f.getBoundingClientRect();
      return { x: r.left + r.width / 2 - w.left, y: r.top + r.height / 2 - w.top };
    });
    // One row only: on narrower screens the steps wrap and the line is hidden.
    const oneRow = centres.every((c) => Math.abs(c.y - centres[0].y) < 4);
    setGeo(oneRow ? { centres, y: centres[0].y } : null);
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure, steps.length]);

  // The automatic tour, once, when the section is first seen.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || toured.current) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setActive(steps.length - 1);
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || toured.current) return;
      toured.current = true;
      io.disconnect();
      setTouring(true);
      let i = 0;
      const next = () => {
        setActive(i);
        setOpen(i);
        i += 1;
        if (i < steps.length) tourTimer.current = window.setTimeout(next, TOUR_STEP_MS);
        else tourTimer.current = window.setTimeout(() => { setOpen(null); setTouring(false); }, TOUR_STEP_MS);
      };
      tourTimer.current = window.setTimeout(next, 350);
    }, { threshold: 0.6 });
    io.observe(wrap);
    return () => { io.disconnect(); window.clearTimeout(tourTimer.current); };
  }, [steps.length]);

  // A tap outside closes the bubble (touch screens).
  useEffect(() => {
    if (open === null || touring) return undefined;
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, touring]);

  const onKeyDown = (e, i) => {
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: steps.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const j = Math.max(0, Math.min(steps.length - 1, to));
    pick(j);
    wrapRef.current?.querySelectorAll(".pdp-journey-trigger")[j]?.focus();
  };

  const first = geo?.centres[0];
  const last = geo?.centres[geo.centres.length - 1];
  const at = geo && active >= 0 ? geo.centres[active] : null;

  return (
    <div
      className={`pdp-journey-wrap${touring ? " is-touring" : ""}${geo ? " has-line" : ""}`}
      ref={wrapRef}
      onMouseLeave={() => { if (!touring) setOpen(null); }}
    >
      {geo && (
        <div className="pdp-journey-rail" aria-hidden="true" style={{ left: first.x, width: last.x - first.x, top: geo.y }}>
          <span className="pdp-journey-fill" style={{ width: at ? at.x - first.x : 0 }} />
          <span className={`pdp-journey-grain${at ? " is-on" : ""}`} style={{ left: at ? at.x - first.x : 0 }}>
            <svg viewBox="0 0 24 12" width="22" height="11"><ellipse cx="12" cy="6" rx="11" ry="5" /></svg>
          </span>
        </div>
      )}

      <ol className="pdp-journey-track">
        {steps.map((step, i) => (
          <li
            key={step.num}
            className={`pdp-journey-step${open === i ? " is-open" : ""}${i === active ? " is-active" : ""}${i < active ? " is-done" : ""}`}
            onMouseEnter={() => pick(i)}
          >
            <button
              type="button"
              className="pdp-journey-trigger"
              aria-describedby={`journey-tip-${i}`}
              aria-expanded={open === i}
              onClick={() => (open === i ? setOpen(null) : pick(i))}
              onFocus={() => pick(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <span className="pdp-journey-figure" ref={(el) => { figRefs.current[i] = el; }}>
                <Img src={step.image} alt="" aria-hidden="true" />
                <span className="pdp-journey-num">{i < active ? "✓" : step.num}</span>
              </span>
              <span className="pdp-journey-title">{step.title}</span>
            </button>
            <span className="pdp-journey-tip" role="tooltip" id={`journey-tip-${i}`}>
              <strong>{step.num} · {step.title}</strong>
              {step.text}
            </span>
          </li>
        ))}
      </ol>

      <p className="pdp-journey-hint">
        {touring ? "Following the grain…" : "Hover or tap a step to see what happens there."}
      </p>
    </div>
  );
}
