// Indian digit grouping, as the original cart-store did.
export function formatRupees(value) {
  // Whole rupees as "₹555"; with paise always two digits ("₹165.20", never "₹165.2").
  const n = Number(value) || 0;
  return "₹" + (Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}
