import React, { useEffect, useRef, useState } from "react";

/**
 * Share this product. Phones get the system share sheet (WhatsApp, Instagram,
 * Messages…); other browsers get a small menu: WhatsApp, Facebook, Copy link.
 */
export default function ShareButton({ title, text }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);
  const url = typeof window !== "undefined" ? window.location.href.split("#")[0] : "";

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function onShare() {
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    if (touch && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return; // the visitor closed the sheet
      }
    }
    setOpen((v) => !v);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => { setCopied(false); setOpen(false); }, 1400);
  }

  const message = encodeURIComponent(`${text} ${url}`);

  return (
    <div className="pdp-share" ref={ref}>
      <button
        type="button"
        className={`pdp-wishlist pdp-share-btn${open ? " is-active" : ""}`}
        aria-label="Share this product"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onShare}
      >
        <svg width="20" height="20" viewBox="3 3 18.5 18.5" fill="none" aria-hidden="true"><path d="M13.5 5.5 20 11l-6.5 5.5v-3.2c-4.2-.2-7.3 1.4-9.3 4.7.3-5.2 3.3-8.8 9.3-9.3V5.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>
      </button>

      {open && (
        <div className="pdp-share-menu" role="menu" aria-label="Share">
          <a role="menuitem" href={`https://wa.me/?text=${message}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#25D366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" /><path fill="#fff" d="M17.1 14.3c-.3-.1-1.6-.8-1.9-.9-.3-.1-.4-.1-.6.1l-.8 1c-.2.2-.3.2-.6.1a6.8 6.8 0 0 1-3.4-3c-.3-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.9-2c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3z" /></svg>
            WhatsApp
          </a>
          <a role="menuitem" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#1877F2" /><path fill="#fff" d="M13.4 21.9v-7h2.3l.4-2.8h-2.7v-1.8c0-.8.2-1.3 1.4-1.3h1.4V6.5a19 19 0 0 0-2.1-.1c-2.1 0-3.5 1.3-3.5 3.6v2.1H8.3v2.8h2.3v7z" /></svg>
            Facebook
          </a>
          <button type="button" role="menuitem" onClick={copy}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.6" /></svg>
            {copied ? "Link copied ✓" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
