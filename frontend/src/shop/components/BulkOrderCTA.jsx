import React from "react";
import { Link } from "react-router-dom";

export default function BulkOrderCTA() {
  return (
    <div className="pdp-bulk-cta">
      <div>
        <h3>Looking for Rice in Bulk?</h3>
        <p>Connect with Chennai Rice for distributor, retailer and institutional requirements.</p>
      </div>
      <div className="pdp-bulk-actions">
        <Link className="btn-maroon" to="/bulk-order">
          Request Bulk Quote
        </Link>
      </div>
    </div>
  );
}
