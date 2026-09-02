import mongoose from "mongoose";
import StaffAdvance from "../models/StaffAdvance.js";
import Staff from "../models/Staff.js";
import { logAudit } from "../utils/audit.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const listAdvances = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.staffId) {
      if (!isValidId(req.query.staffId)) {
        return res.status(400).json({ message: "Invalid staff id" });
      }
      filter.staffId = req.query.staffId;
    }
    if (req.query.status) {
      filter.status = String(req.query.status).trim().toUpperCase();
    }

    const rows = await StaffAdvance.find(filter)
      .populate("staffId", "employeeId fullName roleName status")
      .sort({ requestDate: -1, createdAt: -1 });

    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

export const createAdvance = async (req, res, next) => {
  try {
    const staffId = String(req.body.staffId || "").trim();
    const amount = toNumber(req.body.amount);
    if (!staffId || !isValidId(staffId)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }
    if (amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than zero" });
    }

    const staff = await Staff.findById(staffId).select("_id");
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const advance = await StaffAdvance.create({
      staffId: staff._id,
      requestDate: req.body.requestDate ? new Date(req.body.requestDate) : new Date(),
      amount,
      reason: String(req.body.reason || "").trim(),
      notes: String(req.body.notes || "").trim(),
      status: "PENDING",
      outstandingAmount: amount,
    });

    await logAudit({
      req,
      action: "create",
      entity: "staff-advance",
      entityId: advance._id,
      entityDescription: `Advance request created for ${staffId}`,
    });

    return res.status(201).json(advance);
  } catch (error) {
    return next(error);
  }
};

const loadAdvanceById = async (id) => {
  if (!isValidId(id)) {
    return { error: { status: 400, message: "Invalid advance id" } };
  }
  const advance = await StaffAdvance.findById(id);
  if (!advance) {
    return { error: { status: 404, message: "Advance not found" } };
  }
  return { advance };
};

export const approveAdvance = async (req, res, next) => {
  try {
    const { advance, error } = await loadAdvanceById(req.params.id);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }
    if (advance.status !== "PENDING") {
      return res.status(409).json({ message: "Only pending advances can be approved" });
    }

    advance.status = "APPROVED";
    advance.approvedAt = new Date();
    advance.approvedBy = req.user?.name || req.user?.email || "";
    if (req.body.notes !== undefined) {
      advance.notes = String(req.body.notes || "").trim();
    }
    const saved = await advance.save();

    await logAudit({
      req,
      action: "update",
      entity: "staff-advance",
      entityId: saved._id,
      entityDescription: `Advance approved for ${saved.staffId}`,
    });

    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};

export const rejectAdvance = async (req, res, next) => {
  try {
    const { advance, error } = await loadAdvanceById(req.params.id);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }
    if (!["PENDING", "APPROVED"].includes(advance.status)) {
      return res.status(409).json({ message: "Advance cannot be rejected in current state" });
    }

    advance.status = "REJECTED";
    advance.approvedAt = new Date();
    advance.approvedBy = req.user?.name || req.user?.email || "";
    if (req.body.notes !== undefined) {
      advance.notes = String(req.body.notes || "").trim();
    }
    const saved = await advance.save();

    await logAudit({
      req,
      action: "update",
      entity: "staff-advance",
      entityId: saved._id,
      entityDescription: `Advance rejected for ${saved.staffId}`,
    });

    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};

export const payoutAdvance = async (req, res, next) => {
  try {
    const { advance, error } = await loadAdvanceById(req.params.id);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }
    if (advance.status !== "APPROVED") {
      return res.status(409).json({ message: "Only approved advances can be paid out" });
    }

    advance.status = "PAID_OUT";
    advance.paidOutAt = new Date();
    advance.paidOutBy = req.user?.name || req.user?.email || "";
    if (!Number.isFinite(Number(advance.outstandingAmount)) || advance.outstandingAmount <= 0) {
      advance.outstandingAmount = toNumber(advance.amount);
    }
    if (req.body.notes !== undefined) {
      advance.notes = String(req.body.notes || "").trim();
    }
    const saved = await advance.save();

    await logAudit({
      req,
      action: "update",
      entity: "staff-advance",
      entityId: saved._id,
      entityDescription: `Advance paid out for ${saved.staffId}`,
    });

    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};
