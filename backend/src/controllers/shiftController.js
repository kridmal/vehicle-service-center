import mongoose from "mongoose";
import Shift from "../models/Shift.js";
import Staff from "../models/Staff.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

export const listShifts = async (req, res, next) => {
  try {
    const shifts = await Shift.find().sort({ name: 1 });
    const counts = await Staff.aggregate([
      { $match: { shiftId: { $exists: true, $ne: null } } },
      { $group: { _id: "$shiftId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(
      counts.map((row) => [String(row._id), row.count])
    );
    return res.json(
      shifts.map((shift) => ({
        ...shift.toObject(),
        employeeCount: countMap.get(String(shift._id)) || 0,
      }))
    );
  } catch (error) {
    return next(error);
  }
};

export const createShift = async (req, res, next) => {
  try {
    const { name, startTime, endTime } = req.body;
    if (!name || !startTime || !endTime) {
      return res
        .status(400)
        .json({ message: "Name, start time, and end time are required" });
    }
    const shift = await Shift.create({
      name: String(name).trim(),
      startTime: String(startTime).trim(),
      endTime: String(endTime).trim(),
    });
    return res.status(201).json(shift);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Shift already exists" });
    }
    return next(error);
  }
};

export const updateShift = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid shift id" });
    }
    const updated = await Shift.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      return res.status(404).json({ message: "Shift not found" });
    }
    return res.json(updated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Shift name already exists" });
    }
    return next(error);
  }
};

export const deleteShift = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid shift id" });
    }
    const staffCount = await Staff.countDocuments({ shiftId: id });
    if (staffCount > 0) {
      return res.status(409).json({
        message: `Cannot delete shift with ${staffCount} assigned employee(s)`,
      });
    }
    const deleted = await Shift.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Shift not found" });
    }
    return res.json({ message: "Shift deleted" });
  } catch (error) {
    return next(error);
  }
};
