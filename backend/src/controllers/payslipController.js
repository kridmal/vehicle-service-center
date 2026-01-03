import mongoose from "mongoose";
import Payslip from "../models/Payslip.js";
import PayrollRun from "../models/PayrollRun.js";
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

export const createPayslip = async (req, res, next) => {
  try {
    const {
      payrollRunId,
      staffId,
      month,
      year,
      status,
    } = req.body;

    const normalizedMonth = normalizeMonth(month);
    const normalizedYear = normalizeYear(year);

    let payrollRun = null;
    if (payrollRunId) {
      if (!isValidId(payrollRunId)) {
        return res.status(400).json({ message: "Invalid payroll id" });
      }
      payrollRun = await PayrollRun.findById(payrollRunId);
    } else if (staffId && normalizedMonth && normalizedYear) {
      if (!isValidId(staffId)) {
        return res.status(400).json({ message: "Invalid staff id" });
      }
      payrollRun = await PayrollRun.findOne({
        staffId,
        month: normalizedMonth,
        year: normalizedYear,
      });
    }

    if (!payrollRun) {
      return res.status(404).json({ message: "Payroll run not found" });
    }
    if (payrollRun.status !== "FINALIZED") {
      return res
        .status(400)
        .json({ message: "Payroll must be finalized before payslip" });
    }

    const existing = await Payslip.findOne({
      staffId: payrollRun.staffId,
      month: payrollRun.month,
      year: payrollRun.year,
    });
    if (existing) {
      return res.status(409).json({ message: "Payslip already exists" });
    }

    const staff = await Staff.findById(payrollRun.staffId);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const attendance = payrollRun.attendanceSummary || {};
    const laborSummary = payrollRun.laborSummary || {};
    const overtimeSummary = payrollRun.overtimeSummary || {};

    const payslip = await Payslip.create({
      staffId: payrollRun.staffId,
      payrollRunId: payrollRun._id,
      staffSnapshot: {
        name: payrollRun.staffSnapshot?.name || staff.fullName,
        roleName: payrollRun.staffSnapshot?.roleName || staff.roleName || "",
        salaryType: payrollRun.staffSnapshot?.salaryType || staff.salaryType || "",
      },
      month: payrollRun.month,
      year: payrollRun.year,
      workingDays: toNumber(attendance.workingDays),
      perDayRate: toNumber(staff.perDayRate),
      presentDays: toNumber(attendance.presentDays),
      halfDays: toNumber(attendance.halfDays),
      approvedLeaveDays: toNumber(attendance.approvedLeaveDays),
      lopDays: toNumber(attendance.lopDays),
      lopAmount: toNumber(attendance.lopAmount),
      completedJobs: toNumber(laborSummary.completedJobs),
      earnings: {
        baseSalary: toNumber(payrollRun.earnings?.baseSalary),
        perDayEarnings: toNumber(payrollRun.earnings?.perDayEarnings),
        incentive: toNumber(payrollRun.earnings?.incentive),
        overtime: toNumber(payrollRun.earnings?.overtime),
        allowances: toNumber(payrollRun.earnings?.allowances),
        bonus: toNumber(payrollRun.adjustments?.bonus),
      },
      adjustments: payrollRun.adjustments,
      deductions: payrollRun.deductions,
      grossSalary: toNumber(payrollRun.grossSalary),
      netSalary: toNumber(payrollRun.netSalary),
      laborSummary: {
        completedJobs: toNumber(laborSummary.completedJobs),
        totalLaborHours: toNumber(laborSummary.totalLaborHours),
        targetHours: toNumber(laborSummary.targetHours),
        extraHours: toNumber(laborSummary.extraHours),
        incentiveAmount: toNumber(laborSummary.incentiveAmount),
      },
      overtimeSummary: {
        approvedOtHours: toNumber(overtimeSummary.approvedOtHours),
        otRate: toNumber(overtimeSummary.otRate),
        otAmount: toNumber(overtimeSummary.otAmount),
      },
      allowances: payrollRun.allowances,
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
