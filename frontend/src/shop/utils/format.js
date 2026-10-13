// Indian digit grouping, as the original cart-store did.
export function formatRupees(value) {
  return "₹" + value.toLocaleString("en-IN");
}

// Price per kg of a pack, to the paisa where it is not whole: ₹116.40, ₹105.
export function formatPerKg(price, kg) {
  const perKg = Math.round((Number(price) / Number(kg)) * 100) / 100;
  return "₹" + perKg.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(perKg) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
