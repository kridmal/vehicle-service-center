import test from "node:test";
import assert from "node:assert/strict";
import {
  computeLaborLoyaltyDiscount,
  computeLaborDiscount,
  computeTotals,
  deriveLoyaltyPricing,
} from "../src/utils/loyaltyDiscount.js";

test("computeLaborLoyaltyDiscount: 2100 with 100% gives full discount", () => {
  const result = computeLaborLoyaltyDiscount({
    laborOriginal: 2100,
    mode: "PERCENT",
    value: 100,
    cap: null,
  });

  assert.equal(result.discount, 2100);
  assert.equal(result.laborNet, 0);
});

test("computeLaborLoyaltyDiscount: 2100 with 50% gives half discount", () => {
  const result = computeLaborLoyaltyDiscount({
    laborOriginal: 2100,
    mode: "PERCENT",
    value: 50,
    cap: null,
  });

  assert.equal(result.discount, 1050);
  assert.equal(result.laborNet, 1050);
});

test("computeLaborLoyaltyDiscount: 2100 with amount 500 applies fixed discount", () => {
  const result = computeLaborLoyaltyDiscount({
    laborOriginal: 2100,
    mode: "AMOUNT",
    value: 500,
    cap: null,
  });

  assert.equal(result.discount, 500);
  assert.equal(result.laborNet, 1600);
});

test("computeLaborLoyaltyDiscount: cap limits discount", () => {
  const result = computeLaborLoyaltyDiscount({
    laborOriginal: 2100,
    mode: "PERCENT",
    value: 100,
    cap: 800,
  });

  assert.equal(result.discount, 800);
  assert.equal(result.laborNet, 1300);
});

test("deriveLoyaltyPricing: legacy rewardValue-only free_labor defaults to amount", () => {
  const pricing = deriveLoyaltyPricing({
    partsSubtotal: 0,
    laborChargesOriginal: 2100,
    appliedRewards: [{ ruleId: "rule-1", rewardType: "free_labor", rewardValue: 500 }],
  });

  assert.equal(pricing.loyaltyLaborDiscount, 500);
  assert.equal(pricing.laborChargesNet, 1600);
});

test("computeLaborDiscount: legacy rewardValue 0 gives zero discount", () => {
  const discount = computeLaborDiscount({
    laborChargesOriginal: 2100,
    reward: { ruleId: "rule-1", rewardType: "free_labor", rewardValue: 0 },
  });

  assert.equal(discount, 0);
});

test("computeTotals clamps grand total and labor net to non-negative", () => {
  const totals = computeTotals({
    partsSubtotal: -100,
    laborChargesOriginal: 400,
    laborDiscount: 800,
  });

  assert.equal(totals.subtotalParts, 0);
  assert.equal(totals.loyaltyLaborDiscount, 400);
  assert.equal(totals.laborChargesNet, 0);
  assert.equal(totals.grandTotal, 0);
});
