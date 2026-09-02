import mongoose from "mongoose";
import LoyaltyRule from "../models/LoyaltyRule.js";
import CustomerLoyalty from "../models/CustomerLoyalty.js";
import JobCard from "../models/JobCard.js";
import Invoice from "../models/Invoice.js";
import {
  buildSuppressionKey,
  computeVisitMilestone,
  parseServiceTypeIds,
  ruleAppliesToSelectedServices,
} from "../utils/loyaltyMilestone.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const LOYALTY_BASE_FILTER = { vehicleId: null, serviceTypeId: null };

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const normalizeTriggerType = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

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

const normalizeOptionalAmount = (value) => {
  if (!hasValue(value)) {
    return null;
  }
  const parsed = toNumber(value);
  return parsed === null ? null : parsed;
};

const toBoolean = (value, fallback) => {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return Boolean(value);
};

const buildRuleRewardFields = (input = {}) => {
  const rewardType = normalizeRewardType(input.rewardType);
  const rewardValueRaw = toNumber(input.rewardValue);

  if (rewardType === "free_labor") {
    const rewardDiscountMode = normalizeDiscountMode(input.rewardDiscountMode) || "AMOUNT";
    const resolvedDiscountValueRaw =
      rewardDiscountMode === "FULL"
        ? 0
        : hasValue(input.rewardDiscountValue)
          ? toNumber(input.rewardDiscountValue)
          : rewardValueRaw;

    if (resolvedDiscountValueRaw === null || resolvedDiscountValueRaw < 0) {
      return {
        error:
          rewardDiscountMode === "PERCENT"
            ? "Discount percent must be a number between 0 and 100"
            : "Discount amount must be a number greater than or equal to 0",
      };
    }

    if (
      rewardDiscountMode === "PERCENT" &&
      (resolvedDiscountValueRaw < 0 || resolvedDiscountValueRaw > 100)
    ) {
      return {
        error: "Discount percent must be a number between 0 and 100",
      };
    }

    const rewardDiscountCap = normalizeOptionalAmount(input.rewardDiscountCap);
    if (hasValue(input.rewardDiscountCap) && rewardDiscountCap === null) {
      return { error: "Discount cap must be a number greater than or equal to 0" };
    }
    if (rewardDiscountCap !== null && rewardDiscountCap < 0) {
      return { error: "Discount cap must be a number greater than or equal to 0" };
    }

    return {
      rewardValue: resolvedDiscountValueRaw,
      rewardDiscountMode,
      rewardDiscountValue: resolvedDiscountValueRaw,
      rewardDiscountCap,
    };
  }

  if (rewardValueRaw === null || rewardValueRaw < 0) {
    return {
      error: "Reward value must be a number greater than or equal to 0",
    };
  }

  return {
    rewardValue: rewardValueRaw,
    rewardDiscountMode: null,
    rewardDiscountValue: null,
    rewardDiscountCap: null,
  };
};

const buildRulePayload = (input = {}, defaults = {}) => {
  const name = String(input.name || "").trim();
  const triggerType = normalizeTriggerType(input.triggerType);
  const rewardType = normalizeRewardType(input.rewardType);
  const triggerValue = toNumber(input.triggerValue);

  if (!name) {
    return { error: "Rule name is required" };
  }
  if (!triggerType) {
    return { error: "Trigger type is required" };
  }
  if (!rewardType) {
    return { error: "Reward type is required" };
  }
  if (triggerValue === null || triggerValue < 1) {
    return {
      error: "Trigger value must be a number greater than or equal to 1",
    };
  }

  const rewardFields = buildRuleRewardFields({
    ...input,
    rewardType,
  });
  if (rewardFields.error) {
    return rewardFields;
  }

  return {
    payload: {
      name,
      description: hasValue(input.description) ? String(input.description).trim() : "",
      serviceTypeId: hasValue(input.serviceTypeId) ? input.serviceTypeId : null,
      triggerType,
      triggerValue,
      rewardType,
      rewardValue: rewardFields.rewardValue,
      rewardDiscountMode: rewardFields.rewardDiscountMode,
      rewardDiscountValue: rewardFields.rewardDiscountValue,
      rewardDiscountCap: rewardFields.rewardDiscountCap,
      rewardServiceTypeId: hasValue(input.rewardServiceTypeId)
        ? input.rewardServiceTypeId
        : null,
      isActive: toBoolean(input.isActive, defaults.isActive ?? true),
    },
  };
};

const appendRewardDiscountFields = (source = {}) => ({
  rewardDiscountMode: normalizeDiscountMode(source.rewardDiscountMode),
  rewardDiscountValue: hasValue(source.rewardDiscountValue)
    ? toNumber(source.rewardDiscountValue)
    : null,
  rewardDiscountCap: hasValue(source.rewardDiscountCap)
    ? toNumber(source.rewardDiscountCap)
    : null,
});

const getOrCreateBaseCustomerLoyalty = async (customerId) => {
  let loyalty = await CustomerLoyalty.findOne({
    customerId,
    ...LOYALTY_BASE_FILTER,
  });

  if (!loyalty) {
    loyalty = await CustomerLoyalty.create({
      customerId,
      ...LOYALTY_BASE_FILTER,
      firstVisitDate: new Date(),
    });
  }

  return loyalty;
};

const toMilestoneNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
};

