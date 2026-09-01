const roundCurrency = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/**
 * Applies a lump-sum payment across invoices oldest-first (FIFO).
 *
 * Each invoice must have: { _id, totalAmount, paidAmount, balanceAmount, status }
 * Returns updated copies of touched invoices plus any unallocated leftover.
 *
 * Statuses follow the existing PurchaseInvoice vocabulary:
 *   UNPAID → PARTIALLY_PAID → PAID
 */
export function allocatePayment(invoices, paymentAmount) {
  const sorted = [...invoices].sort((a, b) => {
    const dateA = new Date(a.purchaseDate || a.createdAt || 0).getTime();
    const dateB = new Date(b.purchaseDate || b.createdAt || 0).getTime();
    return dateA - dateB;
  });

  let remaining = roundCurrency(Math.max(0, Number(paymentAmount) || 0));
  const updatedInvoices = [];

  for (const invoice of sorted) {
    if (remaining <= 0) {
      updatedInvoices.push({ ...invoice, _amountApplied: 0 });
      continue;
    }

    const outstanding = roundCurrency(
      Math.max(0, Number(invoice.balanceAmount ?? invoice.totalAmount - invoice.paidAmount) || 0)
    );

    if (outstanding <= 0) {
      updatedInvoices.push({ ...invoice, _amountApplied: 0 });
      continue;
    }

    const applied = roundCurrency(Math.min(remaining, outstanding));
    remaining = roundCurrency(remaining - applied);

    const newPaidAmount = roundCurrency((Number(invoice.paidAmount) || 0) + applied);
    const newBalance = roundCurrency(Math.max(0, Number(invoice.totalAmount) - newPaidAmount));

    let newStatus;
    if (newBalance <= 0) {
      newStatus = "PAID";
    } else if (newPaidAmount > 0) {
      newStatus = "PARTIALLY_PAID";
    } else {
      newStatus = "UNPAID";
    }

    updatedInvoices.push({
      ...invoice,
      paidAmount: newPaidAmount,
      balanceAmount: newBalance,
      status: newStatus,
      _amountApplied: applied,
    });
  }

  return { updatedInvoices, unallocated: remaining };
}
