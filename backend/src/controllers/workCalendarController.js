import WorkCalendar from "../models/WorkCalendar.js";
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
