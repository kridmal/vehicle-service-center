import mongoose from "mongoose";
import SalaryConfig from "../models/SalaryConfig.js";
import Staff from "../models/Staff.js";
import { logAudit } from "../utils/audit.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

export const getSalaryConfig = async (req, res, next) => {
  try {
    const employeeId = String(req.params.employeeId || "");
    if (!isValidId(employeeId)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }
    const row = await SalaryConfig.findOne({ employeeId });
    if (!row) return res.json(null);
    return res.json(row);
  } catch (error) {
    return next(error);
  }
};

export const upsertSalaryConfig = async (req, res, next) => {
  try {
    const employeeId = String(req.params.employeeId || "");
    if (!isValidId(employeeId)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }
    const employee = await Staff.findById(employeeId);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const payload = req.body || {};
    const row = await SalaryConfig.findOneAndUpdate(
      { employeeId },
      {
        employeeId,
        salaryModel: payload.salaryModel || "fixed",
        basicSalary: Number(payload.basicSalary || 0),
        dailyRate: Number(payload.dailyRate || 0),
        allowances: Array.isArray(payload.allowances) ? payload.allowances : [],
        deductions: Array.isArray(payload.deductions) ? payload.deductions : [],
        effectiveFrom: payload.effectiveFrom ? new Date(payload.effectiveFrom) : undefined,
        updatedBy: req.user?.name || req.user?.email || "",
        updatedAt: new Date(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await logAudit({
      req,
      action: "update",
      entity: "salary-config",
      entityId: row._id,
      entityDescription: employee.fullName,
    });
    return res.json(row);
  } catch (error) {
    return next(error);
  }
};
