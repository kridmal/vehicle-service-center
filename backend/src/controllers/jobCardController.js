import mongoose from "mongoose";
import Counter from "../models/Counter.js";
import Customer from "../models/Customer.js";
import JobCard from "../models/JobCard.js";
import InventoryItem from "../models/InventoryItem.js";
import Invoice from "../models/Invoice.js";
import ServiceType from "../models/ServiceType.js";
import Staff from "../models/Staff.js";
import Vehicle from "../models/Vehicle.js";
import { computeItemDiscount, roundMoney } from "../utils/itemDiscount.js";
import {
  deriveLoyaltyPricing,
  normalizeSelectedReward,
} from "../utils/loyaltyDiscount.js";
import {
  computeLaborTotals,
  flattenServiceTasks,
  hasPositiveTaskLaborCharge,
  hasTaskLaborMetadata,
  toNonNegativeNumber,
} from "../utils/laborTotals.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) => roundMoney(value);

const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const toOptionalNumber = (value) => (hasValue(value) ? toNumber(value) : null);

const normalizeDiscountMode = (value) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (["PERCENT", "AMOUNT", "FULL"].includes(normalized)) {
    return normalized;
  }
  return null;
};

const normalizeServiceTasks = (tasks = []) =>
  tasks
    .map((task) => {
      if (typeof task === "string") {
        const title = task.trim();
        if (!title) return null;
        return {
          taskId: null,
          taskName: title,
          title,
          isRequired: false,
          completed: false,
          laborHours: 0,
          laborCharge: 0,
          isBillable: true,
        };
      }
      if (!task || typeof task !== "object") return null;

      const title = String(task.title || task.taskName || "").trim();
      if (!title) return null;

      const taskId = task.taskId || task._id || task.id || null;

      return {
        taskId: taskId ? String(taskId) : null,
        taskName: title,
        title,
        isRequired: Boolean(task.isRequired),
        completed: Boolean(task.completed),
        laborHours: roundCurrency(
          toNonNegativeNumber(task.laborHours ?? task.laborHoursDefault)
        ),
        laborCharge: roundCurrency(
          toNonNegativeNumber(task.laborCharge ?? task.laborChargeDefault)
        ),
        isBillable: task.isBillable !== undefined ? Boolean(task.isBillable) : true,
      };
    })
    .filter((task) => task && task.title);

const normalizeServices = (services = []) =>
  services
    .map((service) => {
      if (!service) return null;
      if (typeof service === "string") {
        return { serviceType: service.trim(), tasks: [] };
      }
      const serviceType = String(
        service.serviceType || service.id || service._id || ""
      ).trim();
      if (!serviceType) return null;
      return {
        serviceType,
        tasks: normalizeServiceTasks(service.tasks),
      };
    })
    .filter(Boolean);

const collectServiceTypeIds = (services = []) =>
  [
    ...new Set(
      (Array.isArray(services) ? services : [])
        .map((service) => String(service?.serviceType || "").trim())
        .filter(Boolean)
    ),
  ];

const buildTaskIdentity = (task) => {
  if (!task || typeof task !== "object") return "";
  const taskId = String(task.taskId || "").trim();
  if (!taskId) return "";
  return `id:${taskId}`;
};

const appendServiceTypeTasks = ({
  existingServices = [],
  incomingServiceTypeDocs = [],
}) => {
  const existingTaskIdentities = new Set(
    (Array.isArray(existingServices) ? existingServices : []).flatMap((service) =>
      (service?.tasks || [])
        .map((task) => buildTaskIdentity(task))
        .filter(Boolean)
    )
  );

  const appendedServices = [];
  for (const serviceTypeDoc of incomingServiceTypeDocs) {
    const normalizedTasks = normalizeServiceTasks(serviceTypeDoc?.tasks || []).filter(
      (task) => {
        const identity = buildTaskIdentity(task);
        if (!identity) return true;
        if (existingTaskIdentities.has(identity)) return false;
        existingTaskIdentities.add(identity);
        return true;
      }
    );

    appendedServices.push({
      serviceType: String(serviceTypeDoc._id),
      tasks: normalizedTasks,
    });
  }

  return [
    ...(Array.isArray(existingServices) ? existingServices : []),
    ...appendedServices,
  ];
};

