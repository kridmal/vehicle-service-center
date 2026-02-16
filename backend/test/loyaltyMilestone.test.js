import test from "node:test";
import assert from "node:assert/strict";
import {
  computeVisitMilestone,
  ruleAppliesToSelectedServices,
  buildSuppressionKey,
  parseServiceTypeIds,
} from "../src/utils/loyaltyMilestone.js";

test("computeVisitMilestone: triggerValue=2 prior=2 qualifies at next=3", () => {
  const result = computeVisitMilestone(2, 2);
  assert.equal(result.nextVisitNumber, 3);
  assert.equal(result.milestoneInterval, 3);
  assert.equal(result.qualifies, true);
  assert.equal(result.milestoneNumber, 1);
});

test("computeVisitMilestone: triggerValue=2 prior=3 does not qualify at next=4", () => {
  const result = computeVisitMilestone(3, 2);
  assert.equal(result.nextVisitNumber, 4);
  assert.equal(result.milestoneInterval, 3);
  assert.equal(result.qualifies, false);
  assert.equal(result.milestoneNumber, null);
});

test("computeVisitMilestone: triggerValue=2 prior=5 qualifies at next=6", () => {
  const result = computeVisitMilestone(5, 2);
  assert.equal(result.nextVisitNumber, 6);
  assert.equal(result.milestoneInterval, 3);
  assert.equal(result.qualifies, true);
  assert.equal(result.milestoneNumber, 2);
});

test("ruleAppliesToSelectedServices: any-service applies when at least one selected", () => {
  assert.equal(ruleAppliesToSelectedServices(null, ["svc-1"]), true);
  assert.equal(ruleAppliesToSelectedServices(undefined, ["svc-2"]), true);
});

test("ruleAppliesToSelectedServices: specific service requires inclusion", () => {
  assert.equal(
    ruleAppliesToSelectedServices("full-service", ["wash", "full-service"]),
    true
  );
  assert.equal(
    ruleAppliesToSelectedServices("full-service", ["wash", "oil-change"]),
    false
  );
});

test("parseServiceTypeIds + buildSuppressionKey produce stable output", () => {
  const ids = parseServiceTypeIds(["a,b", "c", "a"]);
  assert.deepEqual(ids, ["a", "b", "c"]);
  assert.equal(buildSuppressionKey("rule-1", 2), "rule-1:2");
});

