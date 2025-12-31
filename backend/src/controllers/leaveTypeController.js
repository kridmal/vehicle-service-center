import LeaveType from "../models/LeaveType.js";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    const { name, maxDaysPerYear, paid } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Leave name is required" });
    }
    const leaveType = await LeaveType.create({
      name: String(name).trim(),
      maxDaysPerYear: toNumber(maxDaysPerYear),
      paid: paid !== undefined ? Boolean(paid) : true,
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
    if (updates.paid !== undefined) {
      updates.paid = Boolean(updates.paid);
    }
    const updated = await LeaveType.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      return res.status(404).json({ message: "Leave type not found" });
    }
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