const toPrintCustomer = (customer) => {
  if (!customer) return null;
  return {
    id: customer._id,
    name: customer.name || "",
    phone: customer.phone || "",
    email: customer.email || "",
    address: customer.address || "",
  };
};

const toPrintVehicle = (vehicle) => {
  if (!vehicle) return null;
  return {
    id: vehicle._id,
    vehicleNumber: vehicle.vehicleNumber || "",
    brand: vehicle.brandName || "",
    model: vehicle.modelName || "",
    frameNumber: vehicle.frameNumber || "",
    engineNumber: vehicle.engineNumber || "",
    odometer: vehicle.odometer || null,
  };
};

const enrichJobCardForClient = async (jobCard) => {
  if (!jobCard) return null;
  const snapshot = jobCard.toObject ? jobCard.toObject() : { ...jobCard };

  const serviceTypeIds = snapshot.serviceTypeIds?.length
    ? snapshot.serviceTypeIds.map((serviceTypeId) => String(serviceTypeId))
    : collectServiceTypeIds(snapshot.services);
  const [serviceTypes, customer, vehicle] = await Promise.all([
    serviceTypeIds.length
      ? ServiceType.find({ _id: { $in: serviceTypeIds.filter((id) => isValidId(id)) } })
      : [],
    isValidId(snapshot.customerId || snapshot.ownerId)
      ? Customer.findById(snapshot.customerId || snapshot.ownerId)
      : null,
    isValidId(snapshot.vehicleId) ? Vehicle.findById(snapshot.vehicleId) : null,
  ]);

  const serviceNameMap = new Map(
    (serviceTypes || []).map((serviceType) => [String(serviceType._id), serviceType.name])
  );

  const servicesWithName = (Array.isArray(snapshot.services) ? snapshot.services : []).map(
    (service) => ({
      ...service,
      serviceName:
        service?.serviceName ||
        serviceNameMap.get(String(service?.serviceType || "")) ||
        "",
    })
  );

  return {
    ...snapshot,
    jobNumber: snapshot.jobCardNo,
    serviceTypeIds: snapshot.serviceTypeIds?.length
      ? snapshot.serviceTypeIds.map((id) => String(id))
      : serviceTypeIds,
    services: servicesWithName,
    customer: toPrintCustomer(customer),
    vehicle: toPrintVehicle(vehicle),
  };
};

