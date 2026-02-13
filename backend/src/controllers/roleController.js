import mongoose from "mongoose";
import Role from "../models/Role.js";
import Staff from "../models/Staff.js";
import { logAudit } from "../utils/audit.js";

const ROLE_SEED = [
  { roleName: "Admin", category: "office" },
  { roleName: "Manager", category: "office" },
  { roleName: "Reception", category: "office" },
  { roleName: "Management Assistant", category: "office" },
  { roleName: "Technician", category: "technical" },
  { roleName: "Electrician", category: "technical" },
  { roleName: "Helper", category: "technical" },
  { roleName: "Car Washer", category: "technical" },
];

const withDefaults = (permissions = {}) => ({
  markAttendance: Boolean(permissions.markAttendance),
  approveLeave: Boolean(permissions.approveLeave),
  runPayroll: Boolean(permissions.runPayroll),
  viewReports: Boolean(permissions.viewReports),
  manageEmployees: Boolean(permissions.manageEmployees),
  manageRoles: Boolean(permissions.manageRoles),
  manageInventory: Boolean(permissions.manageInventory),
  manageJobCards: Boolean(permissions.manageJobCards),
  manageCustomers: Boolean(permissions.manageCustomers),
  manageInvoices: Boolean(permissions.manageInvoices),
  manageVehicles: Boolean(permissions.manageVehicles),
  manageServices: Boolean(permissions.manageServices),
  viewDashboard: Boolean(permissions.viewDashboard),
  manageSalaryConfig: Boolean(permissions.manageSalaryConfig),
  approvePayroll: Boolean(permissions.approvePayroll),
});

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

export const listRoles = async (req, res, next) => {
  try {
    const roles = await Role.find().sort({ roleName: 1 });
    const counts = await Staff.aggregate([
      { $match: { roleId: { $exists: true, $ne: null } } },
      { $group: { _id: "$roleId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((row) => [String(row._id), row.count]));
    return res.json(
      roles.map((row) => ({
        ...row.toObject(),
        employeeCount: countMap.get(String(row._id)) || 0,
      }))
    );
  } catch (error) {
    return next(error);
  }
};

export const seedRoles = async (req, res, next) => {
  try {
    const ops = ROLE_SEED.map((row) => ({
      updateOne: {
        filter: { roleName: row.roleName },
        update: {
          $setOnInsert: {
            ...row,
            permissions: withDefaults({
              viewDashboard: true,
              ...(row.roleName === "Admin"
                ? {
                    markAttendance: true,
                    approveLeave: true,
                    runPayroll: true,
                    viewReports: true,
                    manageEmployees: true,
                    manageRoles: true,
                    manageInventory: true,
                    manageJobCards: true,
                    manageCustomers: true,
                    manageInvoices: true,
                    manageVehicles: true,
                    manageServices: true,
                    manageSalaryConfig: true,
                    approvePayroll: true,
                  }
                : {}),
            }),
          },
        },
        upsert: true,
      },
    }));
    await Role.bulkWrite(ops, { ordered: false });
    const roles = await Role.find().sort({ roleName: 1 });
    return res.json(roles);
  } catch (error) {
    return next(error);
  }
};

export const createRole = async (req, res, next) => {
  try {
    const { roleName, category, permissions } = req.body;
    if (!roleName || !category) {
      return res.status(400).json({ message: "roleName and category are required" });
    }
    const role = await Role.create({
      roleName: String(roleName).trim(),
      category: String(category).toLowerCase(),
      permissions: withDefaults(permissions),
    });
    await logAudit({
      req,
      action: "create",
      entity: "role",
      entityId: role._id,
      entityDescription: role.roleName,
    });
    return res.status(201).json(role);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Role already exists" });
    }
    return next(error);
  }
};

export const updateRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid role id" });
    const updates = { ...req.body };
    if (updates.permissions) {
      updates.permissions = withDefaults(updates.permissions);
    }
    const role = await Role.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!role) return res.status(404).json({ message: "Role not found" });
    await logAudit({
      req,
      action: "update",
      entity: "role",
      entityId: role._id,
      entityDescription: role.roleName,
    });
    return res.json(role);
  } catch (error) {
    return next(error);
  }
};
