export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function computeItemTotal(qty, unitPrice) {
  return toNumber(qty) * toNumber(unitPrice);
}

export function computeSubTotal(items) {
  return items.reduce((sum, item) => sum + toNumber(item.total), 0);
}

export function computeDiscount(subTotal, discount) {
  const value = toNumber(discount?.value);
  if (discount?.type === "PERCENT") {
    return (subTotal * value) / 100;
  }
  return value;
}

export function computeInvoiceTotals(items, discount) {
  const subTotal = computeSubTotal(items);
  const discountValue = computeDiscount(subTotal, discount);
  const total = Math.max(0, subTotal - discountValue);
  return { subTotal, total };
}

export function computePayment(total, paidAmount) {
  const paid = toNumber(paidAmount);
  if (paid <= 0) {
    return { status: "UNPAID" };
  }
  if (paid < total) {
    return { status: "PARTIAL" };
  }
  return { status: "PAID" };
}
