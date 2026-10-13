// Indian digit grouping, as the original cart-store did.
export function formatRupees(value) {
  return "₹" + value.toLocaleString("en-IN");
}
