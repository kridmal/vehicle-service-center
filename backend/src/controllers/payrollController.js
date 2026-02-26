import mongoose from "mongoose";
import AppSetting from "../models/AppSetting.js";
import Attendance from "../models/Attendance.js";
import AttendanceMonthFinalization from "../models/AttendanceMonthFinalization.js";
import LeaveType from "../models/LeaveType.js";
import Payroll from "../models/Payroll.js";
import PayrollLine from "../models/PayrollLine.js";
import PayrollRun from "../models/PayrollRun.js";
import SalaryConfig from "../models/SalaryConfig.js";
import Staff from "../models/Staff.js";
import StaffAdvance from "../models/StaffAdvance.js";
import WorkCalendarDay from "../models/WorkCalendarDay.js";
import WorkLog from "../models/WorkLog.js";
import { logAudit } from "../utils/audit.js";
import { computePayrollLineTotals, resolveSalaryType, round2 } from "../utils/payrollEngine.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const totalDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

const parseMonthString = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || year < 1900) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
};

const parseYearMonth = ({ month, year }) => {
  const parsedMonthKey = parseMonthString(month);
  if (parsedMonthKey) {
    return {
      ...parsedMonthKey,
      monthKey: `${parsedMonthKey.year}-${String(parsedMonthKey.month).padStart(2, "0")}`,
    };
  }
  const normalizedYear = Number(year);
  const normalizedMonth = Number(month);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 1900) return null;
  if (!Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12) {
    return null;
  }
  return {
    year: normalizedYear,
    month: normalizedMonth,
    monthKey: `${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}`,
  };
};

const isPastMonth = ({ year, month, now = new Date() }) => {
  const value = Number(year) * 100 + Number(month);
  const nowValue = now.getFullYear() * 100 + (now.getMonth() + 1);
  return value < nowValue;
};

const DEFAULT_PAYROLL_SETTINGS = {
  standardDailyHours: 8,
  otRatePerHour: 0,
};

const monthStartDate = ({ year, month }) =>
  new Date(year, month - 1, 1, 0, 0, 0, 0);

const monthEndDate = ({ year, month }) =>
  new Date(year, month, 0, 23, 59, 59, 999);

const monthDateRangeStrings = ({ monthKey }) => ({
  from: `${monthKey}-01`,
  to: `${monthKey}-31`,
});

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePayrollSettings = (value) => {
  const settings = value && typeof value === "object" ? value : {};
  const standardDailyHours = Math.max(
    0,
    toNumber(settings.standardDailyHours || DEFAULT_PAYROLL_SETTINGS.standardDailyHours)
  );
  const otRatePerHour = Math.max(
    0,
    toNumber(settings.otRatePerHour || DEFAULT_PAYROLL_SETTINGS.otRatePerHour)
  );
  return {
    standardDailyHours,
    otRatePerHour,
  };
};

const buildCalendarSummary = (rows = []) => {
  const working = rows.filter((row) => row.isWorkingDay === true);
  const weekendOffDays = rows.filter(
    (row) => row.isWorkingDay === false && String(row.offType || "") === "WEEKEND"
  ).length;
  const holidaysCount = rows.filter(
    (row) => row.isWorkingDay === false && String(row.offType || "") === "PUBLIC"
  ).length;
  return {
    workingDates: working.map((entry) => entry.date),
    workingDaysInMonth: working.length,
    weekendOffDays,
    holidaysCount,
  };
};

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

const isLeaveStatus = (status) => status === "on-leave" || status === "leave";

const classifyAttendanceForStaff = ({ attendanceByDate, workingDates, leavePaidMap }) => {
  const summary = {
    presentDays: 0,
    absentDays: 0,
    leavePaidDays: 0,
    leaveUnpaidDays: 0,
    halfDays: 0,
    unmarkedDays: 0,
  };

  workingDates.forEach((date) => {
    const row = attendanceByDate.get(date);
    if (!row) {
      summary.unmarkedDays += 1;
      return;
    }
    const status = normalizeStatus(row.status);
    if (status === "present" || status === "late") {
      summary.presentDays += 1;
      return;
    }
    if (status === "half-day") {
      summary.halfDays += 1;
      return;
    }
    if (status === "absent") {
      summary.absentDays += 1;
      return;
    }
    if (isLeaveStatus(status)) {
      const explicit = row.isPaidLeave;
      if (typeof explicit === "boolean") {
        if (explicit) summary.leavePaidDays += 1;
        else summary.leaveUnpaidDays += 1;
        return;
      }
      const leaveTypeId = String(row.leaveTypeId || "");
      const isPaid = leaveTypeId ? leavePaidMap.get(leaveTypeId) !== false : true;
      if (isPaid) summary.leavePaidDays += 1;
      else summary.leaveUnpaidDays += 1;
      return;
    }
    summary.unmarkedDays += 1;
  });

  return summary;
};

