import React from "react";

// The inline emblem from the original header, unchanged.
export default function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="44" height="44" focusable="false" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="#FFFFFF" stroke="#5E1418" strokeWidth="4" />
        <path d="M16 22 C12 16 13 11 18 7" fill="none" stroke="#C9962E" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M32 22 C36 16 35 11 30 7" fill="none" stroke="#C9962E" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="20" y="12" width="8" height="14" rx="1.5" fill="#6E1B22" />
        <path d="M20 12 L24 6 L28 12 Z" fill="#6E1B22" />
        <text
          x="24"
          y="37"
          textAnchor="middle"
          fontFamily="Georgia, serif"
          fontWeight="bold"
          fontSize="9"
          fill="#6E1B22"
        >
          RICE
        </text>
      </svg>
    </span>
  );
}
