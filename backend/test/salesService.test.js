import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import {
  buildStockAdjustments,
  performSafeStockDeduction,
  prepareSaleDraft,
} from "../src/services/salesService.js";

const makeInventoryItem = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId().toString(),
  itemName: "Sample Item",
  sku: "SKU-001",
  quantity: 10,
  sellingPrice: 100,
  ...overrides,
});

test("prepareSaleDraft builds totals for discount and tax", () => {
  const first = makeInventoryItem({
    itemName: "Brake Oil",
    sku: "BRK-001",
    quantity: 12,
    sellingPrice: 100,
  });
  const second = makeInventoryItem({
    itemName: "Air Filter",
    sku: "AIR-002",
    quantity: 8,
    sellingPrice: 50,
  });

  const draft = prepareSaleDraft({
    payload: {
      status: "unpaid",
      paymentMethod: "cash",
      items: [
        { productId: first._id, quantity: 2 },
        { productId: second._id, quantity: 1 },
      ],
      discount: { type: "PERCENT", value: 10 },
      tax: { enabled: true, rate: 5 },
    },
    inventoryItems: [first, second],
  });

  assert.equal(draft.status, "UNPAID");
  assert.equal(draft.paymentMethod, "CASH");
  assert.equal(draft.subtotal, 250);
  assert.equal(draft.discountType, "PERCENT");
  assert.equal(draft.discount, 25);
  assert.equal(draft.tax, 11.25);
  assert.equal(draft.grandTotal, 236.25);
});

test("prepareSaleDraft merges duplicate items before line totals", () => {
  const item = makeInventoryItem({
    itemName: "Engine Coolant",
    sku: "ENG-009",
    quantity: 20,
    sellingPrice: 120,
  });

  const draft = prepareSaleDraft({
    payload: {
      status: "PAID",
      paymentMethod: "CARD",
      items: [
        { productId: item._id, quantity: 1 },
        { productId: item._id, quantity: 2 },
      ],
    },
    inventoryItems: [item],
  });

  assert.equal(draft.items.length, 1);
  assert.equal(draft.items[0].quantity, 3);
  assert.equal(draft.items[0].lineTotal, 360);
  assert.equal(draft.subtotal, 360);
});

test("prepareSaleDraft applies predefined item discount before invoice discount", () => {
  const item = makeInventoryItem({
    itemName: "Coolant",
    sku: "COL-010",
    quantity: 10,
    sellingPrice: 100,
    discountEnabled: true,
    discountType: "PERCENT",
    discountValue: 10,
    minQtyForDiscount: 1,
  });

  const draft = prepareSaleDraft({
    payload: {
      status: "PAID",
      paymentMethod: "CASH",
      items: [{ productId: item._id, quantity: 2 }],
      discount: { type: "AMOUNT", value: 20 },
      tax: { enabled: false, rate: 0 },
    },
    inventoryItems: [item],
  });

  assert.equal(draft.itemsSubtotalOriginal, 200);
  assert.equal(draft.itemDiscountTotal, 20);
  assert.equal(draft.subtotal, 180);
  assert.equal(draft.discount, 20);
  assert.equal(draft.grandTotal, 160);
});

test("buildStockAdjustments throws for insufficient stock", () => {
  assert.throws(
    () =>
      buildStockAdjustments([
        {
          productId: new mongoose.Types.ObjectId().toString(),
          productName: "Battery",
          quantity: 6,
          availableStock: 4,
        },
      ]),
    {
      message: /Insufficient stock/,
      code: "INSUFFICIENT_STOCK",
    }
  );
});

test("performSafeStockDeduction rolls back applied stock updates on failure", async () => {
  const adjustments = [
    {
      productId: new mongoose.Types.ObjectId().toString(),
      productName: "Oil Filter",
      quantity: 1,
    },
    {
      productId: new mongoose.Types.ObjectId().toString(),
      productName: "Spark Plug",
      quantity: 2,
    },
  ];

  const decremented = [];
  const restored = [];

  await assert.rejects(
    () =>
      performSafeStockDeduction({
        adjustments,
        decrementStock: async (adjustment) => {
          decremented.push(adjustment.productName);
          return adjustment.productName !== "Spark Plug";
        },
        restoreStock: async (applied) => {
          restored.push(...applied.map((row) => row.productName));
        },
      }),
    /Insufficient stock/
  );

  assert.deepEqual(decremented, ["Oil Filter", "Spark Plug"]);
  assert.deepEqual(restored, ["Oil Filter"]);
});
