import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import Payroll from "../models/Payroll.js";
import SalaryConfig from "../models/SalaryConfig.js";
import Staff from "../models/Staff.js";
import WorkCalendar from "../models/WorkCalendar.js";
import { logAudit } from "../utils/audit.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const parseMonth = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { monthKey: `${year}-${String(month).padStart(2, "0")}`, year, month };
};

const sumLine = (rows = []) =>
  rows
    .filter((entry) => entry && entry.isActive !== false)
    .reduce((acc, row) => acc + Number(row.amount || 0), 0);

const countByStatus = (rows, status) =>
  rows.filter((row) => String(row.status) === status).length;

const buildAttendanceSummary = ({ dailyRows, workingDays }) => {
  const present = countByStatus(dailyRows, "present");
  const late = countByStatus(dailyRows, "late");
  const half = countByStatus(dailyRows, "half-day");
  const leave = countByStatus(dailyRows, "on-leave");
  const presentDays = present + late;
  const paidLeaveDays = leave;
  const payableEquivalent = presentDays + paidLeaveDays + half * 0.5;
  const absentDays = Math.max(0, Number(workingDays || 0) - payableEquivalent);
  return {
    workingDays: Number(workingDays || 0),
    presentDays,
    absentDays,
    leaveDays: leave,
    lopDays: absentDays,
    halfDays: half,
    lateDays: late,
    paidLeaveDays,
  };
};

const calculatePayroll = ({ employee, config, summary }) => {
  const salaryModel =
    config?.salaryModel ||
    (String(employee.salaryType || "").toUpperCase() === "PER_DAY" ? "daily" : "fixed");
  const effectiveWorkingDays = Math.max(1, Number(summary.workingDays || 0));
  const basicSalary = Number(config?.basicSalary ?? employee.basicSalary ?? 0);
  const dailyRate =
    salaryModel === "daily"
      ? Number(config?.dailyRate ?? employee.perDayRate ?? 0)
      : basicSalary / effectiveWorkingDays;

  const allowances = Array.isArray(config?.allowances) ? config.allowances : [];
  const deductions = Array.isArray(config?.deductions) ? config.deductions : [];
  const allowanceTotal = sumLine(allowances);
  const deductionTotal = sumLine(deductions);
  const lopDeduction =
    salaryModel === "daily" ? 0 : Number(dailyRate) * Number(summary.lopDays || 0);
  const halfDayDeduction =
    salaryModel === "daily" ? 0 : Number(dailyRate) * 0.5 * Number(summary.halfDays || 0);

  const dailyPayableDays =
    Number(summary.presentDays || 0) +
    Number(summary.paidLeaveDays || 0) +
    Number(summary.halfDays || 0) * 0.5;
  const earningsBase =
    salaryModel === "daily" ? Number(dailyRate) * dailyPayableDays : basicSalary;
  const grossEarnings = earningsBase + allowanceTotal;
  const totalDeductions = lopDeduction + halfDayDeduction + deductionTotal;
  const netSalary = Math.max(0, grossEarnings - totalDeductions);

  return {
    salaryModel,
    dailyRate,
    earnings: {
      basicSalary: earningsBase,
      allowances: allowances.map((row) => ({
        name: row.name,
        amount: Number(row.amount || 0),
      })),
      grossEarnings,
    },
    deductions: {
      lopDeduction,
      halfDayDeduction,
      otherDeductions: deductions.map((row) => ({
        name: row.name,
        amount: Number(row.amount || 0),
      })),
      totalDeductions,
    },
    netSalary,
  };
};

