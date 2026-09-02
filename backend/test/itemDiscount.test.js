import assert from "node:assert/strict";
import test from "node:test";
import { computeItemDiscount } from "../src/utils/itemDiscount.js";

test("computeItemDiscount returns no discount when disabled", () => {
  const result = computeItemDiscount({
    unitPriceOriginal: 1000,
    qty: 2,
    discountEnabled: false,
    discountType: "PERCENT",
    discountValue: 10,
  });

  assert.deepEqual(result, {
    discountPerUnit: 0,
    unitPriceNet: 1000,
    lineDiscountTotal: 0,
    lineTotalNet: 2000,
  });
});

test("computeItemDiscount applies percent discount with line cap", () => {
  const result = computeItemDiscount({
    unitPriceOriginal: 1000,
    qty: 3,
    discountEnabled: true,
    discountType: "PERCENT",
    discountValue: 20,
    minQty: 1,
    cap: 500,
  });

  assert.equal(result.lineDiscountTotal, 500);
  assert.equal(result.lineTotalNet, 2500);
  assert.equal(result.discountPerUnit, 166.67);
  assert.equal(result.unitPriceNet, 833.33);
});

test("computeItemDiscount applies discount when cap is not set", () => {
  const result = computeItemDiscount({
    unitPriceOriginal: 3320,
    qty: 1,
    discountEnabled: true,
    discountType: "PERCENT",
    discountValue: 10,
    cap: null,
  });

  assert.equal(result.discountPerUnit, 332);
  assert.equal(result.unitPriceNet, 2988);
  assert.equal(result.lineDiscountTotal, 332);
  assert.equal(result.lineTotalNet, 2988);
});

test("computeItemDiscount respects date window and min quantity", () => {
  const now = new Date("2026-02-16T10:00:00.000Z");
  const resultOutsideWindow = computeItemDiscount({
    unitPriceOriginal: 500,
    qty: 4,
    discountEnabled: true,
    discountType: "AMOUNT",
    discountValue: 50,
    startAt: "2026-02-17T00:00:00.000Z",
    endAt: "2026-02-18T00:00:00.000Z",
    minQty: 2,
    now,
  });
  assert.equal(resultOutsideWindow.lineDiscountTotal, 0);

  const resultBelowMinQty = computeItemDiscount({
    unitPriceOriginal: 500,
    qty: 1,
    discountEnabled: true,
    discountType: "AMOUNT",
    discountValue: 50,
    startAt: "2026-02-15T00:00:00.000Z",
    endAt: "2026-02-17T00:00:00.000Z",
    minQty: 2,
    now,
  });
  assert.equal(resultBelowMinQty.lineDiscountTotal, 0);
});

test("computeItemDiscount clamps discount amount to unit price", () => {
  const result = computeItemDiscount({
    unitPriceOriginal: 300,
    qty: 2,
    discountEnabled: true,
    discountType: "AMOUNT",
    discountValue: 500,
  });

  assert.equal(result.discountPerUnit, 300);
  assert.equal(result.unitPriceNet, 0);
  assert.equal(result.lineDiscountTotal, 600);
  assert.equal(result.lineTotalNet, 0);
});
