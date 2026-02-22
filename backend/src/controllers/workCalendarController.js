import WorkCalendar from "../models/WorkCalendar.js";
import WorkCalendarDay from "../models/WorkCalendarDay.js";
import { logAudit } from "../utils/audit.js";

const DAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const DAY_CODE_TO_INDEX = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const OFF_TYPES = ["WEEKEND", "PUBLIC", "CUSTOM"];

const normalizeYearMonth = (year, month) => {
  const normalizedYear = Number(year);
  const normalizedMonth = Number(month);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 1900 || normalizedYear > 3000) {
    return null;
  }
  if (!Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12) {
    return null;
  }
  return { year: normalizedYear, month: normalizedMonth };
};

const toDateStringUTC = (year, month, day) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const parseDateString = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = normalizeYearMonth(year, month);
  if (!parsed) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return { year, month, day, date: toDateStringUTC(year, month, day) };
};

const normalizeCustomOffDays = (days) => {
  if (!Array.isArray(days)) return [];
  return days
    .map((entry) => String(entry || "").trim().toUpperCase())
    .filter((entry) => Object.prototype.hasOwnProperty.call(DAY_CODE_TO_INDEX, entry));
};

const buildMonthRows = ({ year, month, preset, customOffDays }) => {
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offSet = new Set(customOffDays.map((dayCode) => DAY_CODE_TO_INDEX[dayCode]));
  const rows = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = utcDate.getUTCDay();
    let isOff = false;
    if (preset === "SUN_ONLY") isOff = dayOfWeek === 0;
    if (preset === "SAT_SUN") isOff = dayOfWeek === 0 || dayOfWeek === 6;
    if (preset === "CUSTOM") isOff = offSet.has(dayOfWeek);

    rows.push({
      date: toDateStringUTC(year, month, day),
      year,
      month,
      dayOfWeek,
      isWorkingDay: !isOff,
      offType: isOff ? "WEEKEND" : null,
      offName: isOff ? DAY_NAMES[dayOfWeek] : "",
      notes: "",
    });
  }

  return rows;
};

const parseMonth = (month) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const monthNum = Number(match[2]);
  if (monthNum < 1 || monthNum > 12) return null;
  return { year, month: monthNum };
};

const getTotalDays = (year, month) => new Date(year, month, 0).getDate();

