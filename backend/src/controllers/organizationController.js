import Department from "../models/Department.js";
import Shift from "../models/Shift.js";

const DEPARTMENT_SEED = [
  { name: "Office", description: "Office operations and admin" },
  { name: "Workshop", description: "Technical workshop operations" },
  { name: "Detailing", description: "Vehicle detailing and washing" },
];

const SHIFT_SEED = [
  { name: "Morning", startTime: "08:00", endTime: "17:00" },
  { name: "Evening", startTime: "13:00", endTime: "22:00" },
  { name: "Standard", startTime: "09:00", endTime: "18:00" },
];

export const listDepartments = async (req, res, next) => {
  try {
    const rows = await Department.find().sort({ name: 1 });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

export const seedDepartments = async (req, res, next) => {
  try {
    const ops = DEPARTMENT_SEED.map((row) => ({
      updateOne: {
        filter: { name: row.name },
        update: { $setOnInsert: row },
        upsert: true,
      },
    }));
    await Department.bulkWrite(ops, { ordered: false });
    const rows = await Department.find().sort({ name: 1 });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

export const listShifts = async (req, res, next) => {
  try {
    const rows = await Shift.find().sort({ name: 1 });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

export const seedShifts = async (req, res, next) => {
  try {
    const ops = SHIFT_SEED.map((row) => ({
      updateOne: {
        filter: { name: row.name },
        update: { $setOnInsert: row },
        upsert: true,
      },
    }));
    await Shift.bulkWrite(ops, { ordered: false });
    const rows = await Shift.find().sort({ name: 1 });
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};
