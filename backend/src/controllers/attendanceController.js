import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import AppSetting from "../models/AppSetting.js";
import Payroll from "../models/Payroll.js";
import Payslip from "../models/Payslip.js";
import Staff from "../models/Staff.js";
import WorkCalendar from "../models/WorkCalendar.js";
import { logAudit } from "../utils/audit.js";

const DEFAULT_WORKING_DAYS = 26;
const WORKDAY_STATUSES = new Set(["present", "late", "half-day", "on-leave"]);

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizeMonth = (value) => {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
};

const normalizeYear = (value) => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 ? year : null;
};

const parseDateString = (value) => {
  if (!value || typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, value };
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

const getMonthKey = (year, month) => `${year}-${String(month).padStart(2, "0")}`;

const isAttendanceLocked = async (staffId, month, year) => {
  const [payroll, payslip] = await Promise.all([
    Payroll.findOne({
      employeeId: staffId,
      month: getMonthKey(year, month),
      status: { $in: ["approved", "paid", "partially-paid"] },
    }).select("_id"),
    Payslip.findOne({ staffId, month, year }).select("_id"),
  ]);
  return Boolean(payroll || payslip);
};

const resolveStatusFromTimes = (status, checkInTime, checkOutTime, rules) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized && normalized !== "present") return normalized;
  if (!checkInTime || !checkOutTime) return normalized || "present";

  const [inH, inM] = String(checkInTime).split(":").map(Number);
  const [outH, outM] = String(checkOutTime).split(":").map(Number);
  const inMinutes = inH * 60 + inM;
  const outMinutes = outH * 60 + outM;
  const workedHours = Math.max(0, (outMinutes - inMinutes) / 60);

  if (workedHours > 0 && workedHours < Number(rules?.halfDayMinimumHours || 4)) {
    return "half-day";
  }
  const [lateH, lateM] = String(rules?.lateThresholdTime || "09:00")
    .split(":")
    .map(Number);
  const lateThreshold = lateH * 60 + lateM;
  if (inMinutes > lateThreshold) {
    return "late";
  }
  return normalized || "present";
};

const buildMonthlySummaryFromDaily = (records, workingDays) => {
  let presentDays = 0;
  let halfDays = 0;
  let approvedLeaveDays = 0;
  let lateDays = 0;
  records.forEach((entry) => {
    switch (entry.status) {
      case "present":
        presentDays += 1;
        break;
      case "late":
        presentDays += 1;
        lateDays += 1;
        break;
      case "half-day":
        halfDays += 1;
        break;
      case "on-leave":
        approvedLeaveDays += 1;
        break;
      default:
        break;
    }
  });
  const totalDays = presentDays + approvedLeaveDays + halfDays * 0.5;
  const absentDays = Math.max(0, workingDays - totalDays);
  return {
    presentDays,
    halfDays,
    approvedLeaveDays,
    lateDays,
    absentDays,
    lopDays: absentDays,
  };
};

