const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const normalizeRewardType = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const normalizeDiscountMode = (value) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (["PERCENT", "AMOUNT", "FULL"].includes(normalized)) {
    return normalized;
  }
  return null;
};

const toNonNegative = (value) => Math.max(0, toNumber(value));

const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const toOptionalNonNegative = (value) =>
  hasValue(value) ? toNonNegative(value) : null;

const resolveFreeLaborDiscountConfig = (reward = {}) => {
  const mode = normalizeDiscountMode(reward.rewardDiscountMode) || "AMOUNT";
  const fallbackValue = toNonNegative(reward.rewardValue);
  const configuredValue = hasValue(reward.rewardDiscountValue)
    ? toNonNegative(reward.rewardDiscountValue)
    : fallbackValue;

  return {
    mode,
    value: mode === "FULL" ? 0 : configuredValue,
    cap: toOptionalNonNegative(reward.rewardDiscountCap),
  };
};

export const normalizeSelectedReward = (appliedRewards) => {
  if (!Array.isArray(appliedRewards)) {
    return null;
  }

  const firstValid = appliedRewards.find(
    (reward) =>
      reward &&
      (reward.ruleId || reward.rewardId || reward.rewardType || reward.ruleName)
  );

  if (!firstValid) {
    return null;
  }

  const milestoneRaw = firstValid.milestoneNumber;
  const milestoneNumber =
    milestoneRaw === null || milestoneRaw === undefined || milestoneRaw === ""
      ? null
      : Number(milestoneRaw);

  return {
    rewardId: firstValid.rewardId || firstValid._id || null,
    ruleId: firstValid.ruleId || null,
    ruleName: firstValid.ruleName ? String(firstValid.ruleName).trim() : "",
    rewardType: normalizeRewardType(firstValid.rewardType),
    rewardValue: toNonNegative(firstValid.rewardValue),
    rewardDiscountMode: normalizeDiscountMode(firstValid.rewardDiscountMode),
    rewardDiscountValue: toOptionalNonNegative(firstValid.rewardDiscountValue),
    rewardDiscountCap: toOptionalNonNegative(firstValid.rewardDiscountCap),
    milestoneNumber:
      Number.isFinite(milestoneNumber) && milestoneNumber > 0
        ? Math.floor(milestoneNumber)
        : null,
  };
};

export const computeLaborLoyaltyDiscount = ({
  laborOriginal,
  mode,
  value,
  cap,
}) => {
  const safeLabor = toNonNegative(laborOriginal);
  const resolvedMode = normalizeDiscountMode(mode) || "AMOUNT";
  const safeValue = toNonNegative(value);
  const safeCap = toOptionalNonNegative(cap);

  let discount = 0;
  if (resolvedMode === "PERCENT") {
    discount = safeLabor * (safeValue / 100);
  } else if (resolvedMode === "FULL") {
    discount = safeLabor;
  } else {
    discount = safeValue;
  }

  if (safeCap !== null) {
    discount = Math.min(discount, safeCap);
  }

  discount = Math.max(0, Math.min(discount, safeLabor));

  const roundedLaborOriginal = roundCurrency(safeLabor);
  const roundedDiscount = Math.min(
    roundCurrency(discount),
    roundedLaborOriginal
  );
  const laborNet = roundCurrency(
    Math.max(0, roundedLaborOriginal - roundedDiscount)
  );

  return {
    discount: roundedDiscount,
    laborNet,
  };
};

export const computeLaborDiscount = ({ laborChargesOriginal, reward }) => {
  const labor = toNonNegative(laborChargesOriginal);
  if (!reward) {
    return 0;
  }

  const rewardType = normalizeRewardType(reward.rewardType);
  if (rewardType !== "free_labor") {
    return 0;
  }

  const config = resolveFreeLaborDiscountConfig(reward);
  const result = computeLaborLoyaltyDiscount({
    laborOriginal: labor,
    mode: config.mode,
    value: config.value,
    cap: config.cap,
  });
  return result.discount;
};

export const computeTotals = ({
  partsSubtotal,
  laborChargesOriginal,
  laborDiscount,
}) => {
  const safePartsSubtotal = roundCurrency(toNonNegative(partsSubtotal));
  const safeLaborOriginal = roundCurrency(toNonNegative(laborChargesOriginal));
  const boundedLaborDiscount = Math.max(
    0,
    Math.min(toNonNegative(laborDiscount), safeLaborOriginal)
  );
  const safeLaborDiscount = Math.min(
    roundCurrency(boundedLaborDiscount),
    safeLaborOriginal
  );
  const laborChargesNet = roundCurrency(
    Math.max(0, safeLaborOriginal - safeLaborDiscount)
  );
  const subtotal = roundCurrency(safePartsSubtotal + safeLaborOriginal);
  const grandTotal = roundCurrency(
    Math.max(0, safePartsSubtotal + laborChargesNet)
  );

  return {
    subtotalParts: safePartsSubtotal,
    laborChargesOriginal: safeLaborOriginal,
    loyaltyLaborDiscount: safeLaborDiscount,
    laborChargesNet,
    subtotal,
    grandTotal,
  };
};

export const deriveLoyaltyPricing = ({
  partsSubtotal,
  laborChargesOriginal,
  appliedRewards,
}) => {
  const selectedReward = normalizeSelectedReward(appliedRewards);
  const loyaltyLaborDiscount = computeLaborDiscount({
    laborChargesOriginal,
    reward: selectedReward,
  });

  const totals = computeTotals({
    partsSubtotal,
    laborChargesOriginal,
    laborDiscount: loyaltyLaborDiscount,
  });

  return {
    selectedReward,
    ...totals,
  };
};