const nextJobCardNumber = async () => {
  const counter = await Counter.findByIdAndUpdate(
    "jobCardNumber",
    { $inc: { seq: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return `JC-${String(counter.seq).padStart(5, "0")}`;
};

const resolveLaborChargesOriginal = ({
  services = [],
  fallbackLaborCharges = 0,
}) => {
  const hasLaborMetadataInIncoming = hasTaskLaborMetadata(services);
  const hasPositiveLaborInIncoming = hasPositiveTaskLaborCharge(services);

  const shouldUseTaskLabor =
    hasLaborMetadataInIncoming &&
    (hasPositiveLaborInIncoming || toNonNegativeNumber(fallbackLaborCharges) === 0);

  if (!shouldUseTaskLabor) {
    return roundCurrency(toNonNegativeNumber(fallbackLaborCharges));
  }

  const flattenedTasks = flattenServiceTasks(services);
  const totals = computeLaborTotals(flattenedTasks);
  return roundCurrency(totals.laborSubtotalOriginal);
};

const normalizePartsUsed = (partsUsed = []) =>
  partsUsed
    .filter((part) => part && (part.sku || part.inventoryId))
    .map((part) => ({
      inventoryId: part.inventoryId,
      sku: part.sku ? String(part.sku).trim().toUpperCase() : undefined,
      quantity: toNumber(part.quantity),
    }))
    .filter((part) => part.quantity > 0);

const normalizeAppliedRewards = (appliedRewards = []) => {
  const selectedReward = normalizeSelectedReward(appliedRewards);
  if (!selectedReward || !selectedReward.ruleId) {
    return [];
  }

  return [
    {
      rewardId: selectedReward.rewardId || null,
      ruleId: selectedReward.ruleId,
      ruleName: selectedReward.ruleName,
      rewardType: selectedReward.rewardType,
      rewardValue: toNumber(selectedReward.rewardValue),
      rewardDiscountMode: normalizeDiscountMode(selectedReward.rewardDiscountMode),
      rewardDiscountValue: toOptionalNumber(selectedReward.rewardDiscountValue),
      rewardDiscountCap: toOptionalNumber(selectedReward.rewardDiscountCap),
      milestoneNumber: selectedReward.milestoneNumber,
      discountAmount: 0,
    },
  ];
};

const withCalculatedRewardDiscount = (appliedRewards, laborDiscount) => {
  if (!Array.isArray(appliedRewards) || appliedRewards.length === 0) {
    return [];
  }

  const selectedReward = appliedRewards[0];
  if (!selectedReward) {
    return [];
  }

  const rewardType = String(selectedReward.rewardType || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return [
    {
      ...selectedReward,
      rewardType,
      rewardDiscountMode: normalizeDiscountMode(selectedReward.rewardDiscountMode),
      rewardDiscountValue: toOptionalNumber(selectedReward.rewardDiscountValue),
      rewardDiscountCap: toOptionalNumber(selectedReward.rewardDiscountCap),
      discountAmount: rewardType === "free_labor" ? toNumber(laborDiscount) : 0,
    },
  ];
};

const buildRewardIdentity = (reward) => {
  if (!reward) return "";
  const ruleId = reward.ruleId ? String(reward.ruleId) : "";
  const milestone =
    reward.milestoneNumber === null || reward.milestoneNumber === undefined
      ? "legacy"
      : String(Math.floor(toNumber(reward.milestoneNumber)));
  return `${ruleId}:${milestone}`;
};

const loadInventoryContext = async (partsUsed = []) => {
  const skuList = [
    ...new Set(
      partsUsed.map((part) => part.sku).filter(Boolean).map((sku) => String(sku))
    ),
  ];
  const idList = [
    ...new Set(
      partsUsed
        .map((part) => part.inventoryId)
        .filter((id) => id && isValidId(String(id)))
        .map((id) => String(id))
    ),
  ];

  if (skuList.length === 0 && idList.length === 0) {
    return {
      items: [],
      itemBySku: new Map(),
      itemById: new Map(),
    };
  }

  const query = [];
  if (skuList.length > 0) {
    query.push({ sku: { $in: skuList } });
  }
  if (idList.length > 0) {
    query.push({ _id: { $in: idList } });
  }

  const items = await InventoryItem.find({ $or: query });
  return {
    items,
    itemBySku: new Map(
      items.map((item) => [String(item.sku || "").trim().toUpperCase(), item])
    ),
    itemById: new Map(items.map((item) => [String(item._id), item])),
  };
};

const resolveInventoryItemForPart = (part, inventoryContext) =>
  (part.sku ? inventoryContext.itemBySku.get(String(part.sku)) : null) ||
  (part.inventoryId
    ? inventoryContext.itemById.get(String(part.inventoryId))
    : null) ||
  null;

const calculatePartsSubtotal = (partsUsed, inventoryContext) => {
  let subtotalPartsOriginal = 0;
  let partsDiscountTotal = 0;
  let subtotalParts = 0;
  const normalizedPartsUsed = [];

  for (const part of partsUsed) {
    const item = resolveInventoryItemForPart(part, inventoryContext);
    if (!item) {
      return {
        error: "Inventory item not found",
      };
    }
    const quantity = toNumber(part.quantity);
    const unitPriceOriginal = toNumber(item.sellingPrice);
    const discountResult = computeItemDiscount({
      unitPriceOriginal,
      qty: quantity,
      discountEnabled: item.discountEnabled,
      discountType: item.discountType,
      discountValue: item.discountValue,
      startAt: item.discountStartAt,
      endAt: item.discountEndAt,
      minQty: item.minQtyForDiscount,
      cap: item.maxDiscountCap,
    });

    const lineTotalOriginal = roundCurrency(unitPriceOriginal * quantity);
    subtotalPartsOriginal = roundCurrency(subtotalPartsOriginal + lineTotalOriginal);
    partsDiscountTotal = roundCurrency(
      partsDiscountTotal + discountResult.lineDiscountTotal
    );
    subtotalParts = roundCurrency(subtotalParts + discountResult.lineTotalNet);

    normalizedPartsUsed.push({
      inventoryId: item._id,
      sku: item.sku || part.sku || "",
      quantity,
      unitPriceOriginal: roundCurrency(unitPriceOriginal),
      discountPerUnit: discountResult.discountPerUnit,
      unitPriceNet: discountResult.unitPriceNet,
      lineDiscountTotal: discountResult.lineDiscountTotal,
      lineTotal: discountResult.lineTotalNet,
    });
  }

  return {
    subtotalPartsOriginal,
    partsDiscountTotal,
    subtotalParts,
    normalizedPartsUsed,
  };
};

const normalizeAssignedWorkers = async (assignedWorkers) => {
  if (assignedWorkers === null) {
    return { snapshots: [] };
  }
  if (!Array.isArray(assignedWorkers)) {
    return { snapshots: [] };
  }

  const entries = assignedWorkers
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") {
        return { staffId: entry };
      }
      return {
        staffId: entry.staffId || entry.workerId || entry._id || entry.id,
        name: entry.name || entry.fullName,
        roleName: entry.roleName || entry.role,
      };
    })
    .filter(Boolean);

  const ids = entries
    .map((entry) => entry.staffId)
    .filter(Boolean)
    .map((id) => String(id));

  const staff = ids.length ? await Staff.find({ _id: { $in: ids } }) : [];
  const staffMap = new Map(staff.map((member) => [String(member._id), member]));

  const snapshots = [];
  for (const entry of entries) {
    if (entry.staffId) {
      const member = staffMap.get(String(entry.staffId));
      if (!member) {
        if (entry.name) {
          snapshots.push({
            name: entry.name,
            roleName: entry.roleName,
          });
          continue;
        }
        return { error: "Staff not found" };
      }
      const resolvedRoleName =
        member.roleName || member.role || entry.roleName;
      snapshots.push({
        staffId: member._id,
        workerId: member._id,
        name: member.fullName,
        roleName: resolvedRoleName,
        role: resolvedRoleName,
      });
      continue;
    }

    if (entry.name) {
      snapshots.push({
        name: entry.name,
        roleName: entry.roleName,
        role: entry.roleName,
      });
    }
  }

  return { snapshots };
};

export const listJobCards = async (req, res, next) => {
  try {
    const jobCards = await JobCard.find().sort({ createdAt: -1 });
    return res.json(jobCards);
  } catch (error) {
    return next(error);
  }
};

export const getJobCardById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid job card id" });
    }

    const jobCard = await JobCard.findById(id);
    if (!jobCard) {
      return res.status(404).json({ message: "Job card not found" });
    }

    const enriched = await enrichJobCardForClient(jobCard);
    return res.json(enriched);
  } catch (error) {
    return next(error);
  }
};

