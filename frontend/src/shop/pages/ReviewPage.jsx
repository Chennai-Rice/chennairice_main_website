import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SiteLayout from "../layouts/SiteLayout.jsx";
import usePageMeta from "../hooks/usePageMeta.js";
import "./review.css";

// /review (Nov 2026): what customers say (the reviews staff have published) and, opened from the
// "Order Delivered" email (?o=<order>&t=<signed>&rating=N), the form to review that order.
const when = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

function Stars({ value, onPick, size = 34, label }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="rv-stars" role={onPick ? "radiogroup" : "img"} aria-label={label || `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onPick ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className={`rv-star${n <= shown ? " is-on" : ""}`} style={{ fontSize: size }}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => onPick(n)}>★</button>
        ) : (
          <span key={n} className={`rv-star${n <= shown ? " is-on" : ""}`} style={{ fontSize: size }} aria-hidden="true">★</span>
        )
      )}
    </div>
  );
}

function ReviewForm({ o, t, initialRating }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(initialRating);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/reviews/form?${new URLSearchParams({ o, t })}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) { setError(body.error || "This review link is not valid."); return; }
        setForm(body);
        setName(body.name || "");
        if (body.review) { setText(body.review.text || ""); if (!initialRating) setRating(body.review.rating); if (body.review.status === "published") setDone(true); }
      })
      .catch(() => setError("Please check your connection and try again."));
  }, [o, t, initialRating]);

  async function submit(e) {
    e.preventDefault();
    if (!rating) { setError("Please choose 1 to 5 stars."); return; }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ o, t, rating, text, name }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Please try again in a minute.");
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !form) return <div className="rv-card rv-form"><p className="rv-error">{error}</p></div>;
  if (!form) return <div className="rv-card rv-form"><p className="rv-muted">Loading your order…</p></div>;
  if (done) {
    return (
      <div className="rv-card rv-form rv-thanks" role="status">
        <h2>Thank you, {name || "friend"}!</h2>
        <p>Your review means a lot to our family at Chennai Rice. We read every one.</p>
        {rating >= 4 && <p className="rv-muted">Once our team has looked at it, it may appear on this page.</p>}
        {rating <= 3 && <p>Something not right? <a href="https://wa.me/917066646667" target="_blank" rel="noreferrer">WhatsApp us</a> and we’ll sort it out.</p>}
      </div>
    );
  }
  return (
    <form className="rv-card rv-form" onSubmit={submit}>
      <p className="rv-eyebrow">Order {form.orderNumber}</p>
      <h2>How was your Chennai Rice?</h2>
      {form.products && <p className="rv-muted">{form.products}</p>}
      <Stars value={rating} onPick={setRating} size={40} label="Your rating" />
      <label className="rv-field">
        <span>Tell us more (optional)</span>
        <textarea rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="How did it cook? How did it taste? How was the delivery?" />
      </label>
      <label className="rv-field">
        <span>Your name (as shown with your review)</span>
        <input type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {error && <p className="rv-error" role="alert">{error}</p>}
      <button type="submit" className="rv-btn" disabled={busy}>{busy ? "Sending…" : "Submit review"}</button>
    </form>
  );
}

export default function ReviewPage() {
  usePageMeta("Customer reviews — Chennai Rice", "What families across Tamil Nadu say about Chennai Rice: real reviews from customers who ordered online.");
  const params = new URLSearchParams(useLocation().search);
  const o = params.get("o");
  const t = params.get("t");
  const initialRating = Math.min(5, Math.max(0, Number(params.get("rating")) || 0));
  const [list, setList] = useState(null);

  useEffect(() => {
    fetch("/api/reviews").then((r) => r.json()).then(setList).catch(() => setList({ reviews: [], count: 0 }));
  }, []);

  return (
    <SiteLayout skipTo="review-heading" skipLabel="Skip to reviews">
      <section className="rv-page">
        <p className="rv-eyebrow">Tradition · Quality · Trust</p>
        <h1 id="review-heading">What our customers say</h1>
        {list?.count > 0 && (
          <div className="rv-summary">
            <strong>{list.average.toFixed(1)}</strong>
            <Stars value={Math.round(list.average)} size={26} />
            <span className="rv-muted">from {list.count} review{list.count === 1 ? "" : "s"}</span>
          </div>
        )}

        {o && t && <ReviewForm o={o} t={t} initialRating={initialRating} />}

        <div className="rv-list">
          {list?.reviews?.map((r, i) => (
            <article key={i} className="rv-card rv-item">
              <Stars value={r.rating} size={20} />
              {r.text && <p className="rv-text">“{r.text}”</p>}
              <p className="rv-by"><strong>{r.name}</strong>{r.city ? `, ${r.city}` : ""} <span className="rv-muted">· {when(r.date)}</span></p>
              {r.products && <p className="rv-muted rv-small">Bought: {r.products}</p>}
            </article>
          ))}
        </div>
        {list && !list.count && !(o && t) && (
          <p className="rv-muted rv-empty">Reviews from our customers will appear here soon. Bought from us? Use the link in your delivery email to leave yours.</p>
        )}
        <p className="rv-cta"><Link to="/rice-products">Shop Chennai Rice →</Link></p>
      </section>
    </SiteLayout>
  );
}
