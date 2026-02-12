import mongoose from "mongoose";
import LoyaltyRule from "../models/LoyaltyRule.js";
import CustomerLoyalty from "../models/CustomerLoyalty.js";
import JobCard from "../models/JobCard.js";
import Invoice from "../models/Invoice.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

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
    const {
      name,
      description,
      serviceTypeId,
      triggerType,
      triggerValue,
      rewardType,
      rewardValue,
      rewardServiceTypeId,
      isActive,
    } = req.body;

    if (!name || !triggerType || !triggerValue || !rewardType || !rewardValue) {
      return res.status(400).json({
        message: "Name, trigger type/value, and reward type/value are required",
      });
    }

    const rule = await LoyaltyRule.create({
      name,
      description,
      serviceTypeId: serviceTypeId || null,
      triggerType,
      triggerValue,
      rewardType,
      rewardValue,
      rewardServiceTypeId: rewardServiceTypeId || null,
      isActive: isActive !== undefined ? isActive : true,
    });

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

    const rule = await LoyaltyRule.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!rule) {
      return res.status(404).json({ message: "Loyalty rule not found" });
    }

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

    const loyalty = await CustomerLoyalty.findOne(filter);

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
      activeRules.filter((r) => r.isReusable).map((r) => String(r._id))
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
        } else if (rule.triggerType === "spending_amount") {
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

      if (isEligible && !alreadyHasReward && !alreadyRedeemed) {
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
      let isEligible = false;

      const serviceTypeCounts = {};
      loyalty.serviceTypeCount.forEach((stc) => {
        serviceTypeCounts[stc.serviceTypeId.toString()] = stc.count;
      });

      switch (rule.triggerType) {
        case "visit_count":
          isEligible = loyalty.visitCount >= rule.triggerValue;
          break;
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
export const updateLoyaltyStats = async (customerId, invoiceAmount, jobCardId) => {
  try {
    if (!customerId) return;

    const customerIdObj = mongoose.Types.ObjectId.isValid(customerId)
      ? customerId
      : null;

    if (!customerIdObj) return;

    // Get job card to extract service information
    let jobCard = null;
    if (jobCardId) {
      jobCard = await JobCard.findById(jobCardId);
    }

    // Find or create loyalty record
    let loyalty = await CustomerLoyalty.findOne({
      customerId: customerIdObj,
      vehicleId: null,
      serviceTypeId: null,
    });

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
          const rule = await LoyaltyRule.findById(applied.ruleId);
          if (rule && rule.isReusable) {
            switch (rule.triggerType) {
              case "visit_count":
                skipVisitCount = true;
                break;
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

    await loyalty.save();

    // Check for newly eligible rewards (only non-reusable or first-cycle reusable).
    // For reusable rules with redemption history, checkEligibleRewards handles
    // eligibility using invoice-counting to avoid stale-count issues.
    const activeRules = await LoyaltyRule.find({ isActive: true });

    for (const rule of activeRules) {
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
            rewardServiceTypeId: rule.rewardServiceTypeId,
            earnedDate: new Date(),
            expiryDate: expiryDate,
          });

          await loyalty.save();
        }
      }
    }

    return loyalty;
  } catch (error) {
    console.error("Error updating loyalty stats:", error);
    throw error;
  }
};