const calculateWorkingDays = ({
  month,
  weeklyOffPattern,
  customWeeklyOffDays = [],
  customOffDates = [],
  holidayDates = [],
}) => {
  const parsed = parseMonth(month);
  if (!parsed) return { totalDays: 0, calculatedWorkingDays: 0 };
  const totalDays = getTotalDays(parsed.year, parsed.month);
  const offDateSet = new Set([...customOffDates, ...holidayDates]);
  const customOffIndexes = new Set(
    customWeeklyOffDays.map((day) => DAY_INDEX[String(day || "").toLowerCase()]).filter((v) => v !== undefined)
  );

  let working = 0;
  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(parsed.year, parsed.month - 1, day);
    const dateStr = `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekDay = date.getDay();
    const weeklyOff =
      weeklyOffPattern === "none"
        ? false
        : weeklyOffPattern === "sunday"
        ? weekDay === 0
        : weeklyOffPattern === "saturday-sunday"
        ? weekDay === 0 || weekDay === 6
        : customOffIndexes.has(weekDay);
    const explicitOff = offDateSet.has(dateStr);
    if (!weeklyOff && !explicitOff) working += 1;
  }
  return { totalDays, calculatedWorkingDays: working };
};

export const listWorkCalendars = async (req, res, next) => {
  try {
    const rows = await WorkCalendar.find().sort({ month: -1 });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

export const getWorkCalendarByMonth = async (req, res, next) => {
  try {
    const month = String(req.params.month || "");
    const parsed = parseMonth(month);
    if (!parsed) return res.status(400).json({ message: "Invalid month" });
    const row = await WorkCalendar.findOne({ month });
    if (row) return res.json(row);
    const computed = calculateWorkingDays({
      month,
      weeklyOffPattern: "sunday",
    });
    return res.json({
      month,
      weeklyOffPattern: "sunday",
      customWeeklyOffDays: [],
      customOffDates: [],
      holidayDates: [],
      workingDaysOverride: 0,
      ...computed,
      effectiveWorkingDays: computed.calculatedWorkingDays,
    });
  } catch (error) {
    return next(error);
  }
};

export const upsertWorkCalendar = async (req, res, next) => {
  try {
    const payload = req.body || {};
    const month = String(payload.month || "");
    const parsed = parseMonth(month);
    if (!parsed) return res.status(400).json({ message: "Invalid month" });
    const computed = calculateWorkingDays(payload);
    const override = Number(payload.workingDaysOverride || 0);
    const effectiveWorkingDays =
      override > 0 ? override : computed.calculatedWorkingDays;
    const update = {
      month,
      totalDays: payload.totalDays || computed.totalDays,
      weeklyOffPattern: payload.weeklyOffPattern || "sunday",
      customWeeklyOffDays: payload.customWeeklyOffDays || [],
      customOffDates: payload.customOffDates || [],
      holidayDates: payload.holidayDates || [],
      calculatedWorkingDays: computed.calculatedWorkingDays,
      workingDaysOverride: override,
      effectiveWorkingDays,
      createdBy: payload.createdBy || req.user?.name || req.user?.email,
      updatedBy: req.user?.name || req.user?.email,
    };
    const row = await WorkCalendar.findOneAndUpdate(
      { month },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await logAudit({
      req,
      action: "update",
      entity: "work-calendar",
      entityId: row._id,
      entityDescription: month,
    });
    return res.json(row);
  } catch (error) {
    return next(error);
  }
};

export const generateWorkCalendarMonth = async (req, res, next) => {
  try {
    const { year, month, preset, customOffDays } = req.body || {};
    const normalized = normalizeYearMonth(year, month);
    if (!normalized) {
      return res.status(400).json({ message: "Invalid year or month" });
    }

    const normalizedPreset = String(preset || "").trim().toUpperCase();
    if (!["SUN_ONLY", "SAT_SUN", "CUSTOM"].includes(normalizedPreset)) {
      return res.status(400).json({ message: "Invalid preset" });
    }

    const normalizedCustomOffDays = normalizeCustomOffDays(customOffDays);
    if (normalizedPreset === "CUSTOM" && normalizedCustomOffDays.length === 0) {
      return res.status(400).json({ message: "customOffDays is required for CUSTOM preset" });
    }

    const rows = buildMonthRows({
      year: normalized.year,
      month: normalized.month,
      preset: normalizedPreset,
      customOffDays: normalizedCustomOffDays,
    });

    await WorkCalendarDay.deleteMany({ year: normalized.year, month: normalized.month });
    const created = await WorkCalendarDay.insertMany(rows);

    await logAudit({
      req,
      action: "update",
      entity: "work-calendar",
      entityDescription: `${normalized.year}-${String(normalized.month).padStart(2, "0")}`,
    });

    return res.json({
      summary: {
        year: normalized.year,
        month: normalized.month,
        preset: normalizedPreset,
        totalDays: created.length,
        offDays: created.filter((entry) => entry.isWorkingDay === false).length,
      },
      days: created,
    });
  } catch (error) {
    return next(error);
  }
};

export const getWorkCalendarDaysByMonth = async (req, res, next) => {
  try {
    const normalized = normalizeYearMonth(req.query.year, req.query.month);
    if (!normalized) {
      return res.status(400).json({ message: "Invalid year or month" });
    }

    const rows = await WorkCalendarDay.find({
      year: normalized.year,
      month: normalized.month,
    }).sort({ date: 1 });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

export const updateWorkCalendarDay = async (req, res, next) => {
  try {
    const { date, isWorkingDay, offType, offName, notes } = req.body || {};
    const parsedDate = parseDateString(date);
    if (!parsedDate) {
      return res.status(400).json({ message: "Invalid date" });
    }
    if (typeof isWorkingDay !== "boolean") {
      return res.status(400).json({ message: "isWorkingDay must be boolean" });
    }

    let normalizedOffType = null;
    let normalizedOffName = "";
    if (!isWorkingDay) {
      normalizedOffType = String(offType || "CUSTOM").trim().toUpperCase();
      if (!OFF_TYPES.includes(normalizedOffType)) {
        return res.status(400).json({ message: "Invalid offType" });
      }
      normalizedOffName = String(offName || "").trim();
    }

    const payload = {
      date: parsedDate.date,
      year: parsedDate.year,
      month: parsedDate.month,
      dayOfWeek: new Date(Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day)).getUTCDay(),
      isWorkingDay,
      offType: isWorkingDay ? null : normalizedOffType,
      offName: isWorkingDay ? "" : normalizedOffName,
      notes: String(notes || "").trim(),
    };

    const row = await WorkCalendarDay.findOneAndUpdate(
      { date: parsedDate.date },
      payload,
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    await logAudit({
      req,
      action: "update",
      entity: "work-calendar",
      entityId: row._id,
      entityDescription: row.date,
    });

    return res.json(row);
  } catch (error) {
    return next(error);
  }
};
