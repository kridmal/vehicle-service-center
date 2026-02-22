import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import AttendanceMonthFinalization from "../models/AttendanceMonthFinalization.js";
import AppSetting from "../models/AppSetting.js";
import LeaveType from "../models/LeaveType.js";
import Payroll from "../models/Payroll.js";
import Payslip from "../models/Payslip.js";
import Staff from "../models/Staff.js";
import WorkCalendar from "../models/WorkCalendar.js";
import WorkCalendarDay from "../models/WorkCalendarDay.js";
import { logAudit } from "../utils/audit.js";
import {
  resolveMonthlyCutoff,
  summarizeEvaluatedAttendance,
} from "../utils/attendanceReport.js";

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

const totalDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

const isPastMonth = ({ year, month, now = new Date() }) => {
  const value = Number(year) * 100 + Number(month);
  const nowValue = now.getFullYear() * 100 + (now.getMonth() + 1);
  return value < nowValue;
};

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

const CALENDAR_MISSING_MESSAGE =
  "Work calendar not generated for this month. Please generate in Work Calendar tab.";
const OFF_DAY_MESSAGE = "Cannot mark attendance on a holiday/off day";

let attendanceIndexesEnsured = false;

const ensureAttendanceIndexes = async () => {
  if (attendanceIndexesEnsured) return;

  const indexes = await Attendance.collection.indexes();
  const legacyMonthlyUnique = indexes.find(
    (entry) =>
      entry.name === "staffId_1_month_1_year_1" &&
      !entry.partialFilterExpression
  );
  if (legacyMonthlyUnique) {
    try {
      await Attendance.collection.dropIndex("staffId_1_month_1_year_1");
    } catch {
      // no-op if already dropped by another process
    }
  }

  const stalePartial = indexes.find(
    (entry) => entry.name === "staffId_1_month_1_year_1_monthly_only"
  );
  if (stalePartial) {
    try {
      await Attendance.collection.dropIndex("staffId_1_month_1_year_1_monthly_only");
    } catch {
      // no-op if missing/already dropped
    }
  }

  const hasSummaryKeyIndex = (await Attendance.collection.indexes()).some(
    (entry) => entry.name === "summaryKey_1_unique_sparse"
  );
  if (!hasSummaryKeyIndex) {
    await Attendance.collection.createIndex(
      { summaryKey: 1 },
      { unique: true, sparse: true, name: "summaryKey_1_unique_sparse" }
    );
  }

  attendanceIndexesEnsured = true;
};

const resolveCalendarStateForDate = async (dateInfo) => {
  const calendarDay = await WorkCalendarDay.findOne({ date: dateInfo.value });
  if (!calendarDay) {
    return {
      calendarDay: null,
      canMark: false,
      calendarMissing: true,
      calendarMessage: CALENDAR_MISSING_MESSAGE,
    };
  }
  if (calendarDay.isWorkingDay === false) {
    return {
      calendarDay,
      canMark: false,
      calendarMissing: false,
      calendarMessage: OFF_DAY_MESSAGE,
    };
  }
  return {
    calendarDay,
    canMark: true,
    calendarMissing: false,
    calendarMessage: "",
  };
};

const normalizeDailyStatus = (value) => String(value || "").trim().toLowerCase();

const loadAttendanceDayPayload = async ({ dateInfo, staffId = "", department = "" }) => {
  const staffFilter = { active: { $ne: false }, status: { $ne: "inactive" } };
  if (department) staffFilter.departmentId = department;
  if (staffId) staffFilter._id = staffId;

  const [employees, records, rules, calendarState] = await Promise.all([
    Staff.find(staffFilter).sort({ fullName: 1 }),
    Attendance.find({ date: dateInfo.value }),
    AppSetting.findOne({ key: "attendanceRules" }),
    resolveCalendarStateForDate(dateInfo),
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
      status: normalizeDailyStatus(record?.status) || "absent",
      checkInTime: record?.checkInTime || "",
      checkOutTime: record?.checkOutTime || "",
      notes: record?.notes || "",
      markedAt: record?.markedAt || null,
      isLocked: Boolean(record?.isLocked),
      source: record?.source || "manual",
    };
  });

  return {
    date: dateInfo.value,
    rules: rules?.value || {},
    rows,
    entries: records,
    calendarDay: calendarState.calendarDay,
    canMark: calendarState.canMark,
    calendarMissing: calendarState.calendarMissing,
    calendarMessage: calendarState.calendarMessage,
  };
};

