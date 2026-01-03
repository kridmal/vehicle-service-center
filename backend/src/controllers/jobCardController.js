import mongoose from "mongoose";
import JobCard from "../models/JobCard.js";
import InventoryItem from "../models/InventoryItem.js";
import Invoice from "../models/Invoice.js";
import Staff from "../models/Staff.js";
import LaborHourEntry from "../models/LaborHourEntry.js";
import LaborHourDetail from "../models/LaborHourDetail.js";
import LaborHourLog from "../models/LaborHourLog.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizeServiceTasks = (tasks = []) =>
  tasks
    .map((task) => ({
      title: task.title?.trim(),
      isRequired: Boolean(task.isRequired),
      completed: Boolean(task.completed),
      standardLaborHours: Number(task.standardLaborHours) || 0,
      laborHourRate: Number(task.laborHourRate) || 0,
      assignedStaffId: task.assignedStaffId || task.staffId,
    }))
    .filter((task) => task.title);

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

export const listJobCards = async (req, res, next) => {
  try {
    const jobCards = await JobCard.find().sort({ createdAt: -1 });
    return res.json(jobCards);
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
      status,
      createdAt,
      billingType,
    } = req.body;
    const resolvedOwnerId = ownerId || customerId;
    if (!jobCardNo || !resolvedOwnerId || !vehicleId) {
      return res
        .status(400)
        .json({ message: "Job card number, owner, and vehicle are required" });
    }

    const normalizedServices = normalizeServices(services);
    if (normalizedServices.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one service must be added" });
    }

    const existing = await JobCard.findOne({ jobCardNo });
    if (existing) {
      return res.json(existing);
    }

    const jobCard = await JobCard.create({
      jobCardNo,
      ownerId: resolvedOwnerId,
      customerId: resolvedOwnerId,
      vehicleId,
      services: normalizedServices,
      billingType: billingType || "BILLABLE",
      status: status || "OPEN",
      createdAt: createdAt ? new Date(createdAt) : undefined,
    });

    if (jobCard.status === "COMPLETED") {
      const completedAt = new Date();
      const laborEntries = buildLaborEntries({
        jobCard,
        assignedWorkers: jobCard.assignedWorkers,
        completedAt,
      });
      if (laborEntries.length > 0) {
        await LaborHourEntry.insertMany(laborEntries);
      }

      const laborDetails = buildLaborDetailEntries({
        jobCard,
        assignedWorkers: jobCard.assignedWorkers,
        completedAt,
      });
      if (laborDetails.length > 0) {
        await LaborHourDetail.insertMany(laborDetails);
      }

      const existingLogs = await LaborHourLog.findOne({
        jobCardId: jobCard._id,
      });
      if (!existingLogs) {
        const logs = await buildLaborHourLogs({
          jobCard,
          assignedWorkers: jobCard.assignedWorkers,
          completedAt,
        });
        if (logs.length > 0) {
          await LaborHourLog.insertMany(logs);
        }
      }
    }

    return res.status(201).json(jobCard);
  } catch (error) {
    return next(error);
  }
};