const buildWorkLogHoursMap = async ({ staffIds = [], monthInfo }) => {
  if (!Array.isArray(staffIds) || staffIds.length === 0) {
    return new Map();
  }
  const range = monthDateRangeStrings(monthInfo);
  const rows = await WorkLog.aggregate([
    {
      $match: {
        staffId: { $in: staffIds },
        date: { $gte: range.from, $lte: range.to },
      },
    },
    {
      $group: {
        _id: "$staffId",
        monthlyLaborHours: { $sum: "$laborHours" },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), round2(row.monthlyLaborHours || 0)]));
};

const rollbackAdvanceDeductionsFromRun = async (runId) => {
  if (!runId) return;
  const lines = await PayrollLine.find({
    payrollRunId: runId,
    "advanceDeduction.advancesApplied.0": { $exists: true },
  }).select("advanceDeduction");
  if (!lines.length) return;

  const adjustmentByAdvanceId = new Map();
  lines.forEach((line) => {
    const applied = Array.isArray(line.advanceDeduction?.advancesApplied)
      ? line.advanceDeduction.advancesApplied
      : [];
    applied.forEach((entry) => {
      const id = String(entry.advanceId || "");
      if (!id) return;
      const value = round2(toNumber(entry.deductedAmount));
      adjustmentByAdvanceId.set(id, round2((adjustmentByAdvanceId.get(id) || 0) + value));
    });
  });

  const advanceIds = Array.from(adjustmentByAdvanceId.keys()).filter((id) => isValidId(id));
  if (!advanceIds.length) return;

  const advances = await StaffAdvance.find({ _id: { $in: advanceIds } });
  const ops = advances
    .map((advance) => {
      const key = String(advance._id);
      const adjustment = adjustmentByAdvanceId.get(key);
      if (!adjustment || adjustment <= 0) return null;
      const nextOutstanding = round2(toNumber(advance.outstandingAmount) + adjustment);
      return {
        updateOne: {
          filter: { _id: advance._id },
          update: {
            $set: {
              outstandingAmount: nextOutstanding,
              status: nextOutstanding > 0 ? "PAID_OUT" : advance.status,
              settledAt: nextOutstanding > 0 ? null : advance.settledAt,
            },
          },
        },
      };
    })
    .filter(Boolean);

  if (ops.length) {
    await StaffAdvance.bulkWrite(ops, { ordered: false });
  }
};

const applyAdvanceDeductions = ({
  staffId,
  grossPay,
  baseTotalDeductions,
  advancesByStaff,
  changedAdvanceIds,
  now,
}) => {
  const applied = [];
  const staffAdvances = advancesByStaff.get(staffId) || [];
  let remainingNet = round2(Math.max(0, toNumber(grossPay) - toNumber(baseTotalDeductions)));
  let advanceDeductionTotal = 0;

  for (const advance of staffAdvances) {
    if (remainingNet <= 0) break;
    if (String(advance.status || "") !== "PAID_OUT") continue;
    const outstanding = round2(toNumber(advance.outstandingAmount));
    if (outstanding <= 0) continue;

    const deductedAmount = round2(Math.min(remainingNet, outstanding));
    if (deductedAmount <= 0) continue;

    remainingNet = round2(Math.max(0, remainingNet - deductedAmount));
    advanceDeductionTotal = round2(advanceDeductionTotal + deductedAmount);
    advance.outstandingAmount = round2(Math.max(0, outstanding - deductedAmount));
    if (advance.outstandingAmount <= 0) {
      advance.outstandingAmount = 0;
      advance.status = "SETTLED";
      advance.settledAt = now;
    }
    changedAdvanceIds.add(String(advance._id));
    applied.push({
      advanceId: advance._id,
      deductedAmount,
    });
  }

  const totalDeductions = round2(toNumber(baseTotalDeductions) + advanceDeductionTotal);
  const netPay = round2(Math.max(0, toNumber(grossPay) - totalDeductions));
  return {
    advancesApplied: applied,
    advanceDeductionTotal: round2(advanceDeductionTotal),
    totalDeductions,
    netPay,
  };
};

