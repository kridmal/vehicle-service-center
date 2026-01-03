import mongoose from "mongoose";
import LaborHourDetail from "../models/LaborHourDetail.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizeMonth = (value) => {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
};

const normalizeYear = (value) => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 ? year : null;
};

const startOfMonth = (year, month) => new Date(year, month - 1, 1);
const startOfNextMonth = (year, month) => new Date(year, month, 1);

const parseDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const listLaborHourDetails = async (req, res, next) => {
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

    const records = await LaborHourDetail.find(filter).sort({ date: -1 });
    return res.json(records);
  } catch (error) {
    return next(error);
  }
};
