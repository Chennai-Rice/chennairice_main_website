import React from "react";

// Controlled search input. The original prevented the form from reloading the
// page; here onSubmit does the same and filtering is already live on input.
export default function SearchBar({ value, onChange }) {
  return (
    <form className="search" role="search" aria-label="Search products" onSubmit={(e) => e.preventDefault()}>
      <label className="visually-hidden" htmlFor="product-search">
        Search products
      </label>
      <svg className="search-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
        <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="13.8" y1="13.8" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        id="product-search"
        type="search"
        name="q"
        placeholder="Search rice — try “Rajabhogam”"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </form>
  );
}