const upsertAttendanceEntriesForDate = async ({ req, dateInfo, entries = [], rules }) => {
  await ensureAttendanceIndexes();

  const calendarState = await resolveCalendarStateForDate(dateInfo);
  if (calendarState.calendarMissing) {
    return { error: { status: 400, message: CALENDAR_MISSING_MESSAGE } };
  }
  if (!calendarState.canMark) {
    return { error: { status: 400, message: OFF_DAY_MESSAGE } };
  }

  const candidates = Array.isArray(entries) ? entries : [];
  const normalizedEntries = candidates
    .map((row) => ({
      staffId: row?.staffId || row?.employeeId,
      status: row?.status,
      checkInTime: row?.checkInTime,
      checkOutTime: row?.checkOutTime,
      notes: row?.notes,
      source: row?.source || "manual",
    }))
    .filter((row) => row.staffId && isValidId(row.staffId));

  if (normalizedEntries.length === 0) {
    return { records: [] };
  }

  const staffIds = Array.from(
    new Set(normalizedEntries.map((entry) => String(entry.staffId)))
  );

  const [staffRows, lockedSet] = await Promise.all([
    Staff.find({ _id: { $in: staffIds } }),
    Promise.all(
      staffIds.map(async (id) => ({
        id,
        locked: await isAttendanceLocked(id, dateInfo.month, dateInfo.year),
      }))
    ),
  ]);

  const staffMap = new Map(staffRows.map((staff) => [String(staff._id), staff]));
  const lockedMap = new Map(lockedSet.map((entry) => [entry.id, entry.locked]));

  const operations = normalizedEntries
    .filter((entry) => !lockedMap.get(String(entry.staffId)))
    .map((entry) => {
      const staff = staffMap.get(String(entry.staffId));
      if (!staff) return null;
      const status = resolveStatusFromTimes(
        entry.status,
        entry.checkInTime,
        entry.checkOutTime,
        rules
      );
      return {
        updateOne: {
          filter: { staffId: staff._id, date: dateInfo.value },
          update: {
            $set: {
              staffId: staff._id,
              employeeId: staff.employeeId || String(staff._id),
              employeeName: staff.fullName,
              department: String(staff.departmentId || ""),
              role: staff.roleName || "",
              date: dateInfo.value,
              month: dateInfo.month,
              year: dateInfo.year,
              checkInTime: entry.checkInTime || "",
              checkOutTime: entry.checkOutTime || "",
              status: status || "present",
              notes: entry.notes || "",
              markedBy: req.user?.name || req.user?.email || "",
              markedAt: new Date(),
              isLocked: false,
              source: entry.source || "manual",
            },
          },
          upsert: true,
        },
      };
    })
    .filter(Boolean);

  if (!operations.length) {
    return { records: [] };
  }

  const updatedStaffIds = operations.map((op) => op.updateOne.filter.staffId);

  await Attendance.bulkWrite(operations, { ordered: false });
  const savedRecords = await Attendance.find({
    date: dateInfo.value,
    staffId: { $in: updatedStaffIds },
  });

  await Promise.all(
    savedRecords.map((record) =>
      logAudit({
        req,
        action: "update",
        entity: "attendance",
        entityId: record._id,
        entityDescription: `${record.employeeName || record.staffId} - ${dateInfo.value}`,
      })
    )
  );

  return { records: savedRecords };
};