export const listPayroll = async (req, res, next) => {
  try {
    const month = req.query.month ? String(req.query.month) : "";
    const filter = month ? { month } : {};
    if (req.query.employeeId) {
      if (!isValidId(req.query.employeeId)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      filter.employeeId = req.query.employeeId;
    }
    const rows = await Payroll.find(filter).sort({ generatedAt: -1 });
    const grouped = rows.reduce((acc, row) => {
      const key = row.month;
      if (!acc[key]) {
        acc[key] = {
          month: key,
          totalEmployees: 0,
          totalNetSalary: 0,
          totalPaid: 0,
          statuses: {},
        };
      }
      acc[key].totalEmployees += 1;
      acc[key].totalNetSalary += Number(row.netSalary || 0);
      if (row.status === "paid") acc[key].totalPaid += Number(row.netSalary || 0);
      acc[key].statuses[row.status] = (acc[key].statuses[row.status] || 0) + 1;
      return acc;
    }, {});
    return res.json({ records: rows, runs: Object.values(grouped) });
  } catch (error) {
    return next(error);
  }
};

export const generatePayroll = async (req, res, next) => {
  try {
    const monthInfo = parseMonth(req.body.month);
    if (!monthInfo) return res.status(400).json({ message: "Invalid month" });

    const [employees, calendar] = await Promise.all([
      Staff.find({ active: { $ne: false }, status: { $ne: "inactive" } }),
      WorkCalendar.findOne({ month: monthInfo.monthKey }),
    ]);
    if (!calendar) {
      return res.status(400).json({ message: "Work Calendar not configured for this month" });
    }
    const fromDate = `${monthInfo.monthKey}-01`;
    const toDate = `${monthInfo.monthKey}-31`;

    const results = [];
    for (const employee of employees) {
      const [dailyRows, config] = await Promise.all([
        Attendance.find({
          staffId: employee._id,
          date: { $gte: fromDate, $lte: toDate },
        }),
        SalaryConfig.findOne({ employeeId: employee._id }),
      ]);
      const summary = buildAttendanceSummary({
        dailyRows,
        workingDays: calendar.effectiveWorkingDays,
      });
      const computed = calculatePayroll({ employee, config, summary });
      const row = await Payroll.findOneAndUpdate(
        { employeeId: employee._id, month: monthInfo.monthKey },
        {
          employeeId: employee._id,
          employeeName: employee.fullName,
          month: monthInfo.monthKey,
          year: monthInfo.year,
          generatedAt: new Date(),
          generatedBy: req.user?.name || req.user?.email || "",
          attendanceSummary: summary,
          earnings: computed.earnings,
          deductions: computed.deductions,
          netSalary: computed.netSalary,
          status: "draft",
          isLocked: false,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      results.push(row);
    }
    await logAudit({
      req,
      action: "create",
      entity: "payroll",
      entityId: monthInfo.monthKey,
      entityDescription: `Payroll generated for ${monthInfo.monthKey}`,
    });
    return res.json({ records: results });
  } catch (error) {
    return next(error);
  }
};

export const updatePayrollLineItems = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid payroll id" });
    const row = await Payroll.findById(id);
    if (!row) return res.status(404).json({ message: "Payroll not found" });
    if (row.isLocked) return res.status(409).json({ message: "Payroll is locked" });

    const oneTimeAllowances = Array.isArray(req.body.oneTimeAllowances)
      ? req.body.oneTimeAllowances
      : row.oneTimeAllowances || [];
    const oneTimeDeductions = Array.isArray(req.body.oneTimeDeductions)
      ? req.body.oneTimeDeductions
      : row.oneTimeDeductions || [];
    const overrideNet = req.body.overrideNet !== undefined ? Number(req.body.overrideNet) : null;

    const addAllowances = oneTimeAllowances.reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0
    );
    const addDeductions = oneTimeDeductions.reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0
    );
    const computedNet = Math.max(
      0,
      Number(row.earnings?.grossEarnings || 0) +
        addAllowances -
        Number(row.deductions?.totalDeductions || 0) -
        addDeductions
    );
    row.oneTimeAllowances = oneTimeAllowances;
    row.oneTimeDeductions = oneTimeDeductions;
    row.netSalary = overrideNet !== null ? Math.max(0, overrideNet) : computedNet;
    await row.save();
    await logAudit({
      req,
      action: "update",
      entity: "payroll",
      entityId: row._id,
      entityDescription: `Payroll adjusted: ${row.employeeName} ${row.month}`,
    });
    return res.json(row);
  } catch (error) {
    return next(error);
  }
};

export const approvePayroll = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid payroll id" });
    const row = await Payroll.findById(id);
    if (!row) return res.status(404).json({ message: "Payroll not found" });

    row.status = "approved";
    row.approvedBy = req.user?.name || req.user?.email || "";
    row.approvedAt = new Date();
    row.isLocked = true;
    await row.save();

    const [year, month] = row.month.split("-").map(Number);
    await Attendance.updateMany(
      {
        staffId: row.employeeId,
        date: { $gte: `${row.month}-01`, $lte: `${row.month}-31` },
      },
      { $set: { isLocked: true, month, year } }
    );
    await logAudit({
      req,
      action: "approve",
      entity: "payroll",
      entityId: row._id,
      entityDescription: `Payroll approved: ${row.employeeName} ${row.month}`,
    });
    return res.json(row);
  } catch (error) {
    return next(error);
  }
};

export const markPayrollPaid = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid payroll id" });
    const row = await Payroll.findById(id);
    if (!row) return res.status(404).json({ message: "Payroll not found" });
    row.status = req.body.partiallyPaid ? "partially-paid" : "paid";
    row.paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();
    row.paymentMethod = req.body.paymentMethod || "";
    row.paymentReference = req.body.paymentReference || "";
    row.paymentNotes = req.body.paymentNotes || "";
    await row.save();
    await logAudit({
      req,
      action: "update",
      entity: "payroll",
      entityId: row._id,
      entityDescription: `Payroll paid: ${row.employeeName} ${row.month}`,
    });
    return res.json(row);
  } catch (error) {
    return next(error);
  }
};

export const unlockPayroll = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid payroll id" });
    const row = await Payroll.findById(id);
    if (!row) return res.status(404).json({ message: "Payroll not found" });
    row.status = "draft";
    row.isLocked = false;
    await row.save();
    await Attendance.updateMany(
      { staffId: row.employeeId, date: { $gte: `${row.month}-01`, $lte: `${row.month}-31` } },
      { $set: { isLocked: false } }
    );
    await logAudit({
      req,
      action: "unlock",
      entity: "payroll",
      entityId: row._id,
      entityDescription: req.body.reason || `Payroll unlocked: ${row.month}`,
    });
    return res.json(row);
  } catch (error) {
    return next(error);
  }
};