const normalizeRewardPayload = (rule, milestoneNumber) => ({
  ruleId: rule._id,
  ruleName: rule.name,
  rewardType: rule.rewardType,
  rewardValue: rule.rewardValue,
  ...appendRewardDiscountFields(rule),
  rewardServiceTypeId: rule.rewardServiceTypeId || null,
  earnedAt: new Date(),
  earnedDate: new Date(),
  milestoneNumber,
});

// ============ LOYALTY RULES ============

export const listLoyaltyRules = async (req, res, next) => {
  try {
    const { active } = req.query;
    const filter = {};
    if (active !== undefined) {
      filter.isActive = active === "true";
    }
    const rules = await LoyaltyRule.find(filter)
      .populate("serviceTypeId", "name")
      .populate("rewardServiceTypeId", "name")
      .sort({ createdAt: -1 });
    return res.json(rules);
  } catch (error) {
    return next(error);
  }
};

export const createLoyaltyRule = async (req, res, next) => {
  try {
    const normalized = buildRulePayload(req.body, { isActive: true });
    if (normalized.error) {
      return res.status(400).json({ message: normalized.error });
    }

    const rule = await LoyaltyRule.create(normalized.payload);

    return res.status(201).json(rule);
  } catch (error) {
    return next(error);
  }
};

export const updateLoyaltyRule = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid loyalty rule ID" });
    }

    const existingRule = await LoyaltyRule.findById(id);
    if (!existingRule) {
      return res.status(404).json({ message: "Loyalty rule not found" });
    }

    const mergedInput = {
      ...existingRule.toObject(),
      ...req.body,
    };

    const normalized = buildRulePayload(mergedInput, {
      isActive: existingRule.isActive !== false,
    });
    if (normalized.error) {
      return res.status(400).json({ message: normalized.error });
    }

    const rule = await LoyaltyRule.findByIdAndUpdate(id, normalized.payload, {
      new: true,
      runValidators: true,
    });

    return res.json(rule);
  } catch (error) {
    return next(error);
  }
};

export const deleteLoyaltyRule = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid loyalty rule ID" });
    }

    const rule = await LoyaltyRule.findByIdAndDelete(id);
    if (!rule) {
      return res.status(404).json({ message: "Loyalty rule not found" });
    }

    return res.json({ message: "Loyalty rule deleted" });
  } catch (error) {
    return next(error);
  }
};

// ============ CUSTOMER LOYALTY ============

export const getCustomerLoyalty = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    if (!isValidId(customerId)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    // Get all loyalty records for this customer
    const loyaltyRecords = await CustomerLoyalty.find({ customerId })
      .populate("serviceTypeId", "name")
      .populate("vehicleId", "vehicleNumber")
      .populate("availableRewards.ruleId", "name")
      .populate("availableRewards.rewardServiceTypeId", "name")
      .populate("redeemedRewards.ruleId", "name");

    // Calculate aggregate stats
    const totalVisits = loyaltyRecords.reduce(
      (sum, record) => sum + record.visitCount,
      0
    );
    const totalSpent = loyaltyRecords.reduce(
      (sum, record) => sum + record.totalSpent,
      0
    );
    const availableRewardsCount = loyaltyRecords.reduce(
      (sum, record) => sum + record.availableRewards.length,
      0
    );

    return res.json({
      customerId,
      totalVisits,
      totalSpent,
      availableRewardsCount,
      loyaltyRecords,
    });
  } catch (error) {
    return next(error);
  }
};