export const createJobCard = async (req, res, next) => {
  try {
    const {
      jobCardNo,
      ownerId,
      customerId,
      vehicleId,
      services,
      appliedRewards,
      status,
      createdAt,
      partsUsed,
      laborCharges,
      paymentStatus,
      workNotes,
      assignedWorker,
      assignedWorkers,
    } = req.body;
    const resolvedOwnerId = ownerId || customerId;
    if (!resolvedOwnerId || !vehicleId) {
      return res
        .status(400)
        .json({ message: "Owner and vehicle are required" });
    }

    const resolvedJobCardNo = String(jobCardNo || "").trim() || (await nextJobCardNumber());

    const normalizedServices = normalizeServices(services);
    if (normalizedServices.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one service must be added" });
    }

    const existing = await JobCard.findOne({ jobCardNo: resolvedJobCardNo });
    if (existing) {
      return res.json(existing);
    }

    const normalizedPartsUsed = normalizePartsUsed(partsUsed || []);
    const inventoryContext = await loadInventoryContext(normalizedPartsUsed);
    const partsSubtotalResult = calculatePartsSubtotal(
      normalizedPartsUsed,
      inventoryContext
    );
    if (partsSubtotalResult.error) {
      return res.status(400).json({ message: partsSubtotalResult.error });
    }

    const normalizedRewards = normalizeAppliedRewards(appliedRewards);
    const laborChargesOriginal = resolveLaborChargesOriginal({
      services: normalizedServices,
      fallbackLaborCharges: toNumber(laborCharges),
    });
    const pricing = deriveLoyaltyPricing({
      partsSubtotal: partsSubtotalResult.subtotalParts,
      laborChargesOriginal,
      appliedRewards: normalizedRewards,
    });
    const persistedAppliedRewards = withCalculatedRewardDiscount(
      normalizedRewards,
      pricing.loyaltyLaborDiscount
    );

    let assignedWorkerSnapshots = [];
    if (assignedWorkers !== undefined) {
      const result = await normalizeAssignedWorkers(assignedWorkers);
      if (result.error) {
        return res.status(400).json({ message: result.error });
      }
      assignedWorkerSnapshots = result.snapshots;
    }
    const resolvedAssignedWorker =
      assignedWorker !== undefined
        ? assignedWorker
        : assignedWorkerSnapshots.length
        ? assignedWorkerSnapshots
            .map((worker) => worker.name)
            .filter(Boolean)
            .join(", ")
        : "";

    const jobCard = await JobCard.create({
      jobCardNo: resolvedJobCardNo,
      ownerId: resolvedOwnerId,
      customerId: resolvedOwnerId,
      vehicleId,
      serviceTypeIds: collectServiceTypeIds(normalizedServices),
      services: normalizedServices,
      assignedWorker: resolvedAssignedWorker,
      assignedWorkers: assignedWorkerSnapshots,
      partsUsed: partsSubtotalResult.normalizedPartsUsed,
      laborCharges: pricing.laborChargesOriginal,
      laborChargesOriginal: pricing.laborChargesOriginal,
      loyaltyLaborDiscount: pricing.loyaltyLaborDiscount,
      laborChargesNet: pricing.laborChargesNet,
      subtotalPartsOriginal: partsSubtotalResult.subtotalPartsOriginal,
      partsDiscountTotal: partsSubtotalResult.partsDiscountTotal,
      subtotalParts: pricing.subtotalParts,
      grandTotal: pricing.grandTotal,
      loyaltyAppliedAt: persistedAppliedRewards.length ? new Date() : null,
      appliedRewards: persistedAppliedRewards,
      status: status || "OPEN",
      paymentStatus: paymentStatus || "UNPAID",
      workNotes: workNotes || "",
      createdAt: createdAt ? new Date(createdAt) : undefined,
    });

    return res.status(201).json(jobCard);
  } catch (error) {
    return next(error);
  }
};