const toLegacyRecord = ({ run, line }) => {
  const leaveDays =
    Number(line.attendanceSummary?.leavePaidDays || 0) +
    Number(line.attendanceSummary?.leaveUnpaidDays || 0);
  const status =
    line.paymentStatus === "PAID"
      ? "paid"
      : run.status === "FINALIZED"
      ? "approved"
      : "draft";
  const allowances = [
    { name: "Allowances", amount: Number(line.payComponents?.allowancesTotal || 0) },
  ];
  if (Number(line.payComponents?.otAmount || 0) > 0) {
    allowances.push({
      name: "OT/Incentive",
      amount: Number(line.payComponents?.otAmount || 0),
    });
  }
  const otherDeductions = [
    {
      name: "Fixed Deductions",
      amount: Number(line.deductions?.fixedDeductionsTotal || 0),
    },
  ];
  if (Number(line.deductions?.advanceDeductionTotal || 0) > 0) {
    otherDeductions.push({
      name: "Advance Recovery",
      amount: Number(line.deductions?.advanceDeductionTotal || 0),
    });
  }
  return {
    _id: String(line._id),
    employeeId: line.staffId,
    employeeName: line.staffSnapshot?.name || "",
    month: run.monthKey,
    year: run.year,
    generatedAt: run.generatedAt,
    generatedBy: run.generatedBy,
    attendanceSummary: {
      workingDays: Number(line.calendarSummary?.workingDaysInMonth || 0),
      presentDays: Number(line.attendanceSummary?.presentDays || 0),
      absentDays: Number(line.attendanceSummary?.absentDays || 0),
      leaveDays,
      lopDays: Number(line.deductions?.lopDays || 0),
      halfDays: Number(line.attendanceSummary?.halfDays || 0),
      lateDays: 0,
      paidLeaveDays: Number(line.attendanceSummary?.leavePaidDays || 0),
    },
    earnings: {
      basicSalary: Number(line.payComponents?.basicSalary || 0),
      allowances,
      grossEarnings: Number(line.payComponents?.grossPay || 0),
    },
    deductions: {
      lopDeduction: Number(line.deductions?.lopAmount || 0),
      halfDayDeduction: 0,
      otherDeductions,
      totalDeductions: Number(line.deductions?.totalDeductions || 0),
    },
    oneTimeAllowances: [],
    oneTimeDeductions: [],
    netSalary: Number(line.netPay || 0),
    status,
    isLocked: status !== "draft",
  };
};

const syncLegacyPayroll = async ({ run, lines }) => {
  if (!Array.isArray(lines) || lines.length === 0) return;
  const ops = lines.map((line) => {
    const legacy = toLegacyRecord({ run, line });
    return {
      updateOne: {
        filter: { employeeId: line.staffId, month: run.monthKey },
        update: {
          employeeId: line.staffId,
          employeeName: legacy.employeeName,
          month: run.monthKey,
          year: run.year,
          generatedAt: run.generatedAt,
          generatedBy: run.generatedBy,
          attendanceSummary: legacy.attendanceSummary,
          earnings: legacy.earnings,
          deductions: legacy.deductions,
          oneTimeAllowances: [],
          oneTimeDeductions: [],
          netSalary: legacy.netSalary,
          status: legacy.status,
          isLocked: legacy.isLocked,
        },
        upsert: true,
      },
    };
  });
  await Payroll.bulkWrite(ops, { ordered: false });
};

const summarizeRunsFromLegacy = (rows = []) =>
  Object.values(
    rows.reduce((acc, row) => {
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
      acc[key].statuses[row.status || "draft"] =
        (acc[key].statuses[row.status || "draft"] || 0) + 1;
      return acc;
    }, {})
  );

