import mongoose from "mongoose";
import DailyAttendance from "../models/DailyAttendance.js";
import Leave from "../models/Leave.js";
import LeaveType from "../models/LeaveType.js";
import Staff from "../models/Staff.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const parseDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const buildDateList = (from, to) => {
  const dates = [];
  let cursor = new Date(from);
  const end = new Date(to);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const normalizeDayType = (value, halfDayFlag) => {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "FULL" || normalized === "HALF") return normalized;
  if (halfDayFlag === true) return "HALF";
  if (halfDayFlag === false) return "FULL";
  return null;
};

export const listLeaves = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.staffId) {
      if (!isValidId(req.query.staffId)) {
        return res.status(400).json({ message: "Invalid staff id" });
      }
      filter.staffId = req.query.staffId;
    }
    if (req.query.status) {
      filter.status = String(req.query.status).toUpperCase();
    }
    const leaves = await Leave.find(filter).sort({ createdAt: -1 });
    return res.json(leaves);
  } catch (error) {
    return next(error);
  }
};

export const createLeave = async (req, res, next) => {
  try {
    const { staffId, leaveType, leaveTypeId, fromDate, toDate, dayType } =
      req.body;

    if (!staffId || !isValidId(staffId)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }

    const from = parseDateOnly(fromDate);
    const to = parseDateOnly(toDate);
    if (!from || !to) {
      return res.status(400).json({ message: "Invalid leave dates" });
    }
    if (to < from) {
      return res
        .status(400)
        .json({ message: "Leave end date must be after start date" });
    }

    let resolvedLeaveType = leaveType ? String(leaveType).trim() : "";
    if (!resolvedLeaveType && leaveTypeId) {
      if (!isValidId(leaveTypeId)) {
        return res.status(400).json({ message: "Invalid leave type" });
      }
      const leaveTypeRecord = await LeaveType.findById(leaveTypeId);
      if (!leaveTypeRecord) {
        return res.status(404).json({ message: "Leave type not found" });
      }
      resolvedLeaveType = leaveTypeRecord.name;
    }
    if (!resolvedLeaveType) {
      return res.status(400).json({ message: "Leave type is required" });
    }

    const normalizedDayType = normalizeDayType(
      dayType,
      req.body.halfDay ?? req.body.isHalfDay
    );
    if (!normalizedDayType) {
      return res.status(400).json({ message: "Invalid day type" });
    }

    const leave = await Leave.create({
      staffId,
      leaveType: resolvedLeaveType,
      fromDate: from,
      toDate: to,
      dayType: normalizedDayType,
    });

    return res.status(201).json(leave);
  } catch (error) {
    return next(error);
  }
};

export const approveLeave = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid leave id" });
    }

    const leave = await Leave.findById(id);
    if (!leave) {
      return res.status(404).json({ message: "Leave not found" });
    }
    if (leave.status === "APPROVED") {
      return res.json(leave);
    }
    if (leave.status === "REJECTED") {
      return res.status(409).json({ message: "Leave was rejected" });
    }

    const staff = await Staff.findById(leave.staffId);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const from = parseDateOnly(leave.fromDate);
    const to = parseDateOnly(leave.toDate);
    const attendanceType =
      leave.dayType === "HALF" ? "LEAVE_HALF" : "LEAVE_FULL";
    const dates = buildDateList(from, to);

    const existing = await DailyAttendance.find({
      staffId: leave.staffId,
      date: { $gte: from, $lte: to },
    }).select("date isSystemGenerated");

    const existingMap = new Map(
      existing.map((entry) => [
        entry.date.toISOString().slice(0, 10),
        entry.isSystemGenerated,
      ])
    );

    const operations = [];
    let skipped = 0;
    dates.forEach((date) => {
      const key = date.toISOString().slice(0, 10);
      const systemGenerated = existingMap.get(key);
      if (systemGenerated === false) {
        skipped += 1;
        return;
      }
      operations.push({
        updateOne: {
          filter: { staffId: leave.staffId, date },
          update: {
            staffId: leave.staffId,
            staffName: staff.fullName,
            date,
            attendanceType,
            leaveType: leave.leaveType,
            source: "MANUAL",
            remarks: "Auto-populated from approved leave",
            isSystemGenerated: true,
          },
          upsert: true,
        },
      });
    });

    if (operations.length > 0) {
      await DailyAttendance.bulkWrite(operations);
    }

    leave.status = "APPROVED";
    const saved = await leave.save();

    return res.json({
      leave: saved,
      created: operations.length,
      skipped,
    });
  } catch (error) {
    return next(error);
  }
};

export const rejectLeave = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid leave id" });
    }
    const leave = await Leave.findById(id);
    if (!leave) {
      return res.status(404).json({ message: "Leave not found" });
    }
    if (leave.status === "APPROVED") {
      return res.status(409).json({ message: "Leave already approved" });
    }
    leave.status = "REJECTED";
    const saved = await leave.save();
    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};