export const updateJobCard = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid job card id" });
    }

    const jobCard = await JobCard.findById(id);
    if (!jobCard) {
      return res.status(404).json({ message: "Job card not found" });
    }

    const currentStatus = jobCard.status || "OPEN";
    const nextStatus = req.body.status || currentStatus;
    const allowedTransitions = {
      OPEN: ["IN_PROGRESS"],
      IN_PROGRESS: ["PENDING", "COMPLETED"],
      PENDING: ["IN_PROGRESS"],
      COMPLETED: [],
      CLOSED: [],
    };

    if (currentStatus === "CLOSED") {
      return res
        .status(400)
        .json({ message: "Closed job cards cannot be edited" });
    }

    if (nextStatus === "CLOSED") {
      return res
        .status(400)
        .json({ message: "Use the close endpoint to close job cards" });
    }

    if (nextStatus !== currentStatus) {
      const allowedNext = allowedTransitions[currentStatus] || [];
      if (!allowedNext.includes(nextStatus)) {
        return res.status(400).json({
          message: `Invalid status transition from ${currentStatus} to ${nextStatus}`,
        });
      }
    }

    if (currentStatus === "COMPLETED") {
      const lockedFields = [
        "assignedWorker",
        "assignedWorkers",
        "services",
        "partsUsed",
        "laborCharges",
        "workNotes",
        "status",
      ];
      const hasLockedUpdate = lockedFields.some(
        (field) => req.body[field] !== undefined
      );
      if (hasLockedUpdate) {
        return res.status(400).json({
          message: "Completed job cards are read-only",
        });
      }
    }

    const paymentStatus = req.body.paymentStatus;
    if (paymentStatus && nextStatus !== "COMPLETED") {
      return res
        .status(400)
        .json({ message: "Payment status can only be updated when completed" });
    }

    const incomingServices = req.body.services
      ? normalizeServices(req.body.services)
      : null;
    if (incomingServices && incomingServices.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one service must be added" });
    }

    if (nextStatus === "COMPLETED") {
      const servicesToCheck = incomingServices ?? jobCard.services ?? [];
      const hasIncompleteRequired = servicesToCheck.some((service) =>
        (service.tasks || []).some(
          (task) => task.isRequired && !task.completed
        )
      );
      if (hasIncompleteRequired) {
        return res.status(400).json({
          message: "Complete all required tasks before marking as completed",
        });
      }
    }

    const partsUsed = normalizePartsUsed(req.body.partsUsed ?? jobCard.partsUsed);
    const inventoryContext = await loadInventoryContext(partsUsed);
    const partsSubtotalResult = calculatePartsSubtotal(partsUsed, inventoryContext);
    if (partsSubtotalResult.error) {
      return res.status(400).json({ message: partsSubtotalResult.error });
    }

    const shouldDeduct =
      nextStatus === "COMPLETED" && jobCard.status !== "COMPLETED";
    if (shouldDeduct && partsUsed.length > 0) {
      for (const part of partsUsed) {
        const item = resolveInventoryItemForPart(part, inventoryContext);
        if (!item) {
          return res.status(400).json({ message: "Inventory item not found" });
        }
        if (toNumber(item.quantity) - toNumber(part.quantity) < 0) {
          return res.status(400).json({
            message: `Insufficient stock for ${item.itemName || item.name}`,
          });
        }
      }

      const bulkUpdates = partsUsed.map((part) => {
        const filter = part.sku ? { sku: part.sku } : { _id: part.inventoryId };
        return {
          updateOne: {
            filter,
            update: { $inc: { quantity: -toNumber(part.quantity) } },
          },
        };
      });
      if (bulkUpdates.length > 0) {
        await InventoryItem.bulkWrite(bulkUpdates);
      }
    }

    let assignedWorkers = jobCard.assignedWorkers;
    if (req.body.assignedWorkers !== undefined) {
      const result = await normalizeAssignedWorkers(req.body.assignedWorkers);
      if (result.error) {
        return res.status(400).json({ message: result.error });
      }
      assignedWorkers = result.snapshots;
    }

    const resolvedAssignedWorker =
      req.body.assignedWorker !== undefined
        ? req.body.assignedWorker
        : assignedWorkers?.length
        ? assignedWorkers
            .map((worker) => worker.name)
            .filter(Boolean)
            .join(", ")
        : jobCard.assignedWorker;

    const normalizedRewards =
      req.body.appliedRewards !== undefined
        ? normalizeAppliedRewards(req.body.appliedRewards)
        : normalizeAppliedRewards(jobCard.appliedRewards);

    const servicesForPricing = incomingServices ?? jobCard.services;
    const fallbackLaborCharges =
      req.body.laborCharges !== undefined
        ? toNumber(req.body.laborCharges)
        : toNumber(jobCard.laborChargesOriginal ?? jobCard.laborCharges);
    const laborChargesOriginal = resolveLaborChargesOriginal({
      services: servicesForPricing,
      fallbackLaborCharges,
    });

    const pricing = deriveLoyaltyPricing({
      partsSubtotal: partsSubtotalResult.subtotalParts,
      laborChargesOriginal,
      appliedRewards: normalizedRewards,
    });

    const persistedAppliedRewards = withCalculatedRewardDiscount(
      normalizedRewards,
      pricing.loyaltyLaborDiscount
    );

    const previousRewardIdentity = buildRewardIdentity(
      normalizeSelectedReward(jobCard.appliedRewards || [])
    );
    const nextRewardIdentity = buildRewardIdentity(
      normalizeSelectedReward(persistedAppliedRewards)
    );
    const loyaltyAppliedAt = nextRewardIdentity
      ? previousRewardIdentity &&
        previousRewardIdentity === nextRewardIdentity &&
        jobCard.loyaltyAppliedAt
        ? jobCard.loyaltyAppliedAt
        : new Date()
      : null;

    const updatePayload = {
      assignedWorker: resolvedAssignedWorker,
      assignedWorkers,
      status: nextStatus,
      partsUsed: partsSubtotalResult.normalizedPartsUsed,
      laborCharges: pricing.laborChargesOriginal,
      laborChargesOriginal: pricing.laborChargesOriginal,
      loyaltyLaborDiscount: pricing.loyaltyLaborDiscount,
      laborChargesNet: pricing.laborChargesNet,
      subtotalPartsOriginal: partsSubtotalResult.subtotalPartsOriginal,
      partsDiscountTotal: partsSubtotalResult.partsDiscountTotal,
      subtotalParts: pricing.subtotalParts,
      grandTotal: pricing.grandTotal,
      loyaltyAppliedAt,
      paymentStatus: paymentStatus ?? jobCard.paymentStatus,
      workNotes: req.body.workNotes ?? jobCard.workNotes,
      serviceTypeIds: collectServiceTypeIds(servicesForPricing),
      services: servicesForPricing,
      appliedRewards: persistedAppliedRewards,
    };

    const updated = await JobCard.findByIdAndUpdate(id, updatePayload, {
      new: true,
      runValidators: true,
    });

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
};

