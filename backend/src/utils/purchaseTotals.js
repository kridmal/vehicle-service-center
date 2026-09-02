const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundCurrency = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const normalizePurchaseDiscount = (discount, subtotal) => {
  if (!discount) {
    return {
      invoiceDiscountType: "AMOUNT",
      invoiceDiscountValue: 0,
      invoiceDiscountAmount: 0,
    };
  }

  const type = String(discount.type || discount.discountType || "AMOUNT")
    .trim()
    .toUpperCase();
  const rawValue = Math.max(
    0,
    toNumber(discount.value ?? discount.discountValue ?? discount.amount ?? 0)
  );

  if (type === "PERCENT") {
    const percent = clamp(rawValue, 0, 100);
    return {
      invoiceDiscountType: "PERCENT",
      invoiceDiscountValue: percent,
      invoiceDiscountAmount: roundCurrency((subtotal * percent) / 100),
    };
  }

  return {
    invoiceDiscountType: "AMOUNT",
    invoiceDiscountValue: rawValue,
    invoiceDiscountAmount: roundCurrency(clamp(rawValue, 0, subtotal)),
  };
};

export const normalizePurchaseTax = (taxInput, taxableAmount) => {
  if (!taxInput || taxInput.enabled === false) {
    return { taxEnabled: false, taxRate: 0, taxAmount: 0 };
  }

  const taxRate = clamp(toNumber(taxInput.rate), 0, 100);
  return {
    taxEnabled: true,
    taxRate,
    taxAmount: roundCurrency((taxableAmount * taxRate) / 100),
  };
};

export const computePurchaseTotals = ({ subtotal, invoiceDiscount, tax }) => {
  const safeSubtotal = roundCurrency(Math.max(0, toNumber(subtotal)));
  const discount = normalizePurchaseDiscount(invoiceDiscount, safeSubtotal);
  const taxableAmount = roundCurrency(
    Math.max(0, safeSubtotal - discount.invoiceDiscountAmount)
  );
  const taxResult = normalizePurchaseTax(tax, taxableAmount);
  const totalAmount = roundCurrency(taxableAmount + taxResult.taxAmount);

  return {
    subtotal: safeSubtotal,
    invoiceDiscountType: discount.invoiceDiscountType,
    invoiceDiscountValue: discount.invoiceDiscountValue,
    invoiceDiscountAmount: discount.invoiceDiscountAmount,
    taxEnabled: taxResult.taxEnabled,
    taxRate: taxResult.taxRate,
    taxAmount: taxResult.taxAmount,
    totalAmount,
  };
};

export const computePurchasePaymentStatus = ({ totalAmount, paidAmount }) => {
  const safeTotal = roundCurrency(Math.max(0, toNumber(totalAmount)));
  const safePaid = roundCurrency(Math.max(0, toNumber(paidAmount)));
  const clampedPaid = Math.min(safePaid, safeTotal);
  const balanceAmount = roundCurrency(Math.max(0, safeTotal - clampedPaid));

  let status = "UNPAID";
  if (clampedPaid <= 0) {
    status = "UNPAID";
  } else if (balanceAmount > 0) {
    status = "PARTIALLY_PAID";
  } else {
    status = "PAID";
  }

  return {
    paidAmount: clampedPaid,
    balanceAmount,
    status,
  };
};

export { roundCurrency, toNumber };

