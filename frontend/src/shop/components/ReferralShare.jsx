import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./referral.css";

/**
 * Refer a friend: the customer's code with Copy and Share (the phone's own share menu: WhatsApp, SMS…).
 * On the order-confirmed page and at /refer. The friend types the code (or this customer's mobile
 * number) at checkout; the amounts come from the server.
 */
export default function ReferralShare({ code, friendGets, youGet, share, compact = false }) {
  const [copied, setCopied] = useState("");
  if (!code) return null;
  const message = share || `Use my code ${code} at chennairiceindustries.com checkout for money off your first order of Chennai Rice.`;

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(""), 2000);
    } catch { /* the code is on screen */ }
  }
  async function shareIt() {
    if (navigator.share) {
      try { await navigator.share({ text: message }); return; } catch { /* closed */ return; }
    }
    copy(message, "message");
  }

  return (
    <div className={"referral-card" + (compact ? " referral-card--compact" : "")}>
      <p className="referral-eyebrow">Refer a friend</p>
      <p className="referral-lead">
        {friendGets ? <>Your friend gets <strong>₹{friendGets} off</strong> their first order. </> : <>Your friend gets money off their first order. </>}
        {youGet ? <>You get <strong>₹{youGet} off</strong> when it is delivered.</> : <>You get a reward when it is delivered.</>}
      </p>
      <div className="referral-code">
        <span className="referral-code-text">{code}</span>
        <button type="button" className="referral-copy" onClick={() => copy(code, "code")}>{copied === "code" ? "Copied" : "Copy"}</button>
      </div>
      <button type="button" className="referral-share" onClick={shareIt}>
        {copied === "message" ? "Message copied — paste it to your friends" : "Share with friends"}
      </button>
      <p className="referral-fine">
        Friends type your code, or your mobile number, at checkout. First orders only.
        {compact && <> <Link to="/refer">See your rewards</Link></>}
      </p>
    </div>
  );
}
