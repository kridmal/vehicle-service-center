import mongoose from "mongoose";
import DailyAttendance from "../models/DailyAttendance.js";
import LaborHourEntry from "../models/LaborHourEntry.js";
import MonthlySummary from "../models/MonthlySummary.js";
import Staff from "../models/Staff.js";
import WorkCalendar from "../models/WorkCalendar.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizeMonth = (value) => {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
};

const normalizeYear = (value) => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 ? year : null;
};

const startOfMonth = (year, month) => new Date(year, month - 1, 1);
const startOfNextMonth = (year, month) => new Date(year, month, 1);

const toMonthKey = (year, month) =>
  `${year}-${String(month).padStart(2, "0")}`;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseTimeToMinutes = (value) => {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const standardHoursPerDay = () => {
  const value = Number(process.env.STANDARD_HOURS_PER_DAY);
  return Number.isFinite(value) && value > 0 ? value : 8;
};

const isFixedOrHybrid = (salaryType) => {
  const normalized = String(salaryType || "").toUpperCase();
  return normalized === "FIXED" || normalized === "HYBRID";
};

export const listMonthlySummaries = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.staffId) {
      if (!isValidId(req.query.staffId)) {
        return res.status(400).json({ message: "Invalid staff id" });
      }
      filter.staffId = req.query.staffId;
    }
    if (req.query.month) {
      const month = normalizeMonth(req.query.month);
      if (!month) {
        return res.status(400).json({ message: "Invalid month" });
      }
      filter.month = month;
    }
    if (req.query.year) {
      const year = normalizeYear(req.query.year);
      if (!year) {
        return res.status(400).json({ message: "Invalid year" });
      }
      filter.year = year;
    }

    const summaries = await MonthlySummary.find(filter).sort({ createdAt: -1 });
    return res.json(summaries);
  } catch (error) {
    return next(error);
  }
};

