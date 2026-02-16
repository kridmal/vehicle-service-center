const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const toNonNegative = (value) => Math.max(0, toNumber(value));

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

const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const toOptionalNonNegative = (value) =>
  hasValue(value) ? toNonNegative(value) : null;

const formatAmountLabel = (value) => `LKR ${toNonNegative(value).toFixed(2)}`;

const formatPercentLabel = (value) => {
  const amount = toNonNegative(value);
  if (Number.isInteger(amount)) {
    return `${amount}%`;
  }
  return `${amount.toFixed(2).replace(/\.?0+$/, "")}%`;
};

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

export const normalizeSingleReward = (appliedRewards) => {
  if (!Array.isArray(appliedRewards) || appliedRewards.length === 0) {
    return null;
  }

  const firstReward = appliedRewards.find(
    (reward) =>
      reward &&
      (reward.ruleId || reward.rewardId || reward.rewardType || reward.ruleName)
  );

  if (!firstReward) {
    return null;
  }

  const milestoneRaw = firstReward.milestoneNumber;
  const milestoneNumber =
    milestoneRaw === null || milestoneRaw === undefined || milestoneRaw === ""
      ? null
      : Number(milestoneRaw);

  return {
    rewardId: firstReward.rewardId || firstReward._id || null,
    ruleId: firstReward.ruleId || null,
    ruleName: firstReward.ruleName || "Loyalty Reward",
    rewardType: normalizeRewardType(firstReward.rewardType),
    rewardValue: toNonNegative(firstReward.rewardValue),
    rewardDiscountMode: normalizeDiscountMode(firstReward.rewardDiscountMode),
    rewardDiscountValue: toOptionalNonNegative(firstReward.rewardDiscountValue),
    rewardDiscountCap: toOptionalNonNegative(firstReward.rewardDiscountCap),
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

export const computeFreeLaborDiscount = (laborChargesOriginal, reward) => {
  const labor = toNonNegative(laborChargesOriginal);
  if (!reward || normalizeRewardType(reward.rewardType) !== "free_labor") {
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

export const formatFreeLaborRewardLabel = (reward) => {
  const config = resolveFreeLaborDiscountConfig(reward);
  const baseLabel =
    config.mode === "PERCENT"
      ? formatPercentLabel(config.value)
      : config.mode === "AMOUNT"
        ? formatAmountLabel(config.value)
        : "Full";
  const capLabel =
    config.cap !== null ? `, Cap ${formatAmountLabel(config.cap)}` : "";
  return `Free Labor (${baseLabel}${capLabel})`;
};

export const computeDraftPricing = ({
  partsSubtotal = 0,
  laborChargesOriginal = 0,
  appliedRewards = [],
}) => {
  const selectedReward = normalizeSingleReward(appliedRewards);
  const safePartsSubtotal = toNonNegative(partsSubtotal);
  const safeLaborOriginal = toNonNegative(laborChargesOriginal);
  const loyaltyLaborDiscount = computeFreeLaborDiscount(
    safeLaborOriginal,
    selectedReward
  );
  const laborChargesNet = roundCurrency(
    Math.max(0, safeLaborOriginal - loyaltyLaborDiscount)
  );
  const grandTotal = roundCurrency(Math.max(0, safePartsSubtotal + laborChargesNet));

  return {
    selectedReward,
    subtotalParts: roundCurrency(safePartsSubtotal),
    laborChargesOriginal: roundCurrency(safeLaborOriginal),
    loyaltyLaborDiscount,
    laborChargesNet,
    grandTotal,
  };
};
