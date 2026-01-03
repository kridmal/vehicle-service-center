import mongoose from "mongoose";
import LaborHourEntry from "../models/LaborHourEntry.js";
import MonthlySummary from "../models/MonthlySummary.js";
import PayrollRun from "../models/PayrollRun.js";
import Staff from "../models/Staff.js";
import Payslip from "../models/Payslip.js";

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

const startOfMonth = (year, month) => new Date(year, month - 1, 1);
const startOfNextMonth = (year, month) => new Date(year, month, 1);

const getDefaultIncentivePercentage = () => {
  const value = Number(process.env.DEFAULT_INCENTIVE_PERCENTAGE);
  return Number.isFinite(value) && value >= 0 ? value : 0;
};

const isFixedOrHybrid = (salaryType) => {
  const normalized = String(salaryType || "").toUpperCase();
  return normalized === "FIXED" || normalized === "HYBRID";
};

const sumAllowances = (allowances = []) =>
  allowances.reduce((sum, entry) => sum + (Number(entry?.amount) || 0), 0);

export const listPayrollRuns = async (req, res, next) => {
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
    const runs = await PayrollRun.find(filter).sort({ createdAt: -1 });
    return res.json(runs);
  } catch (error) {
    return next(error);
  }
};

export const upsertPayrollRun = async (req, res, next) => {
  try {
    const { staffId, month, year, adjustments = {}, deductions = {}, allowances, otRate } =
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

    const attendance = await MonthlySummary.findOne({
      staffId,
      month: normalizedMonth,
      year: normalizedYear,
    });
    if (!attendance) {
      return res.status(400).json({
        message: "Attendance summary not available for this period",
      });
    }
    if (attendance.status !== "COMPLETED") {
      return res.status(400).json({
        message: "Attendance not approved for payroll.",
      });
    }

    const existingPayslip = await Payslip.findOne({
      staffId,
      month: normalizedMonth,
      year: normalizedYear,
    });
    if (existingPayslip) {
      return res.status(409).json({
        message: "Payroll is locked after payslip generation",
      });
    }

    const existing = await PayrollRun.findOne({
      staffId,
      month: normalizedMonth,
      year: normalizedYear,
    });
    if (existing && existing.status === "FINALIZED") {
      return res.status(409).json({ message: "Payroll is already finalized" });
    }

    const salaryType = String(staff.salaryType || "FIXED").toUpperCase();
    const baseSalary = toNumber(staff.basicSalary);
    const perDayRate = toNumber(staff.perDayRate);
    const allowanceTotal = sumAllowances(staff.allowances);
    const oneOffAllowances = toNumber(allowances?.oneOffTotal ?? allowances);
    const normalizedOtRate = toNumber(otRate);

    const workingDays = toNumber(attendance.workingDays);
    const presentDays = toNumber(attendance.presentDays);
    const halfDays = toNumber(attendance.halfDays);
    const approvedLeaveDays = toNumber(attendance.leaveDays);
    const absentDays = toNumber(attendance.absentDays);
    const lopDays = isFixedOrHybrid(salaryType)
      ? toNumber(attendance.lopDays)
      : 0;
    const lopAmount =
      isFixedOrHybrid(salaryType) ? toNumber(attendance.lopAmount) : 0;

    const rangeStart = startOfMonth(normalizedYear, normalizedMonth);
    const rangeEnd = startOfNextMonth(normalizedYear, normalizedMonth);
    const laborEntries = await LaborHourEntry.find({
      staffId,
      date: { $gte: rangeStart, $lt: rangeEnd },
      $or: [
        { billingType: "BILLABLE" },
        { billingType: { $exists: false } },
        { billingType: null },
      ],
    });

    const jobCardIds = new Set(
      laborEntries.map((entry) => String(entry.jobCardId || ""))
    );
    const completedJobs = Array.from(jobCardIds).filter(Boolean).length;

    const totalLaborHours = laborEntries.reduce(
      (sum, entry) => sum + toNumber(entry.standardLaborHours),
      0
    );
    const laborValue = laborEntries.reduce(
      (sum, entry) =>
        sum + toNumber(entry.standardLaborHours) * toNumber(entry.laborHourRate),
      0
    );
    const targetHours =
      salaryType === "FIXED" ? Math.max(0, workingDays * 8) : 0;
    const extraHours = Math.max(0, totalLaborHours - targetHours);

    const incentiveEligible =
      salaryType === "FIXED" && Boolean(staff.incentiveEligible);
    const incentivePercentage =
      staff.incentivePercentage ?? getDefaultIncentivePercentage();
    const averageRate =
      totalLaborHours > 0 ? laborValue / totalLaborHours : 0;
    const incentiveAmount = incentiveEligible
      ? extraHours * averageRate * (toNumber(incentivePercentage) / 100)
      : 0;

    const attendanceLaborHours = toNumber(attendance.actualLaborHours);
    if (Math.abs(attendanceLaborHours - totalLaborHours) > 0.01) {
      console.warn(
        "Payroll labor hours mismatch",
        JSON.stringify({
          staffId,
          month: normalizedMonth,
          year: normalizedYear,
          payrollHours: totalLaborHours,
          attendanceHours: attendanceLaborHours,
        })
      );
    }

    const totalOtHours = toNumber(attendance.otHours);
    const approvedOtHours = totalOtHours;
    const otAmount = approvedOtHours * normalizedOtRate;

    if (salaryType === "PER_DAY" && perDayRate <= 0) {
      return res.status(400).json({
        message: "Per day rate is required for PER_DAY",
      });
    }

    const perDayEarnings =
      salaryType === "PER_DAY"
        ? (presentDays + halfDays * 0.5) * perDayRate
        : 0;

    const normalizedAdjustments = {
      bonus: toNumber(adjustments.bonus),
    };
    const normalizedDeductions = {
      advance: toNumber(deductions.advance),
      penalties: toNumber(deductions.penalties),
      other: toNumber(deductions.other),
    };

    const allowancesTotal =
      salaryType === "FIXED" ? allowanceTotal + oneOffAllowances : 0;

    const grossSalary =
      salaryType === "FIXED"
        ? baseSalary + allowancesTotal + incentiveAmount + otAmount
        : perDayEarnings + otAmount;

    const totalDeductions =
      normalizedDeductions.advance +
      normalizedDeductions.penalties +
      normalizedDeductions.other +
      lopAmount;

    const netSalary = Math.max(
      0,
      grossSalary - totalDeductions + normalizedAdjustments.bonus
    );

    const update = {
      staffId,
      staffSnapshot: {
        name: staff.fullName,
        roleName: staff.roleName || staff.role || "",
        salaryType: staff.salaryType || "FIXED",
      },
      month: normalizedMonth,
      year: normalizedYear,
      attendanceSummary: {
        workingDays,
        presentDays,
        halfDays,
        approvedLeaveDays,
        absentDays,
        lopDays,
        lopAmount,
      },
      laborSummary: {
        completedJobs,
        totalLaborHours,
        targetHours,
        extraHours,
        laborValue,
        incentivePercentage: toNumber(incentivePercentage),
        incentiveAmount,
      },
      overtimeSummary: {
        totalOtHours,
        approvedOtHours,
        otRate: normalizedOtRate,
        otAmount,
      },
      allowances: {
        recurringTotal: allowanceTotal,
        oneOffTotal: oneOffAllowances,
      },
      adjustments: normalizedAdjustments,
      deductions: normalizedDeductions,
      earnings: {
        baseSalary,
        perDayEarnings,
        incentive: incentiveAmount,
        overtime: otAmount,
        allowances: allowancesTotal,
      },
      grossSalary,
      netSalary,
      status: "DRAFT",
    };

    const payrollRun = await PayrollRun.findOneAndUpdate(
      { staffId, month: normalizedMonth, year: normalizedYear },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json(payrollRun);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Payroll run already exists" });
    }
    return next(error);
  }
};

export const finalizePayrollRun = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid payroll id" });
    }
    const payrollRun = await PayrollRun.findById(id);
    if (!payrollRun) {
      return res.status(404).json({ message: "Payroll run not found" });
    }
    if (payrollRun.status === "FINALIZED") {
      return res.json(payrollRun);
    }
    payrollRun.status = "FINALIZED";
    payrollRun.finalizedAt = new Date();
    const saved = await payrollRun.save();

    await MonthlySummary.findOneAndUpdate(
      {
        staffId: payrollRun.staffId,
        month: payrollRun.month,
        year: payrollRun.year,
        status: "COMPLETED",
      },
      { $set: { status: "LOCKED" } }
    );

    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};
