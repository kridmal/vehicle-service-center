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

const hasBaseSalary = (salaryType) =>
  ["FIXED", "PER_DAY", "HYBRID"].includes(
    String(salaryType || "").toUpperCase()
  );

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
    const { staffId, month, year, workingDays, presentDays, halfDays, approvedLeaveDays } =
      req.body;

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
