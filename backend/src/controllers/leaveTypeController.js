import LeaveType from "../models/LeaveType.js";
import LeaveBalance from "../models/LeaveBalance.js";
import Staff from "../models/Staff.js";
import { logAudit } from "../utils/audit.js";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const SEED_TYPES = [
  {
    name: "Annual Leave",
    maxDaysPerYear: 14,
    allocationPerYear: 14,
    allocationPerMonth: 14 / 12,
    carryForwardAllowed: true,
    paid: true,
    isPaid: true,
    requiresDocument: false,
    applicableTo: "permanent",
    isActive: true,
  },
  {
    name: "Sick Leave",
    maxDaysPerYear: 7,
    allocationPerYear: 7,
    allocationPerMonth: 7 / 12,
    carryForwardAllowed: false,
    paid: true,
    isPaid: true,
    requiresDocument: true,
    applicableTo: "all",
    isActive: true,
  },
  {
    name: "Maternity Leave",
    maxDaysPerYear: 84,
    allocationPerYear: 84,
    allocationPerMonth: 0,
    carryForwardAllowed: false,
    paid: true,
    isPaid: true,
    requiresDocument: true,
    applicableTo: "permanent",
    isActive: true,
  },
];

const syncBalancesForType = async (leaveType) => {
  const year = new Date().getFullYear();
  const employees = await Staff.find({ active: { $ne: false }, status: { $ne: "inactive" } }).select(
    "_id employmentType"
  );
  for (const employee of employees) {
    if (
      leaveType.applicableTo === "permanent" &&
      employee.employmentType !== "permanent"
    ) {
      continue;
    }
    if (
      leaveType.applicableTo === "daily-paid" &&
      employee.employmentType !== "daily-paid"
    ) {
      continue;
    }
    await LeaveBalance.findOneAndUpdate(
      { employeeId: employee._id, leaveTypeId: leaveType._id, year },
      {
        $setOnInsert: {
          employeeId: employee._id,
          leaveTypeId: leaveType._id,
          year,
          allocated: toNumber(leaveType.allocationPerYear || leaveType.maxDaysPerYear),
          used: 0,
          carryForward: 0,
          remaining: toNumber(leaveType.allocationPerYear || leaveType.maxDaysPerYear),
          lastUpdated: new Date(),
        },
      },
      { upsert: true, new: true }
    );
  }
};

export const listLeaveTypes = async (req, res, next) => {
  try {
    const types = await LeaveType.find().sort({ name: 1 });
    return res.json(types);
  } catch (error) {
    return next(error);
  }
};

export const createLeaveType = async (req, res, next) => {
  try {
    const {
      name,
      maxDaysPerYear,
      allocationPerYear,
      allocationPerMonth,
      carryForwardAllowed,
      paid,
      isPaid,
      requiresDocument,
      applicableTo,
      isActive,
    } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Leave name is required" });
    }
    const leaveType = await LeaveType.create({
      name: String(name).trim(),
      maxDaysPerYear: toNumber(maxDaysPerYear),
      allocationPerYear: toNumber(allocationPerYear || maxDaysPerYear),
      allocationPerMonth: toNumber(allocationPerMonth),
      carryForwardAllowed: Boolean(carryForwardAllowed),
      paid: paid !== undefined ? Boolean(paid) : true,
      isPaid: isPaid !== undefined ? Boolean(isPaid) : paid !== undefined ? Boolean(paid) : true,
      requiresDocument: Boolean(requiresDocument),
      applicableTo: applicableTo || "all",
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });
    await syncBalancesForType(leaveType);
    await logAudit({
      req,
      action: "create",
      entity: "leave",
      entityId: leaveType._id,
      entityDescription: leaveType.name,
    });
    return res.status(201).json(leaveType);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Leave type already exists" });
    }
    return next(error);
  }
};

export const updateLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    if (updates.name !== undefined) {
      updates.name = String(updates.name).trim();
    }
    if (updates.maxDaysPerYear !== undefined) {
      updates.maxDaysPerYear = toNumber(updates.maxDaysPerYear);
    }
    if (updates.allocationPerYear !== undefined) {
      updates.allocationPerYear = toNumber(updates.allocationPerYear);
    }
    if (updates.allocationPerMonth !== undefined) {
      updates.allocationPerMonth = toNumber(updates.allocationPerMonth);
    }
    if (updates.carryForwardAllowed !== undefined) {
      updates.carryForwardAllowed = Boolean(updates.carryForwardAllowed);
    }
    if (updates.paid !== undefined) {
      updates.paid = Boolean(updates.paid);
    }
    if (updates.isPaid !== undefined) {
      updates.isPaid = Boolean(updates.isPaid);
    }
    if (updates.requiresDocument !== undefined) {
      updates.requiresDocument = Boolean(updates.requiresDocument);
    }
    if (updates.isActive !== undefined) {
      updates.isActive = Boolean(updates.isActive);
    }
    const updated = await LeaveType.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      return res.status(404).json({ message: "Leave type not found" });
    }
    await syncBalancesForType(updated);
    await logAudit({
      req,
      action: "update",
      entity: "leave",
      entityId: updated._id,
      entityDescription: updated.name,
    });
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
};

export const deleteLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await LeaveType.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Leave type not found" });
    }
    return res.json({ message: "Leave type deleted" });
  } catch (error) {
    return next(error);
  }
};

export const seedLeaveTypes = async (req, res, next) => {
  try {
    for (const row of SEED_TYPES) {
      const leaveType = await LeaveType.findOneAndUpdate(
        { name: row.name },
        { $setOnInsert: row },
        { upsert: true, new: true }
      );
      await syncBalancesForType(leaveType);
    }
    const types = await LeaveType.find().sort({ name: 1 });
    return res.json(types);
  } catch (error) {
    return next(error);
  }
};
