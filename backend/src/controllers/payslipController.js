import mongoose from "mongoose";
import Payslip from "../models/Payslip.js";
import Attendance from "../models/Attendance.js";
import JobCard from "../models/JobCard.js";
import Staff from "../models/Staff.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeMonth = (value) => {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
};

const normalizeYear = (value) => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 ? year : null;
};

const COMPLETED_STATUSES = ["COMPLETED", "CLOSED"];

const startOfMonth = (year, month) => new Date(year, month - 1, 1);
const startOfNextMonth = (year, month) => new Date(year, month, 1);

export const createPayslip = async (req, res, next) => {
  try {
    const {
      staffId,
      month,
      year,
      adjustments = {},
      status,
    } = req.body;

    if (!staffId || !isValidId(staffId)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }

    const normalizedMonth = normalizeMonth(month);
    const normalizedYear = normalizeYear(year);
    if (!normalizedMonth || !normalizedYear) {
      return res.status(400).json({ message: "Invalid month or year" });
    }

    const existing = await Payslip.findOne({
      staffId,
      month: normalizedMonth,
      year: normalizedYear,
    });
    if (existing) {
      return res.status(409).json({ message: "Payslip already exists" });
    }

    const staff = await Staff.findById(staffId);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const attendance = await Attendance.findOne({
      staffId,
      month: normalizedMonth,
      year: normalizedYear,
      date: { $exists: false },
    });
    const attendanceRequired = ["FIXED", "PER_DAY", "HYBRID"].includes(
      String(staff.salaryType || "").toUpperCase()
    );
    if (attendanceRequired && !attendance) {
      return res
        .status(400)
        .json({ message: "Attendance not marked for this period" });
    }

    const normalizedSalaryType = String(staff.salaryType || "").toUpperCase();
    const isPerDay = normalizedSalaryType === "PER_DAY";
    const workingDays = toNumber(attendance?.workingDays);
    const presentDays = toNumber(attendance?.presentDays);
    const halfDays = toNumber(attendance?.halfDays);
    const approvedLeaveDays = toNumber(attendance?.approvedLeaveDays);
    const lopDays = isPerDay ? 0 : toNumber(attendance?.lopDays);
    const lopAmount = isPerDay ? 0 : toNumber(attendance?.lopAmount);
    const perDayRate = toNumber(staff.perDayRate);
    const commissionPercentage = toNumber(staff.commissionPercentage);
    const baseSalary = toNumber(staff.basicSalary);

    const rangeStart = startOfMonth(normalizedYear, normalizedMonth);
    const rangeEnd = startOfNextMonth(normalizedYear, normalizedMonth);
    const jobCards = await JobCard.find({
      status: { $in: COMPLETED_STATUSES },
      createdAt: { $gte: rangeStart, $lt: rangeEnd },
    });
    let completedJobs = 0;
    let laborTotal = 0;
    jobCards.forEach((job) => {
      const assignments = Array.isArray(job.assignedWorkers)
        ? job.assignedWorkers
        : [];
      if (assignments.length === 0) return;
      const hasMatch = assignments.some((entry) => {
        const entryId = String(entry?.staffId || entry?.workerId || "");
        return entryId && entryId === String(staffId);
      });
      if (!hasMatch) return;
      completedJobs += 1;
      const laborCharges = toNumber(job.laborCharges);
      const split = laborCharges / assignments.length;
      laborTotal += split;
    });

    const commissionAmount = (commissionPercentage / 100) * laborTotal;
    let grossSalary = 0;
    const baseAfterLop = Math.max(0, baseSalary - lopAmount);
    switch (normalizedSalaryType) {
      case "PER_DAY":
        if (perDayRate <= 0) {
          return res.status(400).json({
            message: "Per day rate is required for PER_DAY",
          });
        }
        grossSalary = presentDays * perDayRate + halfDays * perDayRate * 0.5;
        break;
      case "COMMISSION":
        grossSalary = commissionAmount;
        break;
      case "HYBRID":
        grossSalary = baseAfterLop + commissionAmount;
        break;
      default:
        grossSalary = baseAfterLop;
        break;
    }

    const normalizedAdjustments = {
      bonus: toNumber(adjustments.bonus),
      advance: toNumber(adjustments.advance),
      penalties: toNumber(adjustments.penalties),
      other: toNumber(adjustments.other),
    };

    const totalDeductions =
      normalizedAdjustments.advance +
      normalizedAdjustments.penalties +
      normalizedAdjustments.other;

    const netSalary = Math.max(
      0,
      grossSalary + normalizedAdjustments.bonus - totalDeductions
    );

    const earnings = {
      baseSalary: grossSalary,
      laborShare: 0,
      commission: commissionAmount,
      bonus: normalizedAdjustments.bonus,
    };

    const deductions = {
      advance: normalizedAdjustments.advance,
      penalties: normalizedAdjustments.penalties,
      other: normalizedAdjustments.other,
    };

    const payslip = await Payslip.create({
      staffId,
      staffSnapshot: {
        name: staff.fullName,
        roleName: staff.roleName || staff.role || "",
        salaryType: staff.salaryType || "",
      },
      month: normalizedMonth,
      year: normalizedYear,
      workingDays,
      perDayRate,
      presentDays,
      halfDays,
      approvedLeaveDays,
      lopDays,
      lopAmount,
      completedJobs,
      earnings,
      adjustments: normalizedAdjustments,
      deductions,
      grossSalary,
      netSalary,
      status: status === "PAID" ? "PAID" : "UNPAID",
    });

    return res.status(201).json(payslip);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Payslip already exists" });
    }
    return next(error);
  }
};

export const listPayslips = async (req, res, next) => {
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
    const payslips = await Payslip.find(filter).sort({ createdAt: -1 });
    return res.json(payslips);
  } catch (error) {
    return next(error);
  }
};

export const markPayslipPaid = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid payslip id" });
    }
    const payslip = await Payslip.findById(id);
    if (!payslip) {
      return res.status(404).json({ message: "Payslip not found" });
    }
    if (payslip.status === "PAID") {
      return res.json(payslip);
    }
    payslip.status = "PAID";
    const saved = await payslip.save();
    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};
