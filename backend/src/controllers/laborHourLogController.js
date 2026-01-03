import mongoose from "mongoose";
import LaborHourEntry from "../models/LaborHourEntry.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizeMonth = (value) => {
  const month = String(value || "").trim();
  if (!month) return null;
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthPart] = month.split("-").map((part) => Number(part));
  if (!year || !monthPart || monthPart < 1 || monthPart > 12) return null;
  return { key: month, year, month: monthPart };
};

export const listLaborHourLogs = async (req, res, next) => {
  try {
    const monthInfo = normalizeMonth(req.query.month);
    if (!monthInfo) {
      return res.status(400).json({ message: "Month is required (YYYY-MM)" });
    }

    if (req.query.staffId) {
      if (!isValidId(req.query.staffId)) {
        return res.status(400).json({ message: "Invalid staff id" });
      }
    }

    const rangeStart = new Date(monthInfo.year, monthInfo.month - 1, 1);
    const rangeEnd = new Date(monthInfo.year, monthInfo.month, 1);

    const match = {
      date: { $gte: rangeStart, $lt: rangeEnd },
      $or: [
        { billingType: "BILLABLE" },
        { billingType: { $exists: false } },
        { billingType: null },
      ],
    };
    if (req.query.staffId) {
      match.staffId = new mongoose.Types.ObjectId(req.query.staffId);
    }

    const records = await LaborHourEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            staffId: "$staffId",
            jobCardId: "$jobCardId",
            date: "$date",
          },
          staffName: { $first: "$staffName" },
          laborHours: { $sum: "$standardLaborHours" },
        },
      },
      {
        $project: {
          _id: 1,
          staffId: "$_id.staffId",
          jobCardId: "$_id.jobCardId",
          date: "$_id.date",
          staffName: 1,
          laborHours: 1,
        },
      },
      { $sort: { date: -1 } },
    ]);

    return res.json(records);
  } catch (error) {
    return next(error);
  }
};