const updateRunStatusFromLines = async (runId) => {
  const [run, unpaidCount] = await Promise.all([
    PayrollRun.findById(runId),
    PayrollLine.countDocuments({ payrollRunId: runId, paymentStatus: "UNPAID" }),
  ]);
  if (!run) return null;
  run.status = unpaidCount === 0 ? "PAID" : "FINALIZED";
  await run.save();
  return run;
};

export const listPayroll = async (req, res, next) => {
  try {
    const monthInfo = parseYearMonth({ month: req.query.month, year: req.query.year });
    const employeeId = req.query.employeeId ? String(req.query.employeeId) : "";
    if (employeeId && !isValidId(employeeId)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }

    const legacyFilter = {};
    if (monthInfo) legacyFilter.month = monthInfo.monthKey;
    if (employeeId) legacyFilter.employeeId = employeeId;

    const legacyRecords = await Payroll.find(legacyFilter).sort({ generatedAt: -1 });
    const runs = summarizeRunsFromLegacy(legacyRecords);

    let run = null;
    let lines = [];
    if (monthInfo) {
      run = await PayrollRun.findOne({ year: monthInfo.year, month: monthInfo.month });
      if (run) {
        const lineFilter = { payrollRunId: run._id };
        if (employeeId) lineFilter.staffId = employeeId;
        lines = await PayrollLine.find(lineFilter).sort({ "staffSnapshot.name": 1 });
      }
    }

    return res.json({
      records: legacyRecords,
      runs,
      run,
      lines,
    });
  } catch (error) {
    return next(error);
  }
};