export const addJobCardServiceTypes = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid job card id" });
    }

    const addServiceTypeIds = Array.isArray(req.body?.addServiceTypeIds)
      ? req.body.addServiceTypeIds
      : [];
    const requestedServiceTypeIds = [
      ...new Set(
        addServiceTypeIds
          .map((serviceTypeId) => String(serviceTypeId || "").trim())
          .filter(Boolean)
      ),
    ];

    if (requestedServiceTypeIds.length === 0) {
      return res.status(400).json({ message: "At least one service type is required" });
    }
    if (requestedServiceTypeIds.some((serviceTypeId) => !isValidId(serviceTypeId))) {
      return res.status(400).json({ message: "Invalid service type id" });
    }

    const jobCard = await JobCard.findById(id);
    if (!jobCard) {
      return res.status(404).json({ message: "Job card not found" });
    }

    if (jobCard.status !== "OPEN") {
      return res
        .status(400)
        .json({ message: "Cannot modify service types after completion" });
    }

    const existingServiceTypeIds = new Set(collectServiceTypeIds(jobCard.services || []));
    const duplicateServiceTypeIds = requestedServiceTypeIds.filter((serviceTypeId) =>
      existingServiceTypeIds.has(serviceTypeId)
    );

    if (duplicateServiceTypeIds.length > 0) {
      return res.status(400).json({
        message: "One or more service types are already added to this job card",
      });
    }

    const serviceTypes = await ServiceType.find({
      _id: { $in: requestedServiceTypeIds },
    });
    if (serviceTypes.length !== requestedServiceTypeIds.length) {
      const foundIds = new Set(serviceTypes.map((serviceType) => String(serviceType._id)));
      const missingIds = requestedServiceTypeIds.filter((serviceTypeId) => !foundIds.has(serviceTypeId));
      return res.status(404).json({
        message: `Service type not found: ${missingIds.join(", ")}`,
      });
    }

    const serviceTypeMap = new Map(
      serviceTypes.map((serviceType) => [String(serviceType._id), serviceType])
    );
    const orderedServiceTypes = requestedServiceTypeIds
      .map((serviceTypeId) => serviceTypeMap.get(serviceTypeId))
      .filter(Boolean);

    const mergedServices = appendServiceTypeTasks({
      existingServices: jobCard.services || [],
      incomingServiceTypeDocs: orderedServiceTypes,
    });
    const mergedServiceTypeIds = [
      ...new Set([...(jobCard.serviceTypeIds || []).map((value) => String(value)), ...collectServiceTypeIds(mergedServices)]),
    ];

    const normalizedPartsUsed = normalizePartsUsed(jobCard.partsUsed || []);
    const inventoryContext = await loadInventoryContext(normalizedPartsUsed);
    const partsSubtotalResult = calculatePartsSubtotal(normalizedPartsUsed, inventoryContext);
    if (partsSubtotalResult.error) {
      return res.status(400).json({ message: partsSubtotalResult.error });
    }

    const normalizedRewards = normalizeAppliedRewards(jobCard.appliedRewards);
    const laborChargesOriginal = resolveLaborChargesOriginal({
      services: mergedServices,
      fallbackLaborCharges: toNumber(jobCard.laborChargesOriginal ?? jobCard.laborCharges),
    });
    const pricing = deriveLoyaltyPricing({
      partsSubtotal: partsSubtotalResult.subtotalParts,
      laborChargesOriginal,
      appliedRewards: normalizedRewards,
    });
    const persistedAppliedRewards = withCalculatedRewardDiscount(
      normalizedRewards,
      pricing.loyaltyLaborDiscount
    );

    const previousRewardIdentity = buildRewardIdentity(
      normalizeSelectedReward(jobCard.appliedRewards || [])
    );
    const nextRewardIdentity = buildRewardIdentity(
      normalizeSelectedReward(persistedAppliedRewards)
    );
    const loyaltyAppliedAt = nextRewardIdentity
      ? previousRewardIdentity &&
        previousRewardIdentity === nextRewardIdentity &&
        jobCard.loyaltyAppliedAt
        ? jobCard.loyaltyAppliedAt
        : new Date()
      : null;

    jobCard.serviceTypeIds = mergedServiceTypeIds;
    jobCard.services = mergedServices;
    jobCard.partsUsed = partsSubtotalResult.normalizedPartsUsed;
    jobCard.laborCharges = pricing.laborChargesOriginal;
    jobCard.laborChargesOriginal = pricing.laborChargesOriginal;
    jobCard.loyaltyLaborDiscount = pricing.loyaltyLaborDiscount;
    jobCard.laborChargesNet = pricing.laborChargesNet;
    jobCard.subtotalPartsOriginal = partsSubtotalResult.subtotalPartsOriginal;
    jobCard.partsDiscountTotal = partsSubtotalResult.partsDiscountTotal;
    jobCard.subtotalParts = pricing.subtotalParts;
    jobCard.grandTotal = pricing.grandTotal;
    jobCard.appliedRewards = persistedAppliedRewards;
    jobCard.loyaltyAppliedAt = loyaltyAppliedAt;

    const updated = await jobCard.save();
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
};

export const closeJobCard = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid job card id" });
    }

    const jobCard = await JobCard.findById(id);
    if (!jobCard) {
      return res.status(404).json({ message: "Job card not found" });
    }

    if (jobCard.status !== "COMPLETED") {
      return res
        .status(400)
        .json({ message: "Only completed job cards can be closed" });
    }

    const invoice = await Invoice.findOne({ jobCard: jobCard._id });
    if (!invoice) {
      return res.status(400).json({
        message: "Invoice must exist before closing the job card",
      });
    }
    if (invoice.status !== "FINALIZED") {
      return res.status(400).json({
        message: "Finalize the invoice before closing the job card",
      });
    }

    jobCard.status = "CLOSED";
    const saved = await jobCard.save();
    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};
