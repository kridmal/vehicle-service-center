import assert from "node:assert/strict";
import test from "node:test";
import {
  computePurchasePaymentStatus,
  computePurchaseTotals,
} from "../src/utils/purchaseTotals.js";

test("computePurchaseTotals applies invoice discount before tax", () => {
  const totals = computePurchaseTotals({
    subtotal: 1000,
    invoiceDiscount: { type: "PERCENT", value: 10 },
    tax: { enabled: true, rate: 8 },
  });

  assert.equal(totals.subtotal, 1000);
  assert.equal(totals.invoiceDiscountType, "PERCENT");
  assert.equal(totals.invoiceDiscountValue, 10);
  assert.equal(totals.invoiceDiscountAmount, 100);
  assert.equal(totals.taxEnabled, true);
  assert.equal(totals.taxAmount, 72);
  assert.equal(totals.totalAmount, 972);
});

test("computePurchasePaymentStatus returns unpaid/partial/paid states", () => {
  const unpaid = computePurchasePaymentStatus({
    totalAmount: 2000,
    paidAmount: 0,
  });
  assert.equal(unpaid.status, "UNPAID");
  assert.equal(unpaid.balanceAmount, 2000);

  const partial = computePurchasePaymentStatus({
    totalAmount: 2000,
    paidAmount: 1500,
  });
  assert.equal(partial.status, "PARTIALLY_PAID");
  assert.equal(partial.balanceAmount, 500);

  const paid = computePurchasePaymentStatus({
    totalAmount: 2000,
    paidAmount: 2500,
  });
  assert.equal(paid.status, "PAID");
  assert.equal(paid.paidAmount, 2000);
  assert.equal(paid.balanceAmount, 0);
});