export const generatePayroll = async (req, res, next) => {
  try {
    const monthInfo = parseYearMonth({ month: req.body.month, year: req.body.year });
    if (!monthInfo) {
      return res.status(400).json({ message: "Invalid month or year" });
    }
    if (!isPastMonth(monthInfo)) {
      return res
        .status(400)
        .json({ message: "Payroll can be generated after month end." });
    }

    const finalization = await AttendanceMonthFinalization.findOne({
      year: monthInfo.year,
      month: monthInfo.month,
    });
    if (!finalization) {
      return res.status(400).json({
        message:
          "Attendance is not finalized for this month. Please finalize attendance first.",
      });
    }
    const otEnabled = Boolean(req.body.otEnabled);

    const daysInMonth = totalDaysInMonth(monthInfo.year, monthInfo.month);
    const [calendarRows, staffRows] = await Promise.all([
      WorkCalendarDay.find({ year: monthInfo.year, month: monthInfo.month }).sort({ date: 1 }),
      Staff.find({ active: { $ne: false }, status: { $ne: "inactive" } }),
    ]);

    if (!calendarRows.length || calendarRows.length < daysInMonth) {
      return res
        .status(400)
        .json({ message: "Work calendar not generated for this month." });
    }

    const calendarSummary = buildCalendarSummary(calendarRows);
    if (!calendarSummary.workingDates.length) {
      return res.status(400).json({ message: "No working days found for selected month" });
    }

    const existingRun = await PayrollRun.findOne({
      year: monthInfo.year,
      month: monthInfo.month,
    });
    const regenerate = Boolean(req.body.regenerate);
    if (existingRun && !regenerate) {
      return res.status(409).json({
        message:
          "Payroll run already exists for this month. Pass regenerate=true to regenerate draft run.",
      });
    }
    if (existingRun && regenerate && existingRun.status !== "DRAFT") {
      return res.status(409).json({
        message: "Only DRAFT payroll runs can be regenerated.",
      });
    }

    const staffIds = staffRows.map((row) => row._id);
    const monthRange = monthDateRangeStrings(monthInfo);
    const [attendanceRows, salaryConfigs, payrollSettingsRow, workLogHoursMap] = await Promise.all([
      Attendance.find({
        staffId: { $in: staffIds },
        date: {
          $gte: monthRange.from,
          $lte: monthRange.to,
        },
      }).select(
        "staffId date status leaveTypeId leaveTypeName isPaidLeave employeeId employeeName department role"
      ),
      SalaryConfig.find({ employeeId: { $in: staffIds } }),
      AppSetting.findOne({ key: "payrollSettings" }),
      buildWorkLogHoursMap({ staffIds, monthInfo }),
    ]);
    const payrollSettings = normalizePayrollSettings(payrollSettingsRow?.value);

    const leaveTypeIds = Array.from(
      new Set(
        attendanceRows
          .filter((entry) => entry.leaveTypeId)
          .map((entry) => String(entry.leaveTypeId))
      )
    );
    const leaveTypes = leaveTypeIds.length
      ? await LeaveType.find({ _id: { $in: leaveTypeIds } }).select("_id isPaid paid")
      : [];
    const leavePaidMap = new Map(
      leaveTypes.map((entry) => [
        String(entry._id),
        entry.isPaid !== false && entry.paid !== false,
      ])
    );

    const attendanceByStaff = attendanceRows.reduce((acc, row) => {
      const key = String(row.staffId);
      if (!acc[key]) acc[key] = new Map();
      acc[key].set(row.date, row);
      return acc;
    }, {});
    const salaryConfigMap = new Map(
      salaryConfigs.map((entry) => [String(entry.employeeId), entry])
    );

    const unmarkedStaff = [];
    const lineDrafts = staffRows.map((staff) => {
      const staffId = String(staff._id);
      const attendanceSummary = classifyAttendanceForStaff({
        attendanceByDate: attendanceByStaff[staffId] || new Map(),
        workingDates: calendarSummary.workingDates,
        leavePaidMap,
      });
      if (attendanceSummary.unmarkedDays > 0) {
        unmarkedStaff.push({
          staffName: staff.fullName,
          unmarkedDays: attendanceSummary.unmarkedDays,
        });
      }

      const config = salaryConfigMap.get(staffId);
      const salaryType = resolveSalaryType({
        salaryModel: config?.salaryModel,
        staffSalaryType: staff.salaryType,
      });
      const allowances = Array.isArray(config?.allowances) ? config.allowances : [];
      const fixedDeductions = Array.isArray(config?.deductions) ? config.deductions : [];
      const basicSalaryMonthly = Number(config?.basicSalary ?? staff.basicSalary ?? 0);
      const fallbackDailyRate =
        calendarSummary.workingDaysInMonth > 0
          ? basicSalaryMonthly / calendarSummary.workingDaysInMonth
          : 0;
      const dailyRate = Number(config?.dailyRate ?? staff.perDayRate ?? fallbackDailyRate);
      const baseTotals = computePayrollLineTotals({
        salaryType,
        workingDaysInMonth: calendarSummary.workingDaysInMonth,
        presentDays: attendanceSummary.presentDays,
        absentDays: attendanceSummary.absentDays,
        leavePaidDays: attendanceSummary.leavePaidDays,
        leaveUnpaidDays: attendanceSummary.leaveUnpaidDays,
        halfDays: attendanceSummary.halfDays,
        basicSalaryMonthly,
        dailyRate,
        allowances,
        fixedDeductions,
      });
      const monthlyLaborHours = round2(workLogHoursMap.get(staffId) || 0);
      const targetHours = round2(
        calendarSummary.workingDaysInMonth * payrollSettings.standardDailyHours
      );
      const overtimeHours = round2(Math.max(0, monthlyLaborHours - targetHours));
      const otRate = otEnabled
        ? round2(
            Math.max(
              0,
              toNumber(
                staff.otRatePerHourOverride ?? payrollSettings.otRatePerHour
              )
            )
          )
        : 0;
      const otAmount = otEnabled ? round2(overtimeHours * otRate) : 0;
      const grossPay = round2(baseTotals.grossPay + otAmount);
      const baseTotalDeductions = round2(baseTotals.totalDeductions);

      return {
        staff,
        salaryType,
        attendanceSummary,
        totals: {
          basicSalary: baseTotals.basicSalary,
          allowancesTotal: baseTotals.allowancesTotal,
          otAmount,
          grossPay,
          lopDays: baseTotals.lopDays,
          lopAmount: baseTotals.lopAmount,
          fixedDeductionsTotal: baseTotals.fixedDeductionsTotal,
          baseTotalDeductions,
        },
        performance: {
          targetHours,
          monthlyLaborHours,
          overtimeHours,
          otRate,
          otAmount,
        },
      };
    });

    if (unmarkedStaff.length > 0) {
      const sample = unmarkedStaff
        .slice(0, 5)
        .map((entry) => `${entry.staffName} (${entry.unmarkedDays})`)
        .join(", ");
      return res.status(400).json({
        message: `Unmarked working days still exist for month: ${sample}. Finalize attendance first.`,
      });
    }

    let run = existingRun;
    if (!run) {
      run = await PayrollRun.create({
        year: monthInfo.year,
        month: monthInfo.month,
        monthKey: monthInfo.monthKey,
        status: "DRAFT",
        generatedAt: new Date(),
        generatedBy: req.user?.name || req.user?.email || "",
        otEnabled,
        otRatePerHourUsed: payrollSettings.otRatePerHour,
        standardDailyHoursUsed: payrollSettings.standardDailyHours,
        notes: String(req.body.notes || "").trim(),
      });
    } else {
      run.generatedAt = new Date();
      run.generatedBy = req.user?.name || req.user?.email || "";
      run.status = "DRAFT";
      run.otEnabled = otEnabled;
      run.otRatePerHourUsed = payrollSettings.otRatePerHour;
      run.standardDailyHoursUsed = payrollSettings.standardDailyHours;
      run.notes = String(req.body.notes || run.notes || "").trim();
      await run.save();
      await rollbackAdvanceDeductionsFromRun(run._id);
      await PayrollLine.deleteMany({ payrollRunId: run._id });
    }

    const monthEnd = monthEndDate(monthInfo);
    const advanceRows = await StaffAdvance.find({
      staffId: { $in: staffIds },
      status: "PAID_OUT",
      outstandingAmount: { $gt: 0 },
      requestDate: { $lte: monthEnd },
    }).sort({ requestDate: 1, createdAt: 1 });
    const advancesByStaff = new Map();
    advanceRows.forEach((advance) => {
      const key = String(advance.staffId);
      if (!advancesByStaff.has(key)) advancesByStaff.set(key, []);
      advancesByStaff.get(key).push(advance);
    });
    const changedAdvanceIds = new Set();
    const now = new Date();

    const linePayload = lineDrafts.map((entry) => ({
      ...(() => {
        const advance = applyAdvanceDeductions({
          staffId: String(entry.staff._id),
          grossPay: entry.totals.grossPay,
          baseTotalDeductions: entry.totals.baseTotalDeductions,
          advancesByStaff,
          changedAdvanceIds,
          now,
        });
        return {
          payrollRunId: run._id,
          staffId: entry.staff._id,
          staffSnapshot: {
            name: entry.staff.fullName,
            role: entry.staff.roleName || "",
            employeeCode: entry.staff.employeeId || String(entry.staff._id),
          },
          salaryType: entry.salaryType,
          calendarSummary: {
            workingDaysInMonth: calendarSummary.workingDaysInMonth,
            weekendOffDays: calendarSummary.weekendOffDays,
            holidaysCount: calendarSummary.holidaysCount,
          },
          attendanceSummary: {
            presentDays: entry.attendanceSummary.presentDays,
            absentDays: entry.attendanceSummary.absentDays,
            leavePaidDays: entry.attendanceSummary.leavePaidDays,
            leaveUnpaidDays: entry.attendanceSummary.leaveUnpaidDays,
            halfDays: entry.attendanceSummary.halfDays,
            unmarkedDays: entry.attendanceSummary.unmarkedDays,
          },
          payComponents: {
            basicSalary: entry.totals.basicSalary,
            allowancesTotal: entry.totals.allowancesTotal,
            otAmount: entry.totals.otAmount,
            grossPay: entry.totals.grossPay,
          },
          performanceSummary: {
            targetHours: entry.performance.targetHours,
            monthlyLaborHours: entry.performance.monthlyLaborHours,
            overtimeHours: entry.performance.overtimeHours,
            otRate: entry.performance.otRate,
            otAmount: entry.performance.otAmount,
          },
          advanceDeduction: {
            advancesApplied: advance.advancesApplied,
            advanceDeductionTotal: advance.advanceDeductionTotal,
          },
          deductions: {
            lopDays: entry.totals.lopDays,
            lopAmount: entry.totals.lopAmount,
            fixedDeductionsTotal: entry.totals.fixedDeductionsTotal,
            advanceDeductionTotal: advance.advanceDeductionTotal,
            totalDeductions: advance.totalDeductions,
          },
          netPay: advance.netPay,
          paymentStatus: "UNPAID",
        };
      })(),
    }));

    if (changedAdvanceIds.size > 0) {
      const ops = advanceRows
        .filter((advance) => changedAdvanceIds.has(String(advance._id)))
        .map((advance) => ({
          updateOne: {
            filter: { _id: advance._id },
            update: {
              $set: {
                outstandingAmount: round2(toNumber(advance.outstandingAmount)),
                status: advance.status,
                settledAt: advance.settledAt || null,
              },
            },
          },
        }));
      if (ops.length > 0) {
        await StaffAdvance.bulkWrite(ops, { ordered: false });
      }
    }

    const lines = await PayrollLine.insertMany(linePayload);
    const totals = lines.reduce(
      (acc, line) => {
        acc.totalGross += Number(line.payComponents?.grossPay || 0);
        acc.totalDeductions += Number(line.deductions?.totalDeductions || 0);
        acc.totalNet += Number(line.netPay || 0);
        return acc;
      },
      { totalGross: 0, totalDeductions: 0, totalNet: 0 }
    );

    run.totals = {
      totalGross: round2(totals.totalGross),
      totalDeductions: round2(totals.totalDeductions),
      totalNet: round2(totals.totalNet),
    };
    await run.save();

    await syncLegacyPayroll({ run, lines });

    await logAudit({
      req,
      action: "create",
      entity: "payroll",
      entityId: run._id,
      entityDescription: `Payroll generated for ${monthInfo.monthKey}`,
    });

    return res.json({
      run,
      lineCount: lines.length,
      totals: run.totals,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Payroll already exists for this month" });
    }
    return next(error);
  }
};

export const markPayrollPaid = async (req, res, next) => {
  try {
    const { id } = req.params;
    const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
    const staffIds = Array.isArray(req.body.staffIds)
      ? req.body.staffIds.filter((entry) => isValidId(entry))
      : [];

    const run = await PayrollRun.findById(id);
    if (run) {
      const filter = { payrollRunId: run._id, paymentStatus: "UNPAID" };
      if (staffIds.length) {
        filter.staffId = { $in: staffIds };
      }
      const rows = await PayrollLine.find(filter).select("_id staffId");
      if (!rows.length) {
        return res.json({ updatedCount: 0, runId: run._id, status: run.status });
      }

      await PayrollLine.updateMany(
        { _id: { $in: rows.map((row) => row._id) } },
        { $set: { paymentStatus: "PAID", paidAt } }
      );
      await Payroll.updateMany(
        { employeeId: { $in: rows.map((row) => row.staffId) }, month: run.monthKey },
        { $set: { status: "paid", paymentDate: paidAt } }
      );
      const updatedRun = await updateRunStatusFromLines(run._id);
      return res.json({
        runId: run._id,
        updatedCount: rows.length,
        status: updatedRun?.status || run.status,
      });
    }

    const legacyRow = await Payroll.findById(id);
    if (legacyRow) {
      legacyRow.status = "paid";
      legacyRow.paymentDate = paidAt;
      legacyRow.paymentMethod = req.body.paymentMethod || legacyRow.paymentMethod || "";
      legacyRow.paymentReference = req.body.paymentReference || legacyRow.paymentReference || "";
      legacyRow.paymentNotes = req.body.paymentNotes || legacyRow.paymentNotes || "";
      await legacyRow.save();

      const parsed = parseMonthString(legacyRow.month);
      if (parsed) {
        const runForMonth = await PayrollRun.findOne({ year: parsed.year, month: parsed.month });
        if (runForMonth) {
          await PayrollLine.findOneAndUpdate(
            { payrollRunId: runForMonth._id, staffId: legacyRow.employeeId },
            { $set: { paymentStatus: "PAID", paidAt } }
          );
          await updateRunStatusFromLines(runForMonth._id);
        }
      }
      return res.json(legacyRow);
    }

    const line = await PayrollLine.findById(id);
    if (!line) return res.status(404).json({ message: "Payroll not found" });

    line.paymentStatus = "PAID";
    line.paidAt = paidAt;
    await line.save();
    const lineRun = await PayrollRun.findById(line.payrollRunId);
    if (lineRun) {
      await Payroll.findOneAndUpdate(
        { employeeId: line.staffId, month: lineRun.monthKey },
        { $set: { status: "paid", paymentDate: paidAt } }
      );
      await updateRunStatusFromLines(lineRun._id);
    }
    return res.json(line);
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
    return res.json(row);
  } catch (error) {
    return next(error);
  }
};
