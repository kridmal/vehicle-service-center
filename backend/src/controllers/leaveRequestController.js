import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import LeaveBalance from "../models/LeaveBalance.js";
import LeaveRequest from "../models/LeaveRequest.js";
import LeaveType from "../models/LeaveType.js";
import Staff from "../models/Staff.js";
import WorkCalendar from "../models/WorkCalendar.js";
import { logAudit } from "../utils/audit.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const listLeaveRequests = async (req, res, next) => {
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
    const requests = await LeaveRequest.find(filter)
      .populate("leaveTypeId", "name paid")
      .populate("staffId", "fullName employeeId")
      .sort({ createdAt: -1 });
    return res.json(requests);
  } catch (error) {
    return next(error);
  }
};

const toDateString = (value) => new Date(value).toISOString().slice(0, 10);

const betweenDates = (startDate, endDate) => {
  const rows = [];
  const cursor = new Date(startDate);
  const end = new Date(endDate);
  while (cursor <= end) {
    rows.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
};

const isWorkingDate = (date, calendar) => {
  if (!calendar) return true;
  const dateStr = date.toISOString().slice(0, 10);
  const holidays = new Set(calendar.holidayDates || []);
  const customOffDates = new Set(calendar.customOffDates || []);
  if (holidays.has(dateStr) || customOffDates.has(dateStr)) return false;
  const day = date.getDay();
  if (calendar.weeklyOffPattern === "none") return true;
  if (calendar.weeklyOffPattern === "sunday") return day !== 0;
  if (calendar.weeklyOffPattern === "saturday-sunday") return day !== 0 && day !== 6;
  if (calendar.weeklyOffPattern === "custom") {
    const map = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const custom = new Set(
      (calendar.customWeeklyOffDays || [])
        .map((d) => map[String(d || "").toLowerCase()])
        .filter((v) => v !== undefined)
    );
    return !custom.has(day);
  }
  return true;
};

export const createLeaveRequest = async (req, res, next) => {
  try {
    const {
      staffId,
      leaveTypeId,
      startDate,
      endDate,
      days,
      totalDays,
      reason,
      attachmentUrl,
      requestedBy,
      notes,
    } = req.body;

    if (!staffId || !isValidId(staffId)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }
    if (!leaveTypeId || !isValidId(leaveTypeId)) {
      return res.status(400).json({ message: "Invalid leave type" });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start and end dates required" });
    }

    const [employee, leaveType] = await Promise.all([
      Staff.findById(staffId),
      LeaveType.findById(leaveTypeId),
    ]);
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    if (!leaveType) return res.status(404).json({ message: "Leave type not found" });

    const request = await LeaveRequest.create({
      staffId,
      employeeId: employee.employeeId || String(employee._id),
      employeeName: employee.fullName,
      leaveTypeId,
      leaveTypeName: leaveType.name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      days: toNumber(days),
      totalDays: toNumber(totalDays || days),
      reason: reason ? String(reason).trim() : undefined,
      attachmentUrl: attachmentUrl ? String(attachmentUrl).trim() : undefined,
      requestedBy: requestedBy ? String(requestedBy).trim() : undefined,
      notes: notes ? String(notes).trim() : undefined,
    });
    await logAudit({
      req,
      action: "create",
      entity: "leave",
      entityId: request._id,
      entityDescription: `${employee.fullName} ${leaveType.name}`,
    });

    return res.status(201).json(request);
  } catch (error) {
    return next(error);
  }
};

export const approveLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { approvedBy, reviewNote } = req.body;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid request id" });
    }
    const request = await LeaveRequest.findById(id).populate("leaveTypeId").populate("staffId");
    if (!request) {
      return res.status(404).json({ message: "Leave request not found" });
    }
    request.status = "APPROVED";
    request.approvedBy = approvedBy ? String(approvedBy).trim() : undefined;
    request.reviewedBy = req.user?.name || req.user?.email || "";
    request.reviewedAt = new Date();
    request.reviewNote = reviewNote ? String(reviewNote).trim() : undefined;

    const year = new Date(request.startDate).getFullYear();
    const leaveType = request.leaveTypeId;
    const employee = request.staffId;
    const balance = await LeaveBalance.findOneAndUpdate(
      { employeeId: employee._id, leaveTypeId: leaveType._id, year },
      {
        $setOnInsert: {
          employeeId: employee._id,
          leaveTypeId: leaveType._id,
          year,
          allocated: Number(leaveType.allocationPerYear || leaveType.maxDaysPerYear || 0),
          used: 0,
          carryForward: 0,
          remaining: Number(leaveType.allocationPerYear || leaveType.maxDaysPerYear || 0),
          lastUpdated: new Date(),
        },
      },
      { upsert: true, new: true }
    );
    const usedDays = Number(request.totalDays || request.days || 0);
    balance.used = Number(balance.used || 0) + usedDays;
    balance.remaining = Math.max(
      0,
      Number(balance.allocated || 0) + Number(balance.carryForward || 0) - Number(balance.used || 0)
    );
    balance.lastUpdated = new Date();
    await balance.save();

    const dates = betweenDates(request.startDate, request.endDate);
    let autoMarkedAttendance = false;
    for (const day of dates) {
      const monthKey = day.toISOString().slice(0, 7);
      const calendar = await WorkCalendar.findOne({ month: monthKey });
      if (!isWorkingDate(day, calendar)) continue;
      await Attendance.findOneAndUpdate(
        { staffId: employee._id, date: toDateString(day) },
        {
          staffId: employee._id,
          employeeId: employee.employeeId || String(employee._id),
          employeeName: employee.fullName,
          department: String(employee.departmentId || ""),
          role: employee.roleName || "",
          date: toDateString(day),
          month: day.getMonth() + 1,
          year: day.getFullYear(),
          status: "on-leave",
          notes: request.reason || request.notes || "",
          leaveTypeId: leaveType._id,
          leaveTypeName: leaveType.name,
          markedBy: req.user?.name || req.user?.email || "",
          markedAt: new Date(),
          source: "auto-leave",
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      autoMarkedAttendance = true;
    }
    request.autoMarkedAttendance = autoMarkedAttendance;
    const updated = await request.save();
    if (!updated) {
      return res.status(404).json({ message: "Leave request not found" });
    }
    await logAudit({
      req,
      action: "approve",
      entity: "leave",
      entityId: updated._id,
      entityDescription: `${updated.employeeName || ""} ${updated.leaveTypeName || ""}`,
    });
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
};

export const rejectLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid request id" });
    }
    const updated = await LeaveRequest.findByIdAndUpdate(
      id,
      {
        status: "REJECTED",
        reviewedBy: req.user?.name || req.user?.email || "",
        reviewedAt: new Date(),
      },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "Leave request not found" });
    }
    await logAudit({
      req,
      action: "reject",
      entity: "leave",
      entityId: updated._id,
      entityDescription: `${updated.employeeName || ""} ${updated.leaveTypeName || ""}`,
    });
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
};

export const listLeaveBalances = async (req, res, next) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const rows = await LeaveBalance.find({ year })
      .populate("employeeId", "fullName employmentType departmentId")
      .populate("leaveTypeId", "name");
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

export const adjustLeaveBalance = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid balance id" });
    const row = await LeaveBalance.findById(id);
    if (!row) return res.status(404).json({ message: "Balance not found" });
    const allocated = req.body.allocated !== undefined ? Number(req.body.allocated) : row.allocated;
    const used = req.body.used !== undefined ? Number(req.body.used) : row.used;
    const carryForward =
      req.body.carryForward !== undefined ? Number(req.body.carryForward) : row.carryForward;
    row.allocated = Math.max(0, allocated);
    row.used = Math.max(0, used);
    row.carryForward = Math.max(0, carryForward);
    row.remaining = Math.max(0, row.allocated + row.carryForward - row.used);
    row.lastUpdated = new Date();
    await row.save();
    await logAudit({
      req,
      action: "update",
      entity: "leave",
      entityId: row._id,
      entityDescription: "Leave balance adjusted",
    });
    return res.json(row);
  } catch (error) {
    return next(error);
  }
};