const normalizePartsUsed = (partsUsed = []) =>
  partsUsed
    .filter((part) => part && (part.sku || part.inventoryId))
    .map((part) => ({
      inventoryId: part.inventoryId,
      sku: part.sku ? String(part.sku).trim().toUpperCase() : undefined,
      quantity: Number(part.quantity) || 0,
    }))
    .filter((part) => part.quantity > 0);

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
      if (member.roleType === "OFFICE") {
        return { error: "Office staff cannot be assigned to job cards" };
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

const buildLaborEntries = ({ jobCard, assignedWorkers, completedAt }) => {
  const billingType = jobCard.billingType || "BILLABLE";
  const staffMap = new Map(
    (assignedWorkers || []).map((worker) => [String(worker.staffId), worker])
  );
  const tasks = (jobCard.services || [])
    .flatMap((service) => service?.tasks || [])
    .filter((task) => task && Number(task.standardLaborHours) > 0);

  if (tasks.length === 0) return [];

  const assignedIds = Array.from(staffMap.keys());
  return tasks.flatMap((task) => {
    const taskName = task.title;
    const standardLaborHours = Number(task.standardLaborHours) || 0;
    const laborHourRate = Number(task.laborHourRate) || 0;
    const assignedStaffId = task.assignedStaffId
      ? String(task.assignedStaffId)
      : "";
    if (assignedStaffId && staffMap.has(assignedStaffId)) {
      const staff = staffMap.get(assignedStaffId);
      return [
        {
          jobCardId: jobCard._id,
          staffId: assignedStaffId,
          staffName: staff?.name,
          roleName: staff?.roleName,
          taskName,
          standardLaborHours,
          laborHourRate,
          date: completedAt,
          billingType,
        },
      ];
    }
    if (assignedIds.length === 0) {
      return [];
    }
    const splitHours = standardLaborHours / assignedIds.length;
    return assignedIds.map((staffId) => {
      const staff = staffMap.get(staffId);
      return {
        jobCardId: jobCard._id,
        staffId,
        staffName: staff?.name,
        roleName: staff?.roleName,
        taskName,
        standardLaborHours: splitHours,
        laborHourRate,
        date: completedAt,
        billingType,
      };
    });
  });
};

const buildLaborDetailEntries = ({ jobCard, assignedWorkers, completedAt }) => {
  const billingType = jobCard.billingType || "BILLABLE";
  const staffMap = new Map(
    (assignedWorkers || []).map((worker) => [String(worker.staffId), worker])
  );
  const tasks = (jobCard.services || [])
    .flatMap((service) =>
      (service?.tasks || []).map((task) => ({
        ...task,
        serviceType: service.serviceType,
      }))
    )
    .filter((task) => task && Number(task.standardLaborHours) > 0);

  if (tasks.length === 0) return [];

  const assignedIds = Array.from(staffMap.keys());
  return tasks.flatMap((task) => {
    const taskName = task.title;
    const serviceType = task.serviceType;
    const standardLaborHours = Number(task.standardLaborHours) || 0;
    const assignedStaffId = task.assignedStaffId
      ? String(task.assignedStaffId)
      : "";
    if (assignedStaffId && staffMap.has(assignedStaffId)) {
      const staff = staffMap.get(assignedStaffId);
      return [
        {
          jobCardId: jobCard._id,
          staffId: assignedStaffId,
          staffName: staff?.name,
          serviceType,
          taskName,
          standardLaborHours,
          date: completedAt,
          billingType,
        },
      ];
    }
    if (assignedIds.length === 0) {
      return [];
    }
    const splitHours = standardLaborHours / assignedIds.length;
    return assignedIds.map((staffId) => {
      const staff = staffMap.get(staffId);
      return {
        jobCardId: jobCard._id,
        staffId,
        staffName: staff?.name,
        serviceType,
        taskName,
        standardLaborHours: splitHours,
        date: completedAt,
        billingType,
      };
    });
  });
};

const formatMonthKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const buildLaborHourLogs = async ({ jobCard, assignedWorkers, completedAt }) => {
  const billingType = jobCard.billingType || "BILLABLE";
  const tasks = (jobCard.services || [])
    .flatMap((service) => service?.tasks || [])
    .filter((task) => task && Number(task.standardLaborHours) > 0);
  if (tasks.length === 0) return [];

  const totalHours = tasks.reduce(
    (sum, task) => sum + (Number(task.standardLaborHours) || 0),
    0
  );
  if (totalHours <= 0) return [];

  const assignedIds = Array.from(
    new Set(
      (assignedWorkers || [])
        .map((worker) => worker.staffId || worker.workerId)
        .filter(Boolean)
        .map((id) => String(id))
    )
  );
  if (assignedIds.length === 0) return [];

  const technicalStaff = await Staff.find({
    _id: { $in: assignedIds },
    roleType: "TECHNICAL",
  }).select("_id fullName");
  const technicalMap = new Map(
    technicalStaff.map((member) => [String(member._id), member])
  );
  const validIds = assignedIds.filter((id) => technicalMap.has(id));
  if (validIds.length === 0) return [];

  const perStaffHours = totalHours / validIds.length;
  const month = formatMonthKey(completedAt);

  return validIds.map((staffId) => {
    const staff = technicalMap.get(staffId);
    return {
      jobCardId: jobCard._id,
      staffId,
      staffName: staff?.fullName,
      date: completedAt,
      month,
      laborHours: perStaffHours,
      billingType,
    };
  });
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

    const partsUsed = normalizePartsUsed(
      req.body.partsUsed ?? jobCard.partsUsed
    );
    const shouldDeduct =
      nextStatus === "COMPLETED" && jobCard.status !== "COMPLETED";

    if (shouldDeduct && partsUsed.length > 0) {
      const skuList = partsUsed
        .map((part) => part.sku)
        .filter(Boolean);
      const idList = partsUsed
        .map((part) => part.inventoryId)
        .filter(Boolean);
      const items = await InventoryItem.find({
        $or: [
          skuList.length ? { sku: { $in: skuList } } : null,
          idList.length ? { _id: { $in: idList } } : null,
        ].filter(Boolean),
      });
      const itemBySku = new Map(items.map((item) => [item.sku, item]));
      const itemById = new Map(items.map((item) => [String(item._id), item]));

      for (const part of partsUsed) {
        const item =
          (part.sku ? itemBySku.get(part.sku) : null) ||
          (part.inventoryId ? itemById.get(String(part.inventoryId)) : null);
        if (!item) {
          return res
            .status(400)
            .json({ message: "Inventory item not found" });
        }
        if (item.quantity - part.quantity < 0) {
          return res.status(400).json({
            message: `Insufficient stock for ${item.itemName || item.name}`,
          });
        }
      }

      const bulkUpdates = partsUsed.map((part) => {
        const filter = part.sku
          ? { sku: part.sku }
          : { _id: part.inventoryId };
        return {
          updateOne: {
            filter,
            update: { $inc: { quantity: -part.quantity } },
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

    const updatePayload = {
      assignedWorker: resolvedAssignedWorker,
      assignedWorkers,
      status: nextStatus,
      partsUsed,
      laborCharges:
        req.body.laborCharges !== undefined
          ? Number(req.body.laborCharges) || 0
          : jobCard.laborCharges,
      paymentStatus: paymentStatus ?? jobCard.paymentStatus,
      workNotes: req.body.workNotes ?? jobCard.workNotes,
      services: incomingServices ?? jobCard.services,
      billingType: req.body.billingType ?? jobCard.billingType ?? "BILLABLE",
    };

    const updated = await JobCard.findByIdAndUpdate(id, updatePayload, {
      new: true,
      runValidators: true,
    });

    const shouldCreateLaborEntries =
      nextStatus === "COMPLETED" && currentStatus !== "COMPLETED";
    if (shouldCreateLaborEntries) {
      const [existingEntries, existingDetails, existingLogs] = await Promise.all([
        LaborHourEntry.findOne({ jobCardId: updated._id }),
        LaborHourDetail.findOne({ jobCardId: updated._id }),
        LaborHourLog.findOne({ jobCardId: updated._id }),
      ]);
      const completedAt = new Date();
      if (!existingEntries) {
        const laborEntries = buildLaborEntries({
          jobCard: updated,
          assignedWorkers: updated.assignedWorkers,
          completedAt,
        });
        if (laborEntries.length > 0) {
          await LaborHourEntry.insertMany(laborEntries);
        }
      }
      if (!existingDetails) {
        const laborDetails = buildLaborDetailEntries({
          jobCard: updated,
          assignedWorkers: updated.assignedWorkers,
          completedAt,
        });
        if (laborDetails.length > 0) {
          await LaborHourDetail.insertMany(laborDetails);
        }
      }
      if (!existingLogs) {
        const logs = await buildLaborHourLogs({
          jobCard: updated,
          assignedWorkers: updated.assignedWorkers,
          completedAt,
        });
        if (logs.length > 0) {
          await LaborHourLog.insertMany(logs);
        }
      }
    }

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