export const loadMonthlySummaryData = async (req, res, next) => {
  try {
    const month = normalizeMonth(req.body.month ?? req.query.month);
    const year = normalizeYear(req.body.year ?? req.query.year);
    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required" });
    }

    const staffList = await Staff.find({ active: true });
    const staffIds = staffList.map((staff) => staff._id);
    if (staffIds.length === 0) {
      return res.json({ updated: 0, skipped: 0 });
    }

    const calendarKey = toMonthKey(year, month);
    const calendar = await WorkCalendar.findOne({ month: calendarKey });
    if (!calendar) {
      return res.status(400).json({
        message:
          "Working days not configured for this month. Please set work calendar first.",
      });
    }

    const rangeStart = startOfMonth(year, month);
    const rangeEnd = startOfNextMonth(year, month);

    const attendanceAgg = await DailyAttendance.aggregate([
      { $match: { date: { $gte: rangeStart, $lt: rangeEnd } } },
      {
        $group: {
          _id: "$staffId",
          workingDays: { $sum: 1 },
          presentDays: {
            $sum: {
              $cond: [{ $eq: ["$attendanceType", "WORK_FULL"] }, 1, 0],
            },
          },
          halfDays: {
            $sum: {
              $cond: [{ $eq: ["$attendanceType", "WORK_HALF"] }, 1, 0],
            },
          },
          leaveFull: {
            $sum: {
              $cond: [{ $eq: ["$attendanceType", "LEAVE_FULL"] }, 1, 0],
            },
          },
          leaveHalf: {
            $sum: {
              $cond: [{ $eq: ["$attendanceType", "LEAVE_HALF"] }, 1, 0],
            },
          },
          absentDays: {
            $sum: { $cond: [{ $eq: ["$attendanceType", "ABSENT"] }, 1, 0] },
          },
        },
      },
    ]);

    const attendanceEntries = await DailyAttendance.find({
      date: { $gte: rangeStart, $lt: rangeEnd },
      inTime: { $ne: null },
      outTime: { $ne: null },
    }).select("staffId inTime outTime");

    const otHoursByStaff = new Map();
    const standardDayHours =
      Number(calendar.standardHoursPerDay) || standardHoursPerDay();
    attendanceEntries.forEach((entry) => {
      const staffKey = String(entry.staffId);
      const startMinutes = parseTimeToMinutes(entry.inTime);
      const endMinutes = parseTimeToMinutes(entry.outTime);
      if (startMinutes === null || endMinutes === null) return;
      if (endMinutes <= startMinutes) return;
      const totalHours = (endMinutes - startMinutes) / 60;
      const otHours = Math.max(0, totalHours - standardDayHours);
      if (otHours <= 0) return;
      otHoursByStaff.set(
        staffKey,
        (otHoursByStaff.get(staffKey) || 0) + otHours
      );
    });

    const laborAgg = await LaborHourEntry.aggregate([
      {
        $match: {
          date: { $gte: rangeStart, $lt: rangeEnd },
          $or: [
            { billingType: "BILLABLE" },
            { billingType: { $exists: false } },
            { billingType: null },
          ],
        },
      },
      {
        $group: {
          _id: "$staffId",
          actualLaborHours: { $sum: "$standardLaborHours" },
        },
      },
    ]);

    const attendanceMap = new Map(
      attendanceAgg.map((entry) => [String(entry._id), entry])
    );
    const laborMap = new Map(
      laborAgg.map((entry) => [String(entry._id), entry])
    );

    const existingSummaries = await MonthlySummary.find({
      staffId: { $in: staffIds },
      month,
      year,
    }).select("staffId status attendanceStatus");
    const existingMap = new Map(
      existingSummaries.map((summary) => [
        String(summary.staffId),
        summary,
      ])
    );

    const operations = [];
    let skipped = 0;

    staffList.forEach((staff) => {
      const key = String(staff._id);
      const existing = existingMap.get(key);
      if (
        existing &&
        ["PENDING", "COMPLETED", "LOCKED", "FINALIZED", "PAID"].includes(
          existing.status
        )
      ) {
        skipped += 1;
        return;
      }

      const attendance = attendanceMap.get(key);
      const labor = laborMap.get(key);

      const workingDays = toNumber(calendar.workingDays);
      const presentDays = toNumber(attendance?.presentDays);
      const halfDays = toNumber(attendance?.halfDays);
      const leaveDays =
        toNumber(attendance?.leaveFull) + toNumber(attendance?.leaveHalf) * 0.5;
      const absentDays = toNumber(attendance?.absentDays);

      const actualLaborHours = toNumber(labor?.actualLaborHours);
      const validLaborHours =
        workingDays *
        (Number(calendar.standardHoursPerDay) || standardHoursPerDay());
      const incentiveEligibleHours = Math.max(
        actualLaborHours - validLaborHours,
        0
      );
      const otHours = toNumber(otHoursByStaff.get(key));

      const rawLopDays =
        workingDays - presentDays - leaveDays - halfDays * 0.5;
      const lopDays = isFixedOrHybrid(staff.salaryType)
        ? Math.max(rawLopDays, 0)
        : 0;
      const lopAmount =
        isFixedOrHybrid(staff.salaryType) && workingDays > 0
          ? (toNumber(staff.basicSalary) / workingDays) * lopDays
          : 0;

      operations.push({
        updateOne: {
          filter: { staffId: staff._id, month, year },
          update: {
            $set: {
              staffId: staff._id,
              staffName: staff.fullName,
              role: staff.roleName || staff.role || "",
              salaryType: staff.salaryType || "FIXED",
              month,
              year,
              workingDays,
              presentDays,
              halfDays,
              leaveDays,
              absentDays,
              validLaborHours,
              actualLaborHours,
              incentiveEligibleHours,
              otHours,
              lopDays,
              lopAmount,
              attendanceStatus: "DRAFT",
              status: "DRAFT",
              checkedBy: null,
              checkedAt: null,
              confirmedBy: null,
              confirmedAt: null,
            },
          },
          upsert: true,
        },
      });
    });

    if (operations.length > 0) {
      await MonthlySummary.bulkWrite(operations);
    }

    return res.json({
      updated: operations.length,
      skipped,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateMonthlySummaryStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid summary id" });
    }

    const nextStatus = String(req.body.status || "").toUpperCase();
    if (!["FINALIZED", "PAID"].includes(nextStatus)) {
      return res.status(400).json({ message: "Invalid status update" });
    }

    const summary = await MonthlySummary.findById(id);
    if (!summary) {
      return res.status(404).json({ message: "Summary not found" });
    }

    const allowedTransitions = {
      DRAFT: ["FINALIZED"],
      FINALIZED: ["PAID"],
      PAID: [],
    };

    const allowed = allowedTransitions[summary.status] || [];
    if (!allowed.includes(nextStatus)) {
      return res.status(409).json({ message: "Invalid status transition" });
    }

    summary.status = nextStatus;
    const saved = await summary.save();
    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};

export const checkMonthlyAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid summary id" });
    }

    const summary = await MonthlySummary.findById(id);
    if (!summary) {
      return res.status(404).json({ message: "Summary not found" });
    }

    if (summary.status !== "DRAFT") {
      return res.status(409).json({
        message: "Only draft summaries can be checked",
      });
    }

    if (summary.status === "LOCKED") {
      return res.status(409).json({
        message: "Attendance is locked for payroll",
      });
    }

    if (!summary.workingDays || summary.workingDays <= 0) {
      return res.status(400).json({
        message: "Working days must be set before checking attendance",
      });
    }

    const staff = await Staff.findById(summary.staffId);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const workingDays = toNumber(summary.workingDays);
    const presentDays = toNumber(summary.presentDays);
    const halfDays = toNumber(summary.halfDays);
    const leaveDays = toNumber(summary.leaveDays);

    const rawLopDays =
      workingDays - presentDays - leaveDays - halfDays * 0.5;
    const lopDays = isFixedOrHybrid(staff.salaryType)
      ? Math.max(rawLopDays, 0)
      : 0;
    const lopAmount =
      isFixedOrHybrid(staff.salaryType) && workingDays > 0
        ? (toNumber(staff.basicSalary) / workingDays) * lopDays
        : 0;

    summary.status = "PENDING";
    summary.checkedBy = req.user?.id;
    summary.checkedAt = new Date();
    summary.lopDays = lopDays;
    summary.lopAmount = lopAmount;

    const saved = await summary.save();
    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};

export const confirmMonthlyAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid summary id" });
    }

    const summary = await MonthlySummary.findById(id);
    if (!summary) {
      return res.status(404).json({ message: "Summary not found" });
    }

    if (summary.status !== "PENDING") {
      return res.status(409).json({
        message: "Only pending summaries can be confirmed",
      });
    }

    if (summary.status === "LOCKED") {
      return res.status(409).json({
        message: "Attendance is locked for payroll",
      });
    }

    summary.status = "COMPLETED";
    summary.confirmedBy = req.user?.id;
    summary.confirmedAt = new Date();

    const saved = await summary.save();
    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};
