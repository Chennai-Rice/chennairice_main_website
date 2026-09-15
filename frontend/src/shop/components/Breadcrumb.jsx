import React from "react";
import { Link } from "react-router-dom";

export default function Breadcrumb({ items }) {
  return (
    <nav className="pdp-breadcrumb" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={item.label} className="pdp-breadcrumb-item">
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          {i < items.length - 1 && <span className="pdp-breadcrumb-sep">/</span>}
        </span>
      ))}
    </nav>
  );
}
