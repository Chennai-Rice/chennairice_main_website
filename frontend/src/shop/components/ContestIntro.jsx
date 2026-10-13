import "./contestintro.css";

const LOGO = "/assets/contest/slogan-contest-logo.webp";
const HOLD_MS = 1800; // logo on screen before the product page opens behind it
const REVEAL_DELAY_MS = 350; // let the product page draw before fading
const FADE_MS = 450;
const REDUCED_HOLD_MS = 500; // visitors who prefer reduced motion

// Fetched early so the logo is ready the moment the card is clicked.
export function preloadContestLogo() {
  const img = new Image();
  img.src = LOGO;
}

/**
 * The Super Slogan Contest transition: a full-screen maroon stage with the
 * contest logo in the centre (gold rays turning behind it). It stays fully
 * opaque while the product page opens underneath, then fades away, so the
 * page the visitor came from never shows through.
 *
 * Built outside React on purpose: the card that starts it unmounts when the
 * route changes, and the screen has to outlive it.
 */
export function playContestIntro(navigate, to) {
  if (document.querySelector(".contest-intro")) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const el = document.createElement("div");
  el.className = "contest-intro";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `
    <span class="contest-intro-rays" aria-hidden="true"></span>
    <span class="contest-intro-glow" aria-hidden="true"></span>
    <img class="contest-intro-logo" src="${LOGO}" alt="Chennai Rice Super Slogan Contest">
    <span class="contest-intro-bar" aria-hidden="true"><span></span></span>`;
  document.body.appendChild(el);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  window.setTimeout(() => {
    navigate(to);
    window.setTimeout(() => {
      el.classList.add("is-leaving");
      window.setTimeout(() => {
        el.remove();
        document.body.style.overflow = prevOverflow;
      }, FADE_MS);
    }, REVEAL_DELAY_MS);
  }, reduced ? REDUCED_HOLD_MS : HOLD_MS);
}
