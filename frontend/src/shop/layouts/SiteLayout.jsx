import React from "react";

/**
 * Page shell for the merged product pages.
 *
 * Upstream this rendered the repo's own Header and Footer. In this app the
 * global Navbar and Footer live in App.jsx so every route shares one nav, so
 * this now only provides the skip link and the .shop-scope wrapper that the
 * scoped stylesheet keys off.
 */
export default function SiteLayout({ children, skipTo, skipLabel }) {
  return (
    <div className="shop-scope">
      <a className="skip-link" href={`#${skipTo}`}>
        {skipLabel}
      </a>
      <main>{children}</main>
    </div>
  );
}
