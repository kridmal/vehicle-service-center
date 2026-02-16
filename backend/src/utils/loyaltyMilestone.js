const toPositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const floored = Math.floor(parsed);
  return floored > 0 ? floored : 0;
};

export const computeVisitMilestone = (
  priorCompletedQualifyingVisits,
  triggerValue
) => {
  const prior = Math.max(toPositiveInt(priorCompletedQualifyingVisits), 0);
  const trigger = toPositiveInt(triggerValue);
  const nextVisitNumber = prior + 1;
  const milestoneInterval = trigger + 1;
  const qualifies =
    milestoneInterval > 0 && nextVisitNumber % milestoneInterval === 0;

  return {
    priorCompletedQualifyingVisits: prior,
    nextVisitNumber,
    milestoneInterval,
    qualifies,
    milestoneNumber: qualifies ? nextVisitNumber / milestoneInterval : null,
  };
};

export const parseServiceTypeIds = (value) => {
  if (!value) return [];

  const parts = Array.isArray(value) ? value : [value];
  const flattened = parts.flatMap((part) =>
    String(part)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );

  return [...new Set(flattened)];
};

export const ruleAppliesToSelectedServices = (
  ruleServiceTypeId,
  selectedServiceTypeIds
) => {
  if (!Array.isArray(selectedServiceTypeIds) || selectedServiceTypeIds.length === 0) {
    return false;
  }

  // Any Service rule
  if (!ruleServiceTypeId) {
    return true;
  }

  return selectedServiceTypeIds.some(
    (serviceTypeId) => String(serviceTypeId) === String(ruleServiceTypeId)
  );
};

export const buildSuppressionKey = (ruleId, milestoneNumber) =>
  `${String(ruleId)}:${String(milestoneNumber)}`;

