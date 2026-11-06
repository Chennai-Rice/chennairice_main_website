import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SiteLayout from "../layouts/SiteLayout.jsx";
import usePageMeta from "../hooks/usePageMeta.js";
import ReferralShare from "../components/ReferralShare.jsx";
import "../components/referral.css";

/**
 * /refer: how Refer a friend works, and a customer's own code and rewards (mobile number + the email on
 * one of their orders; backend/lib/sales/referrals.js). Rewards are used by themselves at checkout.
 */
const day = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const STATE = { available: "Ready to use", used: "Used", expired: "Expired", cancelled: "Cancelled" };

export default function ReferPage() {
  usePageMeta("Refer a friend — Chennai Rice", "Share your Chennai Rice code: your friend saves on their first order, and you get a reward when it arrives.");
  const [running, setRunning] = useState(null);
  const [form, setForm] = useState({ phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);

  useEffect(() => {
    fetch("/api/referral").then((r) => r.json()).then((d) => setRunning(Boolean(d.enabled))).catch(() => setRunning(false));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/referral/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.phone, email: form.email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Please try again in a minute.");
      setMe(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteLayout skipTo="refer-heading" skipLabel="Skip to Refer a friend">
      <section className="refer-page">
        <p className="eyebrow">Refer a friend</p>
        <h1 id="refer-heading">Share Chennai Rice, save together</h1>

        {running === false && (
          <p>Refer a friend is not running right now. Please check back soon.</p>
        )}

        {running && !me && (
          <>
            <ol className="refer-steps">
              <li>Get your code below (or find it in your order email).</li>
              <li>Share it with friends and family.</li>
              <li>They type your code, or your mobile number, at checkout and save on their first order.</li>
              <li>When their order is delivered, you get money off your next order. It is applied for you at checkout.</li>
            </ol>
            <form className="refer-form" onSubmit={submit} noValidate>
              <h2>Get my code &amp; rewards</h2>
              <label>
                Mobile number
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} inputMode="tel" autoComplete="tel" placeholder="98765 43210" maxLength={16} required />
              </label>
              <label>
                Email used on your order
                <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" autoComplete="email" placeholder="you@example.com" maxLength={200} required />
              </label>
              {error && <p className="refer-error" role="alert">{error}</p>}
              <button type="submit" disabled={busy}>{busy ? "Finding…" : "Show my code"}</button>
              <p className="referral-fine">Not ordered yet? <Link to="/rice-products">Shop now</Link> and your code comes with your order.</p>
            </form>
          </>
        )}

        {me && (
          <>
            <p>Hello {me.name}! Here is your code.</p>
            <ReferralShare code={me.code} friendGets={me.friendGets} youGet={me.youGet} share={me.share} />
            <div className="refer-stats">
              <div className="refer-stat"><strong>{me.friends}</strong><span>friends ordered</span></div>
              <div className="refer-stat"><strong>₹{me.earned}</strong><span>earned</span></div>
              <div className="refer-stat"><strong>₹{me.available}</strong><span>ready to use</span></div>
            </div>
            {me.rewards.length > 0 ? (
              <ul className="refer-rewards">
                {me.rewards.map((r) => (
                  <li key={r.code}>
                    <span>₹{r.amount} off · earned {day(r.earnedAt)}{r.state === "available" && r.expiresAt ? ` · use by ${day(r.expiresAt)}` : ""}</span>
                    <span className={"refer-state--" + r.state}>{STATE[r.state]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="referral-fine">No rewards yet. They appear here when a friend's order is delivered.</p>
            )}
            <p className="referral-fine" style={{ marginTop: 14 }}>
              Rewards are used by themselves at checkout when you order with this mobile number and email.
            </p>
          </>
        )}
      </section>
    </SiteLayout>
  );
}