export const previewJobCardRewards = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const selectedServiceTypeIds = parseServiceTypeIds(req.query.serviceTypeIds);

    if (!isValidId(customerId)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    const activeVisitRules = await LoyaltyRule.find({
      isActive: true,
      triggerType: "visit_count",
    })
      .populate("serviceTypeId", "name")
      .populate("rewardServiceTypeId", "name");

    if (selectedServiceTypeIds.length === 0 || activeVisitRules.length === 0) {
      return res.json({
        shouldShowPopup: false,
        rewardsAvailable: [],
        ruleEvaluations: [],
        suppressionKeys: [],
      });
    }

    let loyalty = await getOrCreateBaseCustomerLoyalty(customerId);
    const customerIdStr = String(customerId);
    const ruleEvaluations = [];
    const rewardsAvailable = [];

    for (const rule of activeVisitRules) {
      const scopedServiceTypeId = rule.serviceTypeId?._id || rule.serviceTypeId || null;
      const applies = ruleAppliesToSelectedServices(
        scopedServiceTypeId,
        selectedServiceTypeIds
      );

      const evaluation = {
        ruleId: rule._id,
        ruleName: rule.name,
        serviceTypeId: scopedServiceTypeId || null,
        triggerValue: rule.triggerValue,
        priorCompletedQualifyingVisits: 0,
        nextVisitNumber: 1,
        milestoneInterval: Number(rule.triggerValue) + 1,
        milestoneNumber: null,
        qualifies: false,
        rewardStatus: "not_applicable",
      };

      if (!applies) {
        ruleEvaluations.push(evaluation);
        continue;
      }

      const countFilter = {
        $or: [{ customerId: customerIdStr }, { ownerId: customerIdStr }],
        status: { $in: ["COMPLETED", "CLOSED"] },
      };

      if (scopedServiceTypeId) {
        countFilter["services.serviceType"] = String(scopedServiceTypeId);
      }

      const priorCompletedQualifyingVisits = await JobCard.countDocuments(
        countFilter
      );
      const milestone = computeVisitMilestone(
        priorCompletedQualifyingVisits,
        rule.triggerValue
      );

      evaluation.priorCompletedQualifyingVisits =
        milestone.priorCompletedQualifyingVisits;
      evaluation.nextVisitNumber = milestone.nextVisitNumber;
      evaluation.milestoneInterval = milestone.milestoneInterval;
      evaluation.milestoneNumber = milestone.milestoneNumber;
      evaluation.qualifies = milestone.qualifies;

      if (!milestone.qualifies || !milestone.milestoneNumber) {
        evaluation.rewardStatus = "not_qualified";
        ruleEvaluations.push(evaluation);
        continue;
      }

      const milestoneNumber = milestone.milestoneNumber;
      const existingAvailable = (loyalty.availableRewards || []).find(
        (reward) =>
          String(reward.ruleId) === String(rule._id) &&
          toMilestoneNumber(reward.milestoneNumber) === milestoneNumber
      );

      if (existingAvailable) {
        evaluation.rewardStatus = "existing_available";
        rewardsAvailable.push({
          rewardId: existingAvailable._id,
          ruleId: rule._id,
          ruleName: existingAvailable.ruleName || rule.name,
          rewardType: existingAvailable.rewardType || rule.rewardType,
          rewardValue: existingAvailable.rewardValue ?? rule.rewardValue,
          ...appendRewardDiscountFields({
            rewardDiscountMode:
              existingAvailable.rewardDiscountMode ?? rule.rewardDiscountMode,
            rewardDiscountValue:
              existingAvailable.rewardDiscountValue ?? rule.rewardDiscountValue,
            rewardDiscountCap:
              existingAvailable.rewardDiscountCap ?? rule.rewardDiscountCap,
          }),
          rewardServiceTypeId:
            existingAvailable.rewardServiceTypeId || rule.rewardServiceTypeId,
          milestoneNumber,
          suppressionKey: buildSuppressionKey(rule._id, milestoneNumber),
        });
        ruleEvaluations.push(evaluation);
        continue;
      }

      const existingRedeemed = (loyalty.redeemedRewards || []).find(
        (reward) =>
          String(reward.ruleId) === String(rule._id) &&
          toMilestoneNumber(reward.milestoneNumber) === milestoneNumber
      );

      if (existingRedeemed) {
        evaluation.rewardStatus = "already_redeemed";
        ruleEvaluations.push(evaluation);
        continue;
      }

      const updateFilter = {
        _id: loyalty._id,
        availableRewards: {
          $not: {
            $elemMatch: { ruleId: rule._id, milestoneNumber },
          },
        },
        redeemedRewards: {
          $not: {
            $elemMatch: { ruleId: rule._id, milestoneNumber },
          },
        },
      };

      const updated = await CustomerLoyalty.findOneAndUpdate(
        updateFilter,
        {
          $push: {
            availableRewards: normalizeRewardPayload(rule, milestoneNumber),
          },
        },
        { new: true }
      );

      if (updated) {
        loyalty = updated;
        const createdReward = loyalty.availableRewards.find(
          (reward) =>
            String(reward.ruleId) === String(rule._id) &&
            toMilestoneNumber(reward.milestoneNumber) === milestoneNumber
        );

        evaluation.rewardStatus = "created_now";
        if (createdReward) {
          rewardsAvailable.push({
            rewardId: createdReward._id,
            ruleId: rule._id,
            ruleName: createdReward.ruleName || rule.name,
            rewardType: createdReward.rewardType || rule.rewardType,
            rewardValue: createdReward.rewardValue ?? rule.rewardValue,
            ...appendRewardDiscountFields({
              rewardDiscountMode:
                createdReward.rewardDiscountMode ?? rule.rewardDiscountMode,
              rewardDiscountValue:
                createdReward.rewardDiscountValue ?? rule.rewardDiscountValue,
              rewardDiscountCap:
                createdReward.rewardDiscountCap ?? rule.rewardDiscountCap,
            }),
            rewardServiceTypeId:
              createdReward.rewardServiceTypeId || rule.rewardServiceTypeId,
            milestoneNumber,
            suppressionKey: buildSuppressionKey(rule._id, milestoneNumber),
          });
        }
        ruleEvaluations.push(evaluation);
        continue;
      }

      loyalty = await CustomerLoyalty.findById(loyalty._id);
      const concurrentAvailable = (loyalty?.availableRewards || []).find(
        (reward) =>
          String(reward.ruleId) === String(rule._id) &&
          toMilestoneNumber(reward.milestoneNumber) === milestoneNumber
      );
      if (concurrentAvailable) {
        evaluation.rewardStatus = "existing_available";
        rewardsAvailable.push({
          rewardId: concurrentAvailable._id,
          ruleId: rule._id,
          ruleName: concurrentAvailable.ruleName || rule.name,
          rewardType: concurrentAvailable.rewardType || rule.rewardType,
          rewardValue: concurrentAvailable.rewardValue ?? rule.rewardValue,
          ...appendRewardDiscountFields({
            rewardDiscountMode:
              concurrentAvailable.rewardDiscountMode ?? rule.rewardDiscountMode,
            rewardDiscountValue:
              concurrentAvailable.rewardDiscountValue ?? rule.rewardDiscountValue,
            rewardDiscountCap:
              concurrentAvailable.rewardDiscountCap ?? rule.rewardDiscountCap,
          }),
          rewardServiceTypeId:
            concurrentAvailable.rewardServiceTypeId || rule.rewardServiceTypeId,
          milestoneNumber,
          suppressionKey: buildSuppressionKey(rule._id, milestoneNumber),
        });
      } else {
        const concurrentRedeemed = (loyalty?.redeemedRewards || []).find(
          (reward) =>
            String(reward.ruleId) === String(rule._id) &&
            toMilestoneNumber(reward.milestoneNumber) === milestoneNumber
        );
        evaluation.rewardStatus = concurrentRedeemed
          ? "already_redeemed"
          : "not_qualified";
      }

      ruleEvaluations.push(evaluation);
    }

    const suppressionKeys = [
      ...new Set(
        rewardsAvailable
          .map((reward) => reward.suppressionKey)
          .filter(Boolean)
      ),
    ];

    return res.json({
      shouldShowPopup: rewardsAvailable.length > 0,
      rewardsAvailable,
      ruleEvaluations,
      suppressionKeys,
    });
  } catch (error) {
    return next(error);
  }
};

