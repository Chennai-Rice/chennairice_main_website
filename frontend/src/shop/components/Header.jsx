import React from "react";
import { Link, NavLink } from "react-router-dom";
import BrandMark from "./BrandMark.jsx";
import SearchBar from "./SearchBar.jsx";
import CartButton from "./CartButton.jsx";

/**
 * Shared header. The original repeated this markup in all three HTML files with
 * small differences: the product page carried the search field, and the cart
 * page rendered its cart control as non-interactive. Both are props now.
 */
export default function Header({ search = null, onSearchChange = null, cartIsCurrent = false }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="Chennai Rice Industries — home">
          <BrandMark />
          <span className="brand-text">
            <strong>Chennai Rice</strong>
            <small>Industries India (P) Ltd</small>
          </span>
        </Link>

        {search !== null && <SearchBar value={search} onChange={onSearchChange} />}

        <nav className="main-nav" aria-label="Main">
          {/* NavLink sets aria-current="page" on the active route, matching the
              original hand-written attribute. */}
          <NavLink to="/" end>
            Our packs
          </NavLink>
          <NavLink to="/about">About us</NavLink>
        </nav>

        <CartButton current={cartIsCurrent} />
      </div>
    </header>
  );
}
