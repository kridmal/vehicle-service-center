import mongoose from "mongoose";
import WorkLog from "../models/WorkLog.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const isValidDateKey = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

export const listWorkLogs = async (req, res, next) => {
  try {
    const filter = {};
    const date = String(req.query.date || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const staffId = String(req.query.staffId || "").trim();
    const jobCardId = String(req.query.jobCardId || "").trim();
    const q = String(req.query.q || "").trim();
    const limit = Math.min(500, toPositiveInt(req.query.limit, 200));

    if (date) {
      if (!isValidDateKey(date)) {
        return res.status(400).json({ message: "Invalid date. Use YYYY-MM-DD" });
      }
      filter.date = date;
    } else if (from || to) {
      if (from && !isValidDateKey(from)) {
        return res.status(400).json({ message: "Invalid from date. Use YYYY-MM-DD" });
      }
      if (to && !isValidDateKey(to)) {
        return res.status(400).json({ message: "Invalid to date. Use YYYY-MM-DD" });
      }
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to) filter.date.$lte = to;
    }

    if (staffId) {
      if (!isValidId(staffId)) {
        return res.status(400).json({ message: "Invalid staff id" });
      }
      filter.staffId = staffId;
    }

    if (jobCardId) {
      if (!isValidId(jobCardId)) {
        return res.status(400).json({ message: "Invalid job card id" });
      }
      filter.jobCardId = jobCardId;
    }

    if (q) {
      const regex = new RegExp(q, "i");
      filter.$or = [
        { employeeNo: regex },
        { staffName: regex },
        { jobCardNo: regex },
        { serviceTypeName: regex },
        { taskName: regex },
      ];
    }

    const rows = await WorkLog.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const totalLaborHours = rows.reduce(
      (sum, row) => sum + Number(row.laborHours || 0),
      0
    );

    return res.json({
      count: rows.length,
      totalLaborHours,
      rows,
    });
  } catch (error) {
    return next(error);
  }
};