export const checkEligibleRewards = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { vehicleId, serviceTypeId } = req.query;

    if (!isValidId(customerId)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    // Get customer's loyalty stats
    const filter = { customerId };
    if (vehicleId) filter.vehicleId = vehicleId;
    if (serviceTypeId) filter.serviceTypeId = serviceTypeId;

    let loyalty = await CustomerLoyalty.findOne(filter);

    // Fallback: most loyalty stats are tracked in a customer-level record
    // (vehicleId/serviceTypeId are null). If a scoped query misses, use that.
    if (!loyalty && (vehicleId || serviceTypeId)) {
      loyalty = await CustomerLoyalty.findOne({
        customerId,
        vehicleId: null,
        serviceTypeId: null,
      });
    }

    if (!loyalty) {
      // No loyalty record yet — return all active rules as in-progress with 0 progress
      const activeRules = await LoyaltyRule.find({ isActive: true })
        .populate("serviceTypeId", "name")
        .populate("rewardServiceTypeId", "name");

      const inProgressRewards = activeRules.map((rule) => ({
        ...rule.toObject(),
        currentProgress: 0,
        triggerValue: rule.triggerValue,
        progressPercentage: 0,
      }));

      return res.json({
        eligibleRewards: [],
        availableRewards: [],
        inProgressRewards,
        loyaltyStats: { visitCount: 0, totalSpent: 0, serviceTypeCount: [] },
      });
    }

    // Get active loyalty rules
    const activeRules = await LoyaltyRule.find({ isActive: true })
      .populate("serviceTypeId", "name")
      .populate("rewardServiceTypeId", "name");

    // For reusable rules, remove any stale availableRewards.
    // The loop below will re-add them ONLY if the real count confirms eligibility.
    const reusableRuleIds = new Set(
      activeRules
        .filter((r) => r.isReusable && r.triggerType !== "visit_count")
        .map((r) => String(r._id))
    );
    const beforeCount = loyalty.availableRewards.length;
    loyalty.availableRewards = loyalty.availableRewards.filter(
      (reward) => !reusableRuleIds.has(String(reward.ruleId))
    );

    // Check each rule: eligible, in-progress, or already redeemed
    const eligibleRewards = [];
    const inProgressRewards = [];
    let needsSave = loyalty.availableRewards.length !== beforeCount;

    for (const rule of activeRules) {
      const ruleServiceTypeId = rule.serviceTypeId?._id || rule.serviceTypeId;
      let currentProgress = 0;

      // For REUSABLE rules that have been redeemed before, compute the
      // real count from finalized invoices since the last redemption.
      // This makes the system self-healing against stale stored counts.
      const isReusableWithHistory =
        rule.isReusable &&
        loyalty.redeemedRewards.some(
          (r) => String(r.ruleId) === String(rule._id)
        );

      if (isReusableWithHistory) {
        // Find the most recent redemption for this rule
        const lastRedemption = loyalty.redeemedRewards
          .filter((r) => String(r.ruleId) === String(rule._id))
          .sort(
            (a, b) => new Date(b.redeemedDate) - new Date(a.redeemedDate)
          )[0];

        // Build query: finalized invoices AFTER last redemption,
        // excluding the redemption visit's own invoice
        const invoiceQuery = {
          customer: customerId,
          status: "FINALIZED",
          createdAt: { $gt: lastRedemption.redeemedDate },
        };
        if (lastRedemption.jobCardId) {
          invoiceQuery.jobCard = { $ne: lastRedemption.jobCardId };
        }

        switch (rule.triggerType) {
          case "visit_count":
            currentProgress = await Invoice.countDocuments(invoiceQuery);
            break;
          case "spend_amount":
          case "spending_amount": {
            const spendInvoices = await Invoice.find(invoiceQuery).select(
              "totalAmount"
            );
            currentProgress = spendInvoices.reduce(
              (sum, inv) => sum + (inv.totalAmount || 0),
              0
            );
            break;
          }
          case "service_count": {
            if (ruleServiceTypeId) {
              const svcInvoices = await Invoice.find(invoiceQuery).populate(
                "jobCard",
                "services"
              );
              currentProgress = svcInvoices.filter((inv) =>
                inv.jobCard?.services?.some(
                  (s) =>
                    String(s.serviceType) === String(ruleServiceTypeId)
                )
              ).length;
            } else {
              currentProgress = await Invoice.countDocuments(invoiceQuery);
            }
            break;
          }
        }

        // Auto-heal the stored count if it drifted
        if (rule.triggerType === "visit_count") {
          if (loyalty.visitCount !== currentProgress) {
            loyalty.visitCount = currentProgress;
            needsSave = true;
          }
        } else if (
          rule.triggerType === "service_count" &&
          ruleServiceTypeId
        ) {
          const stcIndex = (loyalty.serviceTypeCount || []).findIndex(
            (stc) =>
              stc.serviceTypeId &&
              stc.serviceTypeId.toString() === ruleServiceTypeId.toString()
          );
          if (stcIndex >= 0) {
            if (loyalty.serviceTypeCount[stcIndex].count !== currentProgress) {
              loyalty.serviceTypeCount[stcIndex].count = currentProgress;
              needsSave = true;
            }
          }
        } else if (
          rule.triggerType === "spending_amount" ||
          rule.triggerType === "spend_amount"
        ) {
          if (loyalty.totalSpent !== currentProgress) {
            loyalty.totalSpent = currentProgress;
            needsSave = true;
          }
        }
      } else {
        // Non-reusable rules or first-cycle reusable rules: use stored counts
        switch (rule.triggerType) {
          case "visit_count":
            currentProgress = loyalty.visitCount;
            break;
          case "spend_amount":
          case "spending_amount":
            currentProgress = loyalty.totalSpent;
            break;
          case "service_count":
            if (ruleServiceTypeId) {
              const stcEntry = (loyalty.serviceTypeCount || []).find(
                (stc) =>
                  stc.serviceTypeId &&
                  stc.serviceTypeId.toString() ===
                    ruleServiceTypeId.toString()
              );
              currentProgress = stcEntry?.count || 0;
            } else {
              currentProgress = loyalty.visitCount;
            }
            break;
        }
      }

      const isEligible = currentProgress >= rule.triggerValue;

      // Check if reward already in availableRewards
      const alreadyHasReward = loyalty.availableRewards.some(
        (reward) => String(reward.ruleId) === String(rule._id)
      );

      // Check if already redeemed (for non-reusable)
      const alreadyRedeemed =
        !rule.isReusable &&
        loyalty.redeemedRewards.some(
          (reward) => String(reward.ruleId) === String(rule._id)
        );

      // visit_count rewards are generated by the milestone preview endpoint.
      const shouldAutoCreateReward = rule.triggerType !== "visit_count";

      if (
        shouldAutoCreateReward &&
        isEligible &&
        !alreadyHasReward &&
        !alreadyRedeemed
      ) {
        // Promote eligible reward to availableRewards in DB immediately
        let expiryDate = null;
        if (rule.validityDays) {
          expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + rule.validityDays);
        }

        loyalty.availableRewards.push({
          ruleId: rule._id,
          ruleName: rule.name,
          rewardType: rule.rewardType,
          rewardValue: rule.rewardValue,
          ...appendRewardDiscountFields(rule),
          rewardServiceTypeId: rule.rewardServiceTypeId,
          earnedDate: new Date(),
          expiryDate,
        });

        eligibleRewards.push(rule);
        needsSave = true;
      } else if (!isEligible && !alreadyHasReward && !alreadyRedeemed) {
        // Customer is working toward this reward
        const progressPercentage = Math.min(
          (currentProgress / rule.triggerValue) * 100,
          100
        );
        inProgressRewards.push({
          ...rule.toObject(),
          currentProgress,
          progressPercentage,
        });
      }
    }

    // Save if anything changed (new rewards or healed counts)
    if (needsSave) {
      await loyalty.save();
    }

    return res.json({
      eligibleRewards,
      availableRewards: loyalty.availableRewards,
      inProgressRewards,
      loyaltyStats: {
        visitCount: loyalty.visitCount,
        totalSpent: loyalty.totalSpent,
        serviceTypeCount: loyalty.serviceTypeCount || [],
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const redeemReward = async (req, res, next) => {
  try {
    const { customerId, rewardId, jobCardId, jobCardNo } = req.body;

    if (!customerId || !rewardId || !jobCardId) {
      return res.status(400).json({
        message: "Customer ID, reward ID, and job card ID are required",
      });
    }

    // Find the loyalty record with this reward
    const loyalty = await CustomerLoyalty.findOne({
      customerId,
      "availableRewards._id": rewardId,
    });

    if (!loyalty) {
      return res.status(404).json({
        message: "Reward not found or already redeemed",
      });
    }

    // Find the reward
    const reward = loyalty.availableRewards.find(
      (r) => String(r._id) === String(rewardId)
    );

    if (!reward) {
      return res.status(404).json({ message: "Reward not found" });
    }

    // Look up the loyalty rule to check if reusable
    const rule = await LoyaltyRule.findById(reward.ruleId);

    // Move reward from available to redeemed
    loyalty.availableRewards = loyalty.availableRewards.filter(
      (r) => String(r._id) !== String(rewardId)
    );

    loyalty.redeemedRewards.push({
      ruleId: reward.ruleId,
      ruleName: reward.ruleName,
      rewardType: reward.rewardType,
      rewardValue: reward.rewardValue,
      ...appendRewardDiscountFields(reward),
      milestoneNumber: toMilestoneNumber(reward.milestoneNumber),
      redeemedAt: new Date(),
      redeemedDate: new Date(),
      jobCardId,
      jobCardNo,
    });

    // Reset count for reusable rewards so the cycle restarts
    if (rule && rule.isReusable) {
      switch (rule.triggerType) {
        case "visit_count":
          loyalty.visitCount = 0;
          break;
        case "service_count":
          if (rule.serviceTypeId) {
            const stcIndex = loyalty.serviceTypeCount.findIndex(
              (stc) =>
                stc.serviceTypeId &&
                stc.serviceTypeId.toString() === rule.serviceTypeId.toString()
            );
            if (stcIndex >= 0) {
              loyalty.serviceTypeCount[stcIndex].count = 0;
            }
          }
          break;
        case "spend_amount":
        case "spending_amount":
          loyalty.totalSpent = 0;
          break;
      }
    }

    await loyalty.save();

    return res.json({
      message: "Reward redeemed successfully",
      redeemedAt: new Date().toISOString(),
      countReset: rule?.isReusable || false,
      reward: {
        rewardType: reward.rewardType,
        rewardValue: reward.rewardValue,
        ...appendRewardDiscountFields(reward),
      },
    });
  } catch (error) {
    return next(error);
  }
};

// Manually recalculate loyalty for a customer (for testing/fixing)
export const recalculateLoyalty = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    if (!isValidId(customerId)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    // Get all finalized invoices for this customer
    const invoices = await Invoice.find({
      customer: customerId,
      status: "FINALIZED",
    }).populate("jobCard");

    console.log(`Found ${invoices.length} finalized invoices for customer`);

    // Reset or create loyalty record
    let loyalty = await CustomerLoyalty.findOne({
      customerId,
      vehicleId: null,
      serviceTypeId: null,
    });

    if (!loyalty) {
      loyalty = new CustomerLoyalty({
        customerId,
        firstVisitDate: new Date(),
      });
    }

    // Reset stats
    loyalty.visitCount = 0;
    loyalty.totalSpent = 0;
    loyalty.serviceTypeCount = [];
    loyalty.availableRewards = [];

    // Build a set of job card IDs that redeemed rewards (from redeemedRewards history)
    // This serves as a fallback for old job cards that may not have appliedRewards saved
    const redeemedJobCardIds = new Set();
    const redeemedJobCardRules = {};
    if (loyalty.redeemedRewards && loyalty.redeemedRewards.length > 0) {
      for (const redeemed of loyalty.redeemedRewards) {
        if (redeemed.jobCardId) {
          const jcId = String(redeemed.jobCardId);
          redeemedJobCardIds.add(jcId);
          if (!redeemedJobCardRules[jcId]) {
            redeemedJobCardRules[jcId] = [];
          }
          redeemedJobCardRules[jcId].push(redeemed.ruleId);
        }
      }
    }

    // Recalculate from all invoices, properly simulating the reusable reward cycle
    // Sort invoices chronologically to replay in correct order
    invoices.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    for (const invoice of invoices) {
      // Check if this job card redeemed a reusable reward
      let resetVisitCount = false;
      let resetSpending = false;
      const resetServiceTypeIds = new Set();

      // Check from job card's appliedRewards first
      const jobCardId = invoice.jobCard ? String(invoice.jobCard._id) : null;
      const appliedRewardsList = invoice.jobCard?.appliedRewards || [];

      // Also check from redeemedRewards history (fallback for old job cards)
      const ruleIdsToCheck = [
        ...appliedRewardsList.map((a) => a.ruleId).filter(Boolean),
        ...(jobCardId && redeemedJobCardRules[jobCardId] ? redeemedJobCardRules[jobCardId] : []),
      ];

      // Deduplicate rule IDs
      const uniqueRuleIds = [...new Set(ruleIdsToCheck.map(String))];

      for (const ruleId of uniqueRuleIds) {
        const rule = await LoyaltyRule.findById(ruleId);
        if (rule && rule.isReusable) {
          switch (rule.triggerType) {
            case "visit_count":
              resetVisitCount = true;
              break;
            case "spend_amount":
            case "spending_amount":
              resetSpending = true;
              break;
            case "service_count":
              if (rule.serviceTypeId) {
                resetServiceTypeIds.add(rule.serviceTypeId.toString());
              }
              break;
          }
        }
      }

      if (resetVisitCount) {
        // This visit redeemed a visit-count reward: RESET count to 0, don't increment
        loyalty.visitCount = 0;
      } else {
        loyalty.visitCount += 1;
      }

      if (resetSpending) {
        loyalty.totalSpent = 0;
      } else {
        loyalty.totalSpent += invoice.totalAmount || 0;
      }

      if (invoice.jobCard && invoice.jobCard.services) {
        for (const service of invoice.jobCard.services) {
          if (service.serviceType) {
            const stId = service.serviceType.toString();

            if (resetServiceTypeIds.has(stId)) {
              // This visit redeemed a service-count reward: RESET this service count to 0
              const existingIndex = loyalty.serviceTypeCount.findIndex(
                (stc) =>
                  stc.serviceTypeId &&
                  stc.serviceTypeId.toString() === stId
              );
              if (existingIndex >= 0) {
                loyalty.serviceTypeCount[existingIndex].count = 0;
              }
              continue;
            }

            const existingIndex = loyalty.serviceTypeCount.findIndex(
              (stc) =>
                stc.serviceTypeId &&
                stc.serviceTypeId.toString() === stId
            );

            if (existingIndex >= 0) {
              loyalty.serviceTypeCount[existingIndex].count += 1;
            } else {
              loyalty.serviceTypeCount.push({
                serviceTypeId: service.serviceType,
                count: 1,
              });
            }
          }
        }
      }
    }

    if (invoices.length > 0) {
      loyalty.lastVisitDate = new Date();
    }

    await loyalty.save();

    // Check for newly eligible rewards
    const activeRules = await LoyaltyRule.find({ isActive: true });

    for (const rule of activeRules) {
      if (rule.triggerType === "visit_count") {
        continue;
      }

      let isEligible = false;

      const serviceTypeCounts = {};
      loyalty.serviceTypeCount.forEach((stc) => {
        serviceTypeCounts[stc.serviceTypeId.toString()] = stc.count;
      });

      switch (rule.triggerType) {
        case "visit_count":
          isEligible = loyalty.visitCount >= rule.triggerValue;
          break;
        case "spend_amount":
        case "spending_amount":
          isEligible = loyalty.totalSpent >= rule.triggerValue;
          break;
        case "service_count":
          if (rule.serviceTypeId) {
            const count = serviceTypeCounts[rule.serviceTypeId.toString()] || 0;
            isEligible = count >= rule.triggerValue;
          } else {
            isEligible = loyalty.visitCount >= rule.triggerValue;
          }
          break;
      }

      if (isEligible) {
        const alreadyHasReward = loyalty.availableRewards.some(
          (reward) => String(reward.ruleId) === String(rule._id)
        );

        const alreadyRedeemed =
          !rule.isReusable &&
          loyalty.redeemedRewards.some(
            (reward) => String(reward.ruleId) === String(rule._id)
          );

        if (!alreadyHasReward && !alreadyRedeemed) {
          let expiryDate = null;
          if (rule.validityDays) {
            expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + rule.validityDays);
          }

          loyalty.availableRewards.push({
            ruleId: rule._id,
            ruleName: rule.name,
            rewardType: rule.rewardType,
            rewardValue: rule.rewardValue,
            ...appendRewardDiscountFields(rule),
            rewardServiceTypeId: rule.rewardServiceTypeId,
            earnedDate: new Date(),
            expiryDate: expiryDate,
          });
        }
      }
    }

    await loyalty.save();

    return res.json({
      message: "Loyalty recalculated successfully",
      visitCount: loyalty.visitCount,
      totalSpent: loyalty.totalSpent,
      availableRewards: loyalty.availableRewards.length,
      details: loyalty,
    });
  } catch (error) {
    console.error("Error recalculating loyalty:", error);
    return next(error);
  }
};

// Check and expire old rewards
export const expireOldRewards = async () => {
  try {
    const now = new Date();
    const allLoyalty = await CustomerLoyalty.find({
      "availableRewards.expiryDate": { $lte: now },
    });

    for (const loyalty of allLoyalty) {
      let hasChanges = false;
      loyalty.availableRewards = loyalty.availableRewards.filter((reward) => {
        if (reward.expiryDate && reward.expiryDate <= now) {
          hasChanges = true;
          return false; // Remove expired rewards
        }
        return true;
      });

      if (hasChanges) {
        await loyalty.save();
      }
    }
  } catch (error) {
    console.error("Error expiring rewards:", error);
  }
};

// Helper function to update loyalty stats (called from invoice controller)
export const updateLoyaltyStats = async (
  customerId,
  invoiceAmount,
  jobCardId,
  options = {}
) => {
  try {
    if (!customerId) return;
    const { session = null, invoiceId = null } = options;

    const customerIdObj = mongoose.Types.ObjectId.isValid(customerId)
      ? customerId
      : null;

    if (!customerIdObj) return;

    // Get job card to extract service information
    let jobCard = null;
    if (jobCardId) {
      const jobCardQuery = JobCard.findById(jobCardId);
      if (session) {
        jobCardQuery.session(session);
      }
      jobCard = await jobCardQuery;
    }

    // Find or create loyalty record
    const loyaltyQuery = CustomerLoyalty.findOne({
      customerId: customerIdObj,
      vehicleId: null,
      serviceTypeId: null,
    });
    if (session) {
      loyaltyQuery.session(session);
    }
    let loyalty = await loyaltyQuery;

    if (!loyalty) {
      loyalty = new CustomerLoyalty({
        customerId: customerIdObj,
        firstVisitDate: new Date(),
      });
    }

    // Check if this job card redeemed a reusable reward (so its visit shouldn't count toward next cycle)
    let skipVisitCount = false;
    let skipSpending = false;
    const skipServiceTypeIds = new Set();

    if (jobCard && jobCard.appliedRewards && jobCard.appliedRewards.length > 0) {
      for (const applied of jobCard.appliedRewards) {
        if (applied.ruleId) {
          const appliedMilestone = toMilestoneNumber(applied.milestoneNumber);
          const appliedRewardId = applied.rewardId
            ? String(applied.rewardId)
            : "";

          // Redeem the reward (move from available to redeemed)
          const availIndex = loyalty.availableRewards.findIndex(
            (reward) => {
              if (
                appliedRewardId &&
                reward?._id &&
                String(reward._id) === appliedRewardId
              ) {
                return true;
              }

              if (String(reward.ruleId) !== String(applied.ruleId)) {
                return false;
              }

              if (appliedMilestone !== null) {
                return (
                  toMilestoneNumber(reward.milestoneNumber) === appliedMilestone
                );
              }

              // Legacy fallback for records without milestone metadata.
              return true;
            }
          );

          if (availIndex !== -1) {
            const reward = loyalty.availableRewards[availIndex];
            loyalty.availableRewards.splice(availIndex, 1);
            loyalty.redeemedRewards.push({
              ruleId: reward.ruleId,
              ruleName: reward.ruleName,
              rewardType: reward.rewardType,
              rewardValue: reward.rewardValue,
              ...appendRewardDiscountFields(reward),
              milestoneNumber:
                appliedMilestone ?? toMilestoneNumber(reward.milestoneNumber),
              redeemedAt: new Date(),
              redeemedDate: new Date(),
              jobCardId: jobCard._id,
              jobCardNo: jobCard.jobCardNo,
              invoiceId:
                invoiceId && mongoose.Types.ObjectId.isValid(invoiceId)
                  ? invoiceId
                  : undefined,
            });
          }

          const ruleQuery = LoyaltyRule.findById(applied.ruleId);
          if (session) {
            ruleQuery.session(session);
          }
          const rule = await ruleQuery;
          if (rule && rule.isReusable) {
            switch (rule.triggerType) {
              case "visit_count":
                skipVisitCount = true;
                break;
              case "spend_amount":
              case "spending_amount":
                skipSpending = true;
                break;
              case "service_count":
                if (rule.serviceTypeId) {
                  skipServiceTypeIds.add(rule.serviceTypeId.toString());
                }
                break;
            }
          }
        }
      }
    }

    // Update basic stats (skip if this visit redeemed a reusable visit-count reward)
    if (!skipVisitCount) {
      loyalty.visitCount += 1;
    }
    if (!skipSpending) {
      loyalty.totalSpent += invoiceAmount;
    }
    loyalty.lastVisitDate = new Date();

    if (!loyalty.firstVisitDate) {
      loyalty.firstVisitDate = new Date();
    }

    // Update service type counts if job card has services
    if (jobCard && jobCard.services && Array.isArray(jobCard.services)) {
      for (const service of jobCard.services) {
        if (service.serviceType) {
          // Skip incrementing if this service type's count was reset by a reusable reward
          if (skipServiceTypeIds.has(service.serviceType.toString())) {
            continue;
          }

          const existingIndex = loyalty.serviceTypeCount.findIndex(
            (stc) => stc.serviceTypeId && stc.serviceTypeId.toString() === service.serviceType.toString()
          );

          if (existingIndex >= 0) {
            loyalty.serviceTypeCount[existingIndex].count += 1;
          } else {
            loyalty.serviceTypeCount.push({
              serviceTypeId: service.serviceType,
              count: 1,
            });
          }
        }
      }
    }

    await loyalty.save({ session });

    // Check for newly eligible rewards (only non-reusable or first-cycle reusable).
    // For reusable rules with redemption history, checkEligibleRewards handles
    // eligibility using invoice-counting to avoid stale-count issues.
    const activeRulesQuery = LoyaltyRule.find({ isActive: true });
    if (session) {
      activeRulesQuery.session(session);
    }
    const activeRules = await activeRulesQuery;

    for (const rule of activeRules) {
      // visit_count rewards are generated at draft time by previewJobCardRewards.
      if (rule.triggerType === "visit_count") {
        continue;
      }

      // Skip reusable rules that have been redeemed — their eligibility is
      // determined by checkEligibleRewards using real invoice counts.
      if (
        rule.isReusable &&
        loyalty.redeemedRewards.some(
          (r) => String(r.ruleId) === String(rule._id)
        )
      ) {
        continue;
      }

      let isEligible = false;
      let currentProgress = 0;

      // Calculate service-specific counts
      const serviceTypeCounts = {};
      loyalty.serviceTypeCount.forEach((stc) => {
        serviceTypeCounts[stc.serviceTypeId.toString()] = stc.count;
      });

      switch (rule.triggerType) {
        case "visit_count":
          currentProgress = loyalty.visitCount;
          isEligible = currentProgress >= rule.triggerValue;
          break;
        case "spend_amount":
        case "spending_amount":
          currentProgress = loyalty.totalSpent;
          isEligible = currentProgress >= rule.triggerValue;
          break;
        case "service_count":
          if (rule.serviceTypeId) {
            currentProgress = serviceTypeCounts[rule.serviceTypeId.toString()] || 0;
          } else {
            currentProgress = loyalty.visitCount;
          }
          isEligible = currentProgress >= rule.triggerValue;
          break;
      }

      if (isEligible) {
        // Check if reward already exists
        const alreadyHasReward = loyalty.availableRewards.some(
          (reward) => String(reward.ruleId) === String(rule._id)
        );

        // Check if already redeemed (for non-reusable rewards)
        const alreadyRedeemed =
          !rule.isReusable &&
          loyalty.redeemedRewards.some(
            (reward) => String(reward.ruleId) === String(rule._id)
          );

        if (!alreadyHasReward && !alreadyRedeemed) {
          // Calculate expiry date
          let expiryDate = null;
          if (rule.validityDays) {
            expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + rule.validityDays);
          }

          // Add new reward
          loyalty.availableRewards.push({
            ruleId: rule._id,
            ruleName: rule.name,
            rewardType: rule.rewardType,
            rewardValue: rule.rewardValue,
            ...appendRewardDiscountFields(rule),
            rewardServiceTypeId: rule.rewardServiceTypeId,
            earnedDate: new Date(),
            expiryDate: expiryDate,
          });

          await loyalty.save({ session });
        }
      }
    }

    return loyalty;
  } catch (error) {
    console.error("Error updating loyalty stats:", error);
    throw error;
  }
};
