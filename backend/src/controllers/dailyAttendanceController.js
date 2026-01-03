import mongoose from "mongoose";
import DailyAttendance from "../models/DailyAttendance.js";
import Staff from "../models/Staff.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const parseDateOnly = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (
        Number.isInteger(year) &&
        Number.isInteger(month) &&
        Number.isInteger(day)
      ) {
        return {
          utcDate: new Date(Date.UTC(year, month - 1, day)),
          localStart: new Date(year, month - 1, day),
          localEnd: new Date(year, month - 1, day + 1),
        };
      }
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  return {
    utcDate: new Date(Date.UTC(year, month, day)),
    localStart: new Date(year, month, day),
    localEnd: new Date(year, month, day + 1),
  };
};

const startOfMonth = (year, month) => new Date(year, month - 1, 1);
const startOfNextMonth = (year, month) => new Date(year, month, 1);

const normalizeMonth = (value) => {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
};

const normalizeYear = (value) => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 ? year : null;
};

const normalizeAttendanceType = (value) => {
  const normalized = String(value || "").toUpperCase();
  const allowed = [
    "WORK_FULL",
    "WORK_HALF",
    "LEAVE_FULL",
    "LEAVE_HALF",
    "ABSENT",
  ];
  return allowed.includes(normalized) ? normalized : null;
};

const parseTimeInput = (value) => {
  if (!value) return "";
  const trimmed = String(value).trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}`;
};

const toMinutes = (value) => {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const normalizeSource = (value) => {
  const normalized = String(value || "MANUAL").toUpperCase();
  return ["MANUAL", "BIOMETRIC"].includes(normalized) ? normalized : "MANUAL";
};

export const listDailyAttendance = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.staffId) {
      if (!isValidId(req.query.staffId)) {
        return res.status(400).json({ message: "Invalid staff id" });
      }
      filter.staffId = req.query.staffId;
    }

    const month = normalizeMonth(req.query.month);
    const year = normalizeYear(req.query.year);
    if (month && year) {
      filter.date = {
        $gte: startOfMonth(year, month),
        $lt: startOfNextMonth(year, month),
      };
    } else if (req.query.from || req.query.to) {
      const from = parseDateOnly(req.query.from);
      const to = parseDateOnly(req.query.to);
      if (!from && !to) {
        return res.status(400).json({ message: "Invalid date range" });
      }
      if (from && to) {
        filter.date = { $gte: from, $lte: to };
      } else if (from) {
        filter.date = { $gte: from };
      } else {
        filter.date = { $lte: to };
      }
    }

    const records = await DailyAttendance.find(filter).sort({ date: 1 });
    return res.json(records);
  } catch (error) {
    return next(error);
  }
};

export const upsertDailyAttendance = async (req, res, next) => {
  try {
    const {
      staffId,
      date,
      attendanceType,
      leaveType,
      source,
      remarks,
      inTime,
      outTime,
    } =
      req.body;

    if (!staffId || !isValidId(staffId)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }

    const dateInfo = parseDateOnly(date);
    if (!dateInfo) {
      return res.status(400).json({ message: "Invalid date" });
    }

    const normalizedType = normalizeAttendanceType(attendanceType);
    if (!normalizedType) {
      return res.status(400).json({ message: "Invalid attendance type" });
    }

    if (normalizedType.startsWith("LEAVE") && !leaveType) {
      return res
        .status(400)
        .json({ message: "Leave type is required for leave attendance" });
    }

    const normalizedInTime = parseTimeInput(inTime);
    const normalizedOutTime = parseTimeInput(outTime);
    if (normalizedInTime === null || normalizedOutTime === null) {
      return res.status(400).json({ message: "Invalid in/out time format" });
    }
    if ((normalizedInTime && !normalizedOutTime) || (!normalizedInTime && normalizedOutTime)) {
      return res.status(400).json({ message: "Both in and out time are required" });
    }
    if (normalizedInTime && normalizedOutTime) {
      const startMinutes = toMinutes(normalizedInTime);
      const endMinutes = toMinutes(normalizedOutTime);
      if (endMinutes === null || startMinutes === null || endMinutes <= startMinutes) {
        return res.status(400).json({ message: "Out time must be after in time" });
      }
    }

    const staff = await Staff.findById(staffId);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const existing = await DailyAttendance.findOne({
      staffId,
      date: { $gte: dateInfo.localStart, $lt: dateInfo.localEnd },
    });
    if (existing?.isSystemGenerated) {
      return res.status(409).json({
        message: "System-generated attendance rows cannot be edited",
      });
    }

    const update = {
      staffId,
      staffName: staff.fullName,
      date: dateInfo.utcDate,
      attendanceType: normalizedType,
      inTime: normalizedInTime || null,
      outTime: normalizedOutTime || null,
      leaveType: leaveType ? String(leaveType).trim() : null,
      source: normalizeSource(source),
      remarks: remarks ? String(remarks).trim() : undefined,
      isSystemGenerated: false,
    };

    let record;
    if (existing) {
      record = await DailyAttendance.findByIdAndUpdate(existing._id, update, {
        new: true,
        runValidators: true,
      });
    } else {
      record = await DailyAttendance.create(update);
    }

    return res.json(record);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ message: "Attendance already exists for this date" });
    }
    return next(error);
  }
};