export const listAttendance = async (req, res, next) => {
  try {
    const dateInfo = parseDateString(req.query.date);
    const staffId = req.query.staffId ? String(req.query.staffId) : "";
    const department = req.query.department ? String(req.query.department) : "";

    if (dateInfo) {
      const staffFilter = { active: { $ne: false }, status: { $ne: "inactive" } };
      if (department) staffFilter.departmentId = department;
      if (staffId) {
        if (!isValidId(staffId)) {
          return res.status(400).json({ message: "Invalid staff id" });
        }
        staffFilter._id = staffId;
      }
      const [employees, records, rules] = await Promise.all([
        Staff.find(staffFilter).sort({ fullName: 1 }),
        Attendance.find({ date: dateInfo.value }),
        AppSetting.findOne({ key: "attendanceRules" }),
      ]);
      const map = new Map(records.map((entry) => [String(entry.staffId), entry]));
      const rows = employees.map((employee) => {
        const key = String(employee._id);
        const record = map.get(key);
        return {
          employeeId: key,
          employeeName: employee.fullName,
          department: employee.departmentId || "",
          role: employee.roleName || "",
          status: record?.status || "absent",
          checkInTime: record?.checkInTime || "",
          checkOutTime: record?.checkOutTime || "",
          notes: record?.notes || "",
          markedAt: record?.markedAt || null,
          isLocked: Boolean(record?.isLocked),
          source: record?.source || "manual",
        };
      });
      return res.json({
        date: dateInfo.value,
        rules: rules?.value || {},
        rows,
      });
    }

    const month = normalizeMonth(req.query.month);
    const year = normalizeYear(req.query.year);
    if (!month || !year) {
      return res.status(400).json({ message: "Month/year or date is required" });
    }
    if (staffId && !isValidId(staffId)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }

    const monthKey = getMonthKey(year, month);
    const fromDate = `${monthKey}-01`;
    const toDate = `${monthKey}-31`;
    const summaryFilter = { month, year };
    if (staffId) summaryFilter.staffId = staffId;
    const [summaries, dailyRecords, payslips, payrolls, calendar] = await Promise.all([
      Attendance.find(summaryFilter).sort({ createdAt: -1 }),
      Attendance.find({ date: { $gte: fromDate, $lte: toDate }, ...(staffId ? { staffId } : {}) }),
      Payslip.find({ month, year }, "staffId"),
      Payroll.find({ month: monthKey, status: { $in: ["approved", "paid", "partially-paid"] } }, "employeeId"),
      WorkCalendar.findOne({ month: monthKey }),
    ]);
    const lockedStaffIds = new Set([
      ...payslips.map((entry) => String(entry.staffId)),
      ...payrolls.map((entry) => String(entry.employeeId)),
    ]);

    const dailyByStaff = dailyRecords.reduce((acc, row) => {
      const key = String(row.staffId);
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const summariesEnriched = summaries.map((entry) => {
      const key = String(entry.staffId);
      const workingDays = Number(entry.workingDays || calendar?.effectiveWorkingDays || DEFAULT_WORKING_DAYS);
      const daily = dailyByStaff[key] || [];
      if (!daily.length) return entry;
      const derived = buildMonthlySummaryFromDaily(daily, workingDays);
      return {
        ...entry.toObject(),
        ...derived,
      };
    });

    return res.json({
      records: summariesEnriched,
      dailyRecords,
      lockedStaffIds: Array.from(lockedStaffIds),
      calendar,
    });
  } catch (error) {
    return next(error);
  }
};

export const upsertAttendance = async (req, res, next) => {
  try {
    const rulesSetting = await AppSetting.findOne({ key: "attendanceRules" });
    const rules = rulesSetting?.value || {};

    if (Array.isArray(req.body.entries) && req.body.date) {
      const dateInfo = parseDateString(req.body.date);
      if (!dateInfo) {
        return res.status(400).json({ message: "Invalid date" });
      }
      const results = [];
      for (const row of req.body.entries) {
        const staffId = row.staffId || row.employeeId;
        if (!staffId || !isValidId(staffId)) continue;
        const locked = await isAttendanceLocked(staffId, dateInfo.month, dateInfo.year);
        if (locked) continue;
        const staff = await Staff.findById(staffId);
        if (!staff) continue;
        const status = resolveStatusFromTimes(
          row.status,
          row.checkInTime,
          row.checkOutTime,
          rules
        );
        const record = await Attendance.findOneAndUpdate(
          { staffId, date: dateInfo.value },
          {
            staffId,
            employeeId: staff.employeeId || String(staff._id),
            employeeName: staff.fullName,
            department: String(staff.departmentId || ""),
            role: staff.roleName || "",
            date: dateInfo.value,
            month: dateInfo.month,
            year: dateInfo.year,
            checkInTime: row.checkInTime || "",
            checkOutTime: row.checkOutTime || "",
            status,
            notes: row.notes || "",
            markedBy: req.user?.name || req.user?.email || "",
            markedAt: new Date(),
            isLocked: false,
            source: "manual",
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        results.push(record);
        await logAudit({
          req,
          action: "update",
          entity: "attendance",
          entityId: record._id,
          entityDescription: `${staff.fullName} - ${dateInfo.value}`,
        });
      }
      return res.json({ records: results });
    }

    if (req.body.date) {
      const dateInfo = parseDateString(req.body.date);
      if (!dateInfo) {
        return res.status(400).json({ message: "Invalid date" });
      }
      const staffId = req.body.staffId || req.body.employeeId;
      if (!staffId || !isValidId(staffId)) {
        return res.status(400).json({ message: "Invalid staff id" });
      }
      const locked = await isAttendanceLocked(staffId, dateInfo.month, dateInfo.year);
      if (locked) {
        return res.status(409).json({ message: "Attendance is locked for this period" });
      }
      const staff = await Staff.findById(staffId);
      if (!staff) return res.status(404).json({ message: "Staff not found" });

      const status = resolveStatusFromTimes(
        req.body.status,
        req.body.checkInTime,
        req.body.checkOutTime,
        rules
      );
      const record = await Attendance.findOneAndUpdate(
        { staffId, date: dateInfo.value },
        {
          staffId,
          employeeId: staff.employeeId || String(staff._id),
          employeeName: staff.fullName,
          department: String(staff.departmentId || ""),
          role: staff.roleName || "",
          date: dateInfo.value,
          month: dateInfo.month,
          year: dateInfo.year,
          checkInTime: req.body.checkInTime || "",
          checkOutTime: req.body.checkOutTime || "",
          status: status || "present",
          notes: req.body.notes || "",
          markedBy: req.user?.name || req.user?.email || "",
          markedAt: new Date(),
          isLocked: false,
          source: req.body.source || "manual",
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      await logAudit({
        req,
        action: "update",
        entity: "attendance",
        entityId: record._id,
        entityDescription: `${staff.fullName} - ${dateInfo.value}`,
      });
      return res.json(record);
    }

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

    await logAudit({
      req,
      action: "update",
      entity: "attendance",
      entityId: record._id,
      entityDescription: `${staff.fullName} - ${normalizedYear}-${String(
        normalizedMonth
      ).padStart(2, "0")}`,
    });

    return res.json(record);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Attendance already exists" });
    }
    return next(error);
  }
};
