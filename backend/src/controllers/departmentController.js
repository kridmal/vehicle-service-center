import mongoose from "mongoose";
import Department from "../models/Department.js";
import Staff from "../models/Staff.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

export const listDepartments = async (req, res, next) => {
  try {
    const departments = await Department.find().sort({ name: 1 });
    const counts = await Staff.aggregate([
      { $match: { departmentId: { $exists: true, $ne: null } } },
      { $group: { _id: "$departmentId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(
      counts.map((row) => [String(row._id), row.count])
    );
    return res.json(
      departments.map((dept) => ({
        ...dept.toObject(),
        employeeCount: countMap.get(String(dept._id)) || 0,
      }))
    );
  } catch (error) {
    return next(error);
  }
};

export const createDepartment = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Department name is required" });
    }
    const department = await Department.create({
      name: String(name).trim(),
      description: description ? String(description).trim() : undefined,
    });
    return res.status(201).json(department);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Department already exists" });
    }
    return next(error);
  }
};

export const updateDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid department id" });
    }
    const updated = await Department.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      return res.status(404).json({ message: "Department not found" });
    }
    return res.json(updated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Department name already exists" });
    }
    return next(error);
  }
};

export const deleteDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid department id" });
    }
    const staffCount = await Staff.countDocuments({ departmentId: id });
    if (staffCount > 0) {
      return res.status(409).json({
        message: `Cannot delete department with ${staffCount} assigned employee(s)`,
      });
    }
    const deleted = await Department.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Department not found" });
    }
    return res.json({ message: "Department deleted" });
  } catch (error) {
    return next(error);
  }
};
