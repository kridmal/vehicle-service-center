import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import Payslip from "../models/Payslip.js";
import Staff from "../models/Staff.js";

const DEFAULT_WORKING_DAYS = 26;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizeMonth = (value) => {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
};

const normalizeYear = (value) => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 ? year : null;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeCount = (value) => Math.max(0, Math.floor(toNumber(value)));

const normalizeWorkingDays = (value) => {
  const parsed = Math.floor(toNumber(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WORKING_DAYS;
  }
  return parsed;
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

const normalizeDailyEntries = (entries = []) =>
  entries
    .map((entry) => {
      const date = String(entry?.date || "").trim();
      const workStart = String(entry?.workStart || "").trim();
      const workEnd = String(entry?.workEnd || "").trim();
      const startMinutes = parseTimeToMinutes(workStart);
      const endMinutes = parseTimeToMinutes(workEnd);
      if (!date || startMinutes === null || endMinutes === null) return null;
      if (endMinutes <= startMinutes) return null;
      const workHours = (endMinutes - startMinutes) / 60;
      const otHours = Math.max(0, workHours - 8);
      return {
        date,
        workStart,
        workEnd,
        otHours,
        otApproved: Boolean(entry?.otApproved),
      };
    })
    .filter(Boolean);

const hasBaseSalary = (salaryType) =>
  ["FIXED", "PER_DAY"].includes(String(salaryType || "").toUpperCase());

export const listAttendance = async (req, res, next) => {
  try {
    const month = normalizeMonth(req.query.month);
    const year = normalizeYear(req.query.year);
    const staffId = req.query.staffId;

    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required" });
    }

    const filter = { month, year };
    if (staffId) {
      if (!isValidId(staffId)) {
        return res.status(400).json({ message: "Invalid staff id" });
      }
      filter.staffId = staffId;
    }

    const [records, payslips] = await Promise.all([
      Attendance.find(filter).sort({ createdAt: -1 }),
      Payslip.find({ month, year }, "staffId"),
    ]);

    const lockedStaffIds = payslips.map((entry) => String(entry.staffId));

    return res.json({ records, lockedStaffIds });
  } catch (error) {
    return next(error);
  }
};

export const upsertAttendance = async (req, res, next) => {
  try {
    const {
      staffId,
      month,
      year,
      workingDays,
      presentDays,
      halfDays,
      approvedLeaveDays,
      dailyEntries,
    } = req.body;

    if (!staffId || !isValidId(staffId)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }

    const normalizedMonth = normalizeMonth(month);
    const normalizedYear = normalizeYear(year);
    if (!normalizedMonth || !normalizedYear) {
      return res.status(400).json({ message: "Invalid month or year" });
    }

    const staff = await Staff.findById(staffId);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    if (!hasBaseSalary(staff.salaryType)) {
      return res
        .status(400)
        .json({ message: "Attendance not required for this salary type" });
    }

    const locked = await Payslip.findOne({
      staffId,
      month: normalizedMonth,
      year: normalizedYear,
    });
    if (locked) {
      return res
        .status(409)
        .json({ message: "Attendance is locked for this period" });
    }

    const normalizedWorkingDays = normalizeWorkingDays(workingDays);
    const normalizedPresentDays = normalizeCount(presentDays);
    const normalizedHalfDays = normalizeCount(halfDays);
    const normalizedLeaveDays = normalizeCount(approvedLeaveDays);

    const totalDays =
      normalizedPresentDays + normalizedLeaveDays + normalizedHalfDays * 0.5;
    if (totalDays > normalizedWorkingDays) {
      return res.status(400).json({
        message: "Total days cannot exceed working days",
      });
    }

    const normalizedSalaryType = String(staff.salaryType || "").toUpperCase();
    const isPerDay = normalizedSalaryType === "PER_DAY";
    const absentDays = isPerDay
      ? 0
      : Math.max(0, normalizedWorkingDays - totalDays);
    const lopDays = isPerDay ? 0 : Math.max(0, absentDays);
    const baseSalary = toNumber(staff.basicSalary);
    const perDayValue =
      normalizedWorkingDays > 0 ? baseSalary / normalizedWorkingDays : 0;
    const isFixedSalary = ["FIXED", "HYBRID"].includes(normalizedSalaryType);
    const lopAmount = !isPerDay && isFixedSalary ? lopDays * perDayValue : 0;

    const existingRecord = await Attendance.findOne({
      staffId,
      month: normalizedMonth,
      year: normalizedYear,
    });
    const normalizedDailyEntries = Array.isArray(dailyEntries)
      ? normalizeDailyEntries(dailyEntries)
      : Array.isArray(existingRecord?.dailyEntries)
      ? existingRecord.dailyEntries
      : [];
    const totalOtHours = normalizedDailyEntries.reduce(
      (sum, entry) => sum + (Number(entry.otHours) || 0),
      0
    );
    const approvedOtHours = normalizedDailyEntries.reduce(
      (sum, entry) =>
        sum + (entry.otApproved ? Number(entry.otHours) || 0 : 0),
      0
    );

    const update = {
      staffId,
      staffSnapshot: {
        name: staff.fullName,
        roleName: staff.roleName,
        salaryType: staff.salaryType,
      },
      salaryType: staff.salaryType,
      month: normalizedMonth,
      year: normalizedYear,
      workingDays: normalizedWorkingDays,
      presentDays: normalizedPresentDays,
      halfDays: normalizedHalfDays,
      approvedLeaveDays: normalizedLeaveDays,
      absentDays,
      lopDays,
      lopAmount,
      dailyEntries: normalizedDailyEntries,
      otHours: totalOtHours,
      otApprovedHours: approvedOtHours,
    };

    const record = await Attendance.findOneAndUpdate(
      { staffId, month: normalizedMonth, year: normalizedYear },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json(record);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Attendance already exists" });
    }
    return next(error);
  }
};