export const getAttendanceDay = async (req, res, next) => {
  try {
    const dateInfo = parseDateString(req.query.date);
    if (!dateInfo) {
      return res.status(400).json({ message: "Invalid date" });
    }
    const staffId = req.query.staffId ? String(req.query.staffId) : "";
    const department = req.query.department ? String(req.query.department) : "";
    if (staffId && !isValidId(staffId)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }

    const payload = await loadAttendanceDayPayload({ dateInfo, staffId, department });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
};

export const getAttendanceMonthlyReport = async (req, res, next) => {
  try {
    const month = normalizeMonth(req.query.month);
    const year = normalizeYear(req.query.year);
    if (!month || !year) {
      return res.status(400).json({ message: "Invalid month or year" });
    }

    const { isFutureMonth, cutoffDate } = resolveMonthlyCutoff({ year, month });
    if (isFutureMonth) {
      return res.json({
        records: [],
        year,
        month,
        cutoffDate: null,
        isFutureMonth: true,
        message: "Future month selected. No evaluated attendance yet.",
      });
    }

    const department = req.query.department ? String(req.query.department) : "";
    const staffId = req.query.staffId ? String(req.query.staffId) : "";
    if (staffId && !isValidId(staffId)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }

    const monthKey = getMonthKey(year, month);
    const fromDate = `${monthKey}-01`;

    const staffFilter = { active: { $ne: false }, status: { $ne: "inactive" } };
    if (department) staffFilter.departmentId = department;
    if (staffId) staffFilter._id = staffId;

    const [calendarCount, calendarWorkingRows, employees] = await Promise.all([
      WorkCalendarDay.countDocuments({ year, month }),
      WorkCalendarDay.find({
        year,
        month,
        isWorkingDay: true,
        date: { $lte: cutoffDate },
      })
        .sort({ date: 1 })
        .select("date"),
      Staff.find(staffFilter).sort({ fullName: 1 }),
    ]);

    if (calendarCount === 0) {
      return res.json({
        records: [],
        year,
        month,
        cutoffDate,
        isFutureMonth: false,
        calendarMissing: true,
        message: CALENDAR_MISSING_MESSAGE,
      });
    }

    const evaluatedDates = calendarWorkingRows.map((row) => row.date);
    const evaluatedDateSet = new Set(evaluatedDates);
    const staffIds = employees.map((entry) => entry._id);

    const attendanceRows = staffIds.length
      ? await Attendance.find({
          staffId: { $in: staffIds },
          date: { $gte: fromDate, $lte: cutoffDate },
        }).select("staffId date status leaveTypeId leaveTypeName isPaidLeave")
      : [];

    const leaveTypeIds = Array.from(
      new Set(
        attendanceRows
          .filter((entry) => entry.leaveTypeId)
          .map((entry) => String(entry.leaveTypeId))
      )
    );

    const leaveTypes = leaveTypeIds.length
      ? await LeaveType.find({ _id: { $in: leaveTypeIds } }).select("_id paid isPaid")
      : [];
    const unpaidLeaveTypeIds = new Set(
      leaveTypes
        .filter((entry) => entry.isPaid === false || entry.paid === false)
        .map((entry) => String(entry._id))
    );

    const attendanceByStaff = attendanceRows.reduce((acc, row) => {
      const key = String(row.staffId);
      if (!acc[key]) acc[key] = new Map();
      if (evaluatedDateSet.has(row.date)) {
        acc[key].set(row.date, row);
      }
      return acc;
    }, {});

    const records = employees.map((employee) => {
      const staffKey = String(employee._id);
      const attendanceByDate = attendanceByStaff[staffKey] || new Map();
      const summary = summarizeEvaluatedAttendance({
        evaluatedDates,
        attendanceByDate,
        unpaidLeaveTypeIds,
      });
      return {
        staffId: staffKey,
        staffName: employee.fullName,
        role: employee.roleName || "",
        workingDaysEvaluated: summary.workingDaysEvaluated,
        presentCount: summary.presentCount,
        absentCount: summary.absentCount,
        leaveCount: summary.leaveCount,
        unmarkedCount: summary.unmarkedCount,
        lopDays: summary.lopDays,
      };
    });

    return res.json({
      records,
      year,
      month,
      cutoffDate,
      isFutureMonth: false,
      calendarMissing: false,
      message: "",
    });
  } catch (error) {
    return next(error);
  }
};

export const getAttendanceFinalizationStatus = async (req, res, next) => {
  try {
    const month = normalizeMonth(req.query.month);
    const year = normalizeYear(req.query.year);
    if (!month || !year) {
      return res.status(400).json({ message: "Invalid month or year" });
    }

    const [calendarCount, finalization] = await Promise.all([
      WorkCalendarDay.countDocuments({ year, month }),
      AttendanceMonthFinalization.findOne({ year, month }),
    ]);

    return res.json({
      year,
      month,
      isPastMonth: isPastMonth({ year, month }),
      calendarFound: calendarCount > 0,
      finalized: Boolean(finalization),
      finalizedAt: finalization?.finalizedAt || null,
      finalizedBy: finalization?.finalizedBy || "",
      notes: finalization?.notes || "",
    });
  } catch (error) {
    return next(error);
  }
};

export const finalizeAttendanceMonth = async (req, res, next) => {
  try {
    await ensureAttendanceIndexes();

    const month = normalizeMonth(req.body.month);
    const year = normalizeYear(req.body.year);
    const mode = String(req.body.mode || "").trim().toUpperCase();
    if (!month || !year) {
      return res.status(400).json({ message: "Invalid month or year" });
    }
    if (mode !== "CONVERT_UNMARKED_TO_ABSENT") {
      return res.status(400).json({ message: "Unsupported finalization mode" });
    }
    if (!isPastMonth({ year, month })) {
      return res
        .status(400)
        .json({ message: "Attendance can be finalized only after month end." });
    }

    const existingFinalization = await AttendanceMonthFinalization.findOne({ year, month });
    if (existingFinalization) {
      return res.status(409).json({ message: "Attendance already finalized for this month" });
    }

    const daysInMonth = totalDaysInMonth(year, month);
    const [calendarRows, staffRows] = await Promise.all([
      WorkCalendarDay.find({ year, month }).sort({ date: 1 }),
      Staff.find({ active: { $ne: false }, status: { $ne: "inactive" } }).select(
        "_id employeeId fullName departmentId roleName"
      ),
    ]);

    if (!calendarRows.length || calendarRows.length < daysInMonth) {
      return res.status(400).json({ message: CALENDAR_MISSING_MESSAGE });
    }

    const workingDates = calendarRows
      .filter((entry) => entry.isWorkingDay === true)
      .map((entry) => entry.date);

    if (!workingDates.length) {
      return res.status(400).json({ message: "No working days configured for selected month" });
    }

    const monthKey = getMonthKey(year, month);
    const existingRows = await Attendance.find({
      staffId: { $in: staffRows.map((staff) => staff._id) },
      date: { $gte: `${monthKey}-01`, $lte: `${monthKey}-31` },
    }).select("staffId date");

    const existingKeys = new Set(
      existingRows.map((entry) => `${String(entry.staffId)}-${entry.date}`)
    );

    const inserts = [];
    staffRows.forEach((staff) => {
      workingDates.forEach((date) => {
        const key = `${String(staff._id)}-${date}`;
        if (existingKeys.has(key)) return;
        inserts.push({
          staffId: staff._id,
          employeeId: staff.employeeId || String(staff._id),
          employeeName: staff.fullName,
          department: String(staff.departmentId || ""),
          role: staff.roleName || "",
          date,
          month,
          year,
          status: "absent",
          notes: "Auto-finalized from unmarked",
          markedBy: req.user?.name || req.user?.email || "",
          markedAt: new Date(),
          isLocked: false,
          source: "manual",
        });
      });
    });

    if (inserts.length) {
      await Attendance.insertMany(inserts, { ordered: false });
    }

    const finalization = await AttendanceMonthFinalization.create({
      year,
      month,
      finalizedAt: new Date(),
      finalizedBy: req.user?.id || req.user?.name || req.user?.email || "",
      notes: String(req.body.notes || "").trim(),
    });

    await logAudit({
      req,
      action: "update",
      entity: "attendance",
      entityId: `${year}-${String(month).padStart(2, "0")}`,
      entityDescription: `Attendance finalized for ${year}-${String(month).padStart(2, "0")}`,
    });

    return res.json({
      year,
      month,
      mode,
      createdCount: inserts.length,
      finalizedAt: finalization.finalizedAt,
      finalizedBy: finalization.finalizedBy,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Attendance already finalized for this month" });
    }
    return next(error);
  }
};

export const upsertAttendanceDay = async (req, res, next) => {
  try {
    const dateInfo = parseDateString(req.body.date);
    if (!dateInfo) {
      return res.status(400).json({ message: "Invalid date" });
    }
    if (!Array.isArray(req.body.entries)) {
      return res.status(400).json({ message: "entries array is required" });
    }

    const rulesSetting = await AppSetting.findOne({ key: "attendanceRules" });
    const rules = rulesSetting?.value || {};
    const result = await upsertAttendanceEntriesForDate({
      req,
      dateInfo,
      entries: req.body.entries,
      rules,
    });
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.json({ date: dateInfo.value, records: result.records || [] });
  } catch (error) {
    if (error.code === 11000) {
      if (
        String(error.message || "").includes("staffId_1_month_1_year_1") ||
        String(error.message || "").includes("staffId_1_month_1_year_1_monthly_only")
      ) {
        return res.status(409).json({
          message:
            "Attendance index conflict detected. Restart backend to apply index migration and try again.",
        });
      }
      return res.status(409).json({ message: "Attendance already exists" });
    }
    return next(error);
  }
};

export const listAttendance = async (req, res, next) => {
  try {
    const dateInfo = parseDateString(req.query.date);
    const staffId = req.query.staffId ? String(req.query.staffId) : "";
    const department = req.query.department ? String(req.query.department) : "";

    if (dateInfo) {
      if (staffId) {
        if (!isValidId(staffId)) {
          return res.status(400).json({ message: "Invalid staff id" });
        }
      }

      const payload = await loadAttendanceDayPayload({ dateInfo, staffId, department });
      return res.json(payload);
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
    const summaryFilter = { month, year, date: { $exists: false } };
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

      const result = await upsertAttendanceEntriesForDate({
        req,
        dateInfo,
        entries: req.body.entries,
        rules,
      });
      if (result.error) {
        return res.status(result.error.status).json({ message: result.error.message });
      }
      return res.json({ records: result.records || [] });
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

      const result = await upsertAttendanceEntriesForDate({
        req,
        dateInfo,
        entries: [req.body],
        rules,
      });
      if (result.error) {
        return res.status(result.error.status).json({ message: result.error.message });
      }
      return res.json((result.records || [])[0] || null);
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
      summaryKey: `${String(staffId)}-${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}`,
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
      { staffId, month: normalizedMonth, year: normalizedYear, date: { $exists: false } },
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
      if (
        String(error.message || "").includes("staffId_1_month_1_year_1") ||
        String(error.message || "").includes("staffId_1_month_1_year_1_monthly_only")
      ) {
        return res.status(409).json({
          message:
            "Attendance index conflict detected. Restart backend to apply index migration and try again.",
        });
      }
      return res.status(409).json({ message: "Attendance already exists" });
    }
    return next(error);
  }
};
