import test from "node:test";
import assert from "node:assert/strict";
import { computeLaborTotals } from "../src/utils/laborTotals.js";

test("computeLaborTotals sums selected and billable labor charges", () => {
  const result = computeLaborTotals([
    { laborCharge: 1000, selected: true, isBillable: true },
    { laborCharge: 2000, completed: true, billable: true },
    { laborCharge: 5000, selected: false, isBillable: true },
  ]);

  assert.equal(result.laborSubtotalOriginal, 3000);
});

test("computeLaborTotals excludes non-billable tasks", () => {
  const result = computeLaborTotals([
    { laborCharge: 1000, selected: true, isBillable: false },
    { laborCharge: 2000, selected: true, isBillable: true },
    { laborCharge: 4000, selected: true, billable: false },
  ]);

  assert.equal(result.laborSubtotalOriginal, 2000);
});

test("computeLaborTotals rounds to 2 decimals", () => {
  const result = computeLaborTotals([
    { laborCharge: 1000.115, selected: true, isBillable: true },
    { laborCharge: 2000.115, completed: true, billable: true },
  ]);

  assert.equal(result.laborSubtotalOriginal, 3000.24);
});
