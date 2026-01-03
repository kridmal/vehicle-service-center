import WorkCalendar from "../models/WorkCalendar.js";

const normalizeMonthString = (value) => {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  return { year, month, key: `${match[1]}-${match[2]}` };
};

const getTotalDays = (year, month) => new Date(year, month, 0).getDate();

const countWeeklyOffs = (year, month, pattern) => {
  if (pattern === "CUSTOM") return 0;
  const totalDays = getTotalDays(year, month);
  let count = 0;
  for (let day = 1; day <= totalDays; day += 1) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday === 0) {
      count += 1;
    } else if (pattern === "SAT_SUN" && weekday === 6) {
      count += 1;
    }
  }
  return count;
};

const normalizeWeekdayList = (value) => {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  value.forEach((entry) => {
    const day = Number(entry);
    if (Number.isInteger(day) && day >= 0 && day <= 6) {
      unique.add(day);
    }
  });
  return Array.from(unique.values());
};

const normalizeHolidayDates = (holidays, year, month) => {
  if (!Array.isArray(holidays)) return [];
  const unique = new Map();
  holidays.forEach((value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    if (date.getFullYear() !== year || date.getMonth() !== month - 1) return;
    const key = date.toISOString().slice(0, 10);
    if (!unique.has(key)) {
      unique.set(key, new Date(date.getFullYear(), date.getMonth(), date.getDate()));
    }
  });
  return Array.from(unique.values());
};

const normalizeOffDates = (dates, year, month) =>
  normalizeHolidayDates(dates, year, month);

const buildWeeklyOffDateSet = (year, month, weeklyOffDays, customOffDates) => {
  const totalDays = getTotalDays(year, month);
  const dateSet = new Set();
  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, month - 1, day);
    if (weeklyOffDays.includes(date.getDay())) {
      dateSet.add(date.toISOString().slice(0, 10));
    }
  }
  customOffDates.forEach((date) => {
    dateSet.add(date.toISOString().slice(0, 10));
  });
  return dateSet;
};

const buildCalendarPayload = ({ monthInfo, body, userId }) => {
  const weeklyOffPattern =
    ["SUN", "SAT_SUN", "CUSTOM"].includes(body.weeklyOffPattern)
      ? body.weeklyOffPattern
      : "SUN";
  const totalDays = getTotalDays(monthInfo.year, monthInfo.month);
  const holidays = normalizeHolidayDates(
    body.holidays || [],
    monthInfo.year,
    monthInfo.month
  );
  const weeklyOffDays =
    weeklyOffPattern === "CUSTOM"
      ? normalizeWeekdayList(body.weeklyOffDays)
      : [];
  const customOffDates =
    weeklyOffPattern === "CUSTOM"
      ? normalizeOffDates(body.customOffDates || [], monthInfo.year, monthInfo.month)
      : [];
  const weeklyOffs =
    weeklyOffPattern === "CUSTOM"
      ? buildWeeklyOffDateSet(
          monthInfo.year,
          monthInfo.month,
          weeklyOffDays,
          customOffDates
        ).size
      : countWeeklyOffs(monthInfo.year, monthInfo.month, weeklyOffPattern);
  const holidaySet = new Set(
    holidays.map((date) => date.toISOString().slice(0, 10))
  );
  const offDateSet =
    weeklyOffPattern === "CUSTOM"
      ? buildWeeklyOffDateSet(
          monthInfo.year,
          monthInfo.month,
          weeklyOffDays,
          customOffDates
        )
      : new Set();
  const union = new Set([...holidaySet, ...offDateSet]);
  const calculatedWorkingDays =
    totalDays - (weeklyOffPattern === "CUSTOM" ? union.size : weeklyOffs + holidays.length);
  const workingDaysOverride =
    body.workingDaysOverride !== undefined && body.workingDaysOverride !== null
      ? Number(body.workingDaysOverride)
      : null;
  const legacyOverride =
    body.workingDays !== undefined && body.workingDays !== null
      ? Number(body.workingDays)
      : null;
  const standardHoursPerDay =
    body.standardHoursPerDay !== undefined && body.standardHoursPerDay !== null
      ? Number(body.standardHoursPerDay)
      : 8;
  const effectiveOverride = Number.isFinite(workingDaysOverride)
    ? workingDaysOverride
    : legacyOverride;
  const workingDays =
    Number.isFinite(effectiveOverride) && effectiveOverride >= 0
      ? Math.min(effectiveOverride, totalDays)
      : Math.max(calculatedWorkingDays, 0);

  return {
    month: monthInfo.key,
    totalDays,
    weeklyOffPattern,
    weeklyOffDays,
    customOffDates,
    holidays,
    workingDays,
    workingDaysOverride:
      Number.isFinite(workingDaysOverride) && workingDaysOverride >= 0
        ? Math.min(workingDaysOverride, totalDays)
        : undefined,
    standardHoursPerDay:
      Number.isFinite(standardHoursPerDay) && standardHoursPerDay > 0
        ? standardHoursPerDay
        : 8,
    createdBy: userId,
  };
};

export const getWorkCalendar = async (req, res, next) => {
  try {
    const monthInfo = normalizeMonthString(req.query.month);
    if (!monthInfo) {
      return res.status(400).json({ message: "Invalid month" });
    }
    const calendar = await WorkCalendar.findOne({ month: monthInfo.key });
    if (!calendar) {
      return res.status(404).json({ message: "Work calendar not found" });
    }
    return res.json(calendar);
  } catch (error) {
    return next(error);
  }
};

export const upsertWorkCalendar = async (req, res, next) => {
  try {
    const monthInfo = normalizeMonthString(req.body.month);
    if (!monthInfo) {
      return res.status(400).json({ message: "Invalid month" });
    }

    const existing = await WorkCalendar.findOne({ month: monthInfo.key });
    if (existing && existing.locked) {
      return res.status(409).json({ message: "Work calendar is locked" });
    }

    const payload = buildCalendarPayload({
      monthInfo,
      body: req.body,
      userId: req.user?.id,
    });

    if (existing) {
      existing.totalDays = payload.totalDays;
      existing.weeklyOffPattern = payload.weeklyOffPattern;
      existing.holidays = payload.holidays;
      existing.workingDays = payload.workingDays;
      existing.weeklyOffDays = payload.weeklyOffDays;
      existing.customOffDates = payload.customOffDates;
      existing.workingDaysOverride = payload.workingDaysOverride;
      existing.standardHoursPerDay = payload.standardHoursPerDay;
      if (!existing.createdBy) {
        existing.createdBy = payload.createdBy;
      }
      const saved = await existing.save();
      return res.json(saved);
    }

    const created = await WorkCalendar.create(payload);
    return res.status(201).json(created);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Work calendar already exists" });
    }
    return next(error);
  }
};

export const lockWorkCalendar = async (req, res, next) => {
  try {
    const { id } = req.params;
    const calendar = await WorkCalendar.findById(id);
    if (!calendar) {
      return res.status(404).json({ message: "Work calendar not found" });
    }
    if (calendar.locked) {
      return res.json(calendar);
    }
    calendar.locked = true;
    const saved = await calendar.save();
    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};
