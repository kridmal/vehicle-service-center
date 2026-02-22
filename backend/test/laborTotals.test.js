import test from "node:test";
import assert from "node:assert/strict";
import { computeLaborTotals } from "../src/utils/laborTotals.js";

test("computeLaborTotals sums billable labor charges", () => {
  const result = computeLaborTotals([
    { laborCharge: 1000, isBillable: true },
    { laborCharge: 2000, isBillable: true },
  ]);

  assert.equal(result.laborSubtotalOriginal, 3000);
});

test("computeLaborTotals excludes non-billable tasks", () => {
  const result = computeLaborTotals([
    { laborCharge: 1000, isBillable: false },
    { laborCharge: 2000, isBillable: true },
  ]);

  assert.equal(result.laborSubtotalOriginal, 2000);
});

test("computeLaborTotals rounds to 2 decimals", () => {
  const result = computeLaborTotals([
    { laborCharge: 1000.115, isBillable: true },
    { laborCharge: 2000.115, isBillable: true },
  ]);

  assert.equal(result.laborSubtotalOriginal, 3000.24);
});
