import mongoose from "mongoose";
import LeaveBalance from "../models/LeaveBalance.js";
import LeaveType from "../models/LeaveType.js";
import Role from "../models/Role.js";
import Staff from "../models/Staff.js";
import { logAudit } from "../utils/audit.js";

const ROLE_TYPES = ["OFFICE", "TECHNICAL"];
const OFFICE_ROLES = ["Owner", "Manager", "Cashier", "Receptionist"];
const TECHNICAL_ROLES = ["Mechanic", "Technician", "Electrician", "Helper"];
const SALARY_TYPES = ["FIXED", "PER_DAY", "COMMISSION", "HYBRID"];

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizeRoleType = (roleType, legacyRole) => {
  if (roleType) {
    const normalized = String(roleType).trim().toUpperCase();
    return ROLE_TYPES.includes(normalized) ? normalized : "";
  }
  if (legacyRole) return "TECHNICAL";
  return "";
};

const matchRoleName = (value, options) => {
  if (!value) return "";
  const normalized = String(value).trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === normalized) || "";
};

const normalizeRoleName = (roleType, roleName, legacyRole) => {
  if (roleType === "OFFICE") {
    return matchRoleName(roleName, OFFICE_ROLES);
  }
  if (roleType === "TECHNICAL") {
    if (roleName) {
      return matchRoleName(roleName, TECHNICAL_ROLES);
    }
    if (legacyRole) {
      const legacy = String(legacyRole).trim().toLowerCase();
      return (
        TECHNICAL_ROLES.find(
          (option) => option.toLowerCase() === legacy
        ) || ""
      );
    }
  }
  return "";
};

const normalizeSalaryType = (salaryType) => {
  if (!salaryType) return "";
  const normalized = String(salaryType).trim().toUpperCase();
  if (normalized === "PER_JOB") return "PER_DAY";
  return SALARY_TYPES.includes(normalized) ? normalized : "";
};

const normalizeSkills = (skills) => {
  if (!skills) return [];
  if (Array.isArray(skills)) {
    return skills
      .map((skill) => String(skill).trim())
      .filter(Boolean);
  }
  return String(skills)
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
};

const nextEmployeeId = async () => {
  const count = await Staff.countDocuments();
  return `EMP-${String(count + 1).padStart(4, "0")}`;
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseNullableNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const resolveRoleDefaults = (staff) => {
  const roleType = normalizeRoleType(staff.roleType, staff.role);
  const resolvedRoleType = roleType || "TECHNICAL";
  const roleName =
    normalizeRoleName(resolvedRoleType, staff.roleName, staff.role) ||
    (resolvedRoleType === "OFFICE" ? "Manager" : "Technician");
  return { roleType: resolvedRoleType, roleName };
};

const serializeStaff = (staff) => {
  const { roleType, roleName } = resolveRoleDefaults(staff);
  const payload = staff.toObject({ getters: true, virtuals: false });
  payload.roleType = roleType;
  payload.roleName = roleName;
  payload.employeeNo = payload.employeeId || "";
  payload.name = payload.fullName || "";
  if (payload.salaryType === "PER_JOB") {
    payload.salaryType = "PER_DAY";
  }
  if (!payload.role) {
    payload.role = roleName.toUpperCase();
  }
  return payload;
};

const normalizeRoleQuery = (roleType) => {
  if (!roleType) return "";
  const normalized = String(roleType).trim().toUpperCase();
  return ROLE_TYPES.includes(normalized) ? normalized : "";
};

const buildRoleQuery = (roleType) => {
  if (!roleType) return {};
  if (roleType === "TECHNICAL") {
    return {
      $or: [
        { roleType: "TECHNICAL" },
        { roleName: { $in: TECHNICAL_ROLES } },
        { role: { $in: TECHNICAL_ROLES.map((role) => role.toUpperCase()) } },
      ],
    };
  }
  return {
    $or: [
      { roleType: "OFFICE" },
      { roleName: { $in: OFFICE_ROLES } },
    ],
  };
};

const ensureLeaveBalances = async (employee) => {
  const year = new Date().getFullYear();
  const leaveTypes = await LeaveType.find({ isActive: { $ne: false } });
  for (const leaveType of leaveTypes) {
    if (
      leaveType.applicableTo === "permanent" &&
      employee.employmentType !== "permanent"
    ) {
      continue;
    }
    if (
      leaveType.applicableTo === "daily-paid" &&
      employee.employmentType !== "daily-paid"
    ) {
      continue;
    }
    const allocated = Number(leaveType.allocationPerYear || leaveType.maxDaysPerYear || 0);
    await LeaveBalance.findOneAndUpdate(
      { employeeId: employee._id, leaveTypeId: leaveType._id, year },
      {
        $setOnInsert: {
          employeeId: employee._id,
          leaveTypeId: leaveType._id,
          year,
          allocated,
          used: 0,
          carryForward: 0,
          remaining: allocated,
          lastUpdated: new Date(),
        },
      },
      { upsert: true }
    );
  }
};

export const listStaff = async (req, res, next) => {
  try {
    const activeQuery = String(req.query.active || "").toLowerCase();
    const activeOnly = activeQuery === "true";
    const activeFilter = activeOnly ? { active: true } : {};
    const statusFilter = req.query.status ? { status: req.query.status } : {};
    const employmentTypeFilter = req.query.employmentType
      ? { employmentType: req.query.employmentType }
      : {};
    const departmentFilter = req.query.departmentId
      ? { departmentId: req.query.departmentId }
      : {};
    const roleFilterDirect = req.query.roleId ? { roleId: req.query.roleId } : {};
    const search = String(req.query.search || "").trim();
    const searchFilter = search
      ? {
          $or: [
            { fullName: new RegExp(search, "i") },
            { employeeId: new RegExp(search, "i") },
            { NIC: new RegExp(search, "i") },
            { phoneNumber: new RegExp(search, "i") },
            { email: new RegExp(search, "i") },
          ],
        }
      : {};
    const roleType = normalizeRoleQuery(req.query.roleType);
    if (req.query.roleType && !roleType) {
      return res.status(400).json({ message: "Invalid role type filter" });
    }
    const roleFilter = buildRoleQuery(roleType);
    const staff = await Staff.find({
      ...activeFilter,
      ...statusFilter,
      ...employmentTypeFilter,
      ...departmentFilter,
      ...roleFilterDirect,
      ...roleFilter,
      ...searchFilter,
    }).sort({
      createdAt: -1,
    });
    return res.json(staff.map((member) => serializeStaff(member)));
  } catch (error) {
    return next(error);
  }
};

export const searchStaff = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) {
      return res.json([]);
    }

    const regex = new RegExp(q, "i");
    const rows = await Staff.find({
      active: { $ne: false },
      status: { $ne: "inactive" },
      $or: [{ employeeId: regex }, { fullName: regex }],
    })
      .select("_id employeeId fullName roleName role status active")
      .sort({ employeeId: 1, fullName: 1 })
      .limit(20);

    return res.json(
      rows.map((row) => ({
        _id: row._id,
        employeeNo: row.employeeId || "",
        name: row.fullName || "",
        role: row.roleName || row.role || "",
        status: row.status || (row.active === false ? "inactive" : "active"),
      }))
    );
  } catch (error) {
    return next(error);
  }
};

export const createStaff = async (req, res, next) => {
  try {
    const {
      fullName,
      phoneNumber,
      roleType,
      roleName,
      salaryType,
      basicSalary,
      commissionPercentage,
      perDayRate,
      otRatePerHourOverride,
      active,
      notes,
      idNumber,
      role,
      roleId,
      departmentId,
      shiftId,
      employeeType,
      employmentType,
      status,
      email,
      address,
      NIC,
      joinDate,
      documents,
      skills,
    } = req.body;
    if (!fullName || !phoneNumber) {
      return res
        .status(400)
        .json({ message: "Full name and phone number are required" });
    }

    const normalizedRoleType = normalizeRoleType(roleType, role);
    const normalizedRoleName = normalizeRoleName(
      normalizedRoleType,
      roleName,
      role
    );
    if (!normalizedRoleType || !normalizedRoleName) {
      return res.status(400).json({
        message: "Role type and role name are required",
      });
    }

    const normalizedSalaryType = normalizeSalaryType(salaryType) || "FIXED";
    const normalizedBasicSalary = parseNumber(basicSalary ?? req.body.baseSalary);
    const normalizedCommission = parseNumber(commissionPercentage);
    const normalizedPerDay = parseNumber(perDayRate);
    const normalizedOtRateOverride = parseNullableNumber(otRatePerHourOverride);

    if (
      normalizedBasicSalary !== undefined &&
      normalizedBasicSalary < 0
    ) {
      return res.status(400).json({ message: "Invalid basic salary" });
    }
    if (normalizedPerDay !== undefined && normalizedPerDay < 0) {
      return res.status(400).json({ message: "Invalid per day rate" });
    }
    if (
      normalizedCommission !== undefined &&
      (normalizedCommission < 0 || normalizedCommission > 100)
    ) {
      return res
        .status(400)
        .json({ message: "Commission must be between 0 and 100" });
    }
    if (normalizedOtRateOverride === undefined || normalizedOtRateOverride < 0) {
      return res.status(400).json({ message: "Invalid OT rate override" });
    }

    if (roleId && !isValidId(roleId)) {
      return res.status(400).json({ message: "Invalid roleId" });
    }
    if (roleId) {
      const roleDoc = await Role.findById(roleId);
      if (!roleDoc) return res.status(404).json({ message: "Role not found" });
    }

    const generatedEmployeeId = (req.body.employeeId || "").trim() || (await nextEmployeeId());
    const staff = await Staff.create({
      employeeId: generatedEmployeeId,
      fullName,
      email,
      address,
      NIC,
      phoneNumber,
      phone: phoneNumber,
      roleType: normalizedRoleType,
      roleName: normalizedRoleName,
      employeeType:
        employeeType ||
        (normalizedRoleType === "OFFICE" ? "office" : "technical"),
      employmentType: employmentType || "permanent",
      departmentId: departmentId || undefined,
      roleId: roleId || undefined,
      shiftId: shiftId || undefined,
      joinDate: joinDate ? new Date(joinDate) : undefined,
      status: status || (active === false ? "inactive" : "active"),
      documents: Array.isArray(documents) ? documents : [],
      salaryType: normalizedSalaryType,
      basicSalary: normalizedBasicSalary,
      commissionPercentage: normalizedCommission,
      perDayRate: normalizedPerDay,
      otRatePerHourOverride: normalizedOtRateOverride,
      active: active !== undefined ? Boolean(active) : true,
      notes,
      idNumber,
      role,
      skills: normalizeSkills(skills),
    });
    await ensureLeaveBalances(staff);
    await logAudit({
      req,
      action: "create",
      entity: "employee",
      entityId: staff._id,
      entityDescription: staff.fullName,
    });

    return res.status(201).json(serializeStaff(staff));
  } catch (error) {
    return next(error);
  }
};

export const updateStaff = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }

    const updates = { ...req.body };
    if (updates.roleType || updates.roleName || updates.role) {
      const normalizedRoleType = normalizeRoleType(
        updates.roleType,
        updates.role
      );
      const normalizedRoleName = normalizeRoleName(
        normalizedRoleType,
        updates.roleName,
        updates.role
      );
      if (!normalizedRoleType || !normalizedRoleName) {
        return res.status(400).json({
          message: "Role type and role name are required",
        });
      }
      updates.roleType = normalizedRoleType;
      updates.roleName = normalizedRoleName;
    }

    if (updates.salaryType !== undefined) {
      const normalizedSalaryType =
        normalizeSalaryType(updates.salaryType);
      if (!normalizedSalaryType) {
        return res.status(400).json({ message: "Invalid salary type" });
      }
      updates.salaryType = normalizedSalaryType;
    }
    const unsetFields = {};
    const optionalRefFields = {
      roleId: "role id",
      departmentId: "department id",
      shiftId: "shift id",
    };
    for (const [field, label] of Object.entries(optionalRefFields)) {
      if (updates[field] === undefined) continue;
      const normalized = String(updates[field] ?? "").trim();
      if (!normalized) {
        unsetFields[field] = 1;
        delete updates[field];
        continue;
      }
      if (!isValidId(normalized)) {
        return res.status(400).json({ message: `Invalid ${label}` });
      }
      updates[field] = normalized;
    }

    if (updates.roleId !== undefined) {
      const roleDoc = await Role.findById(updates.roleId);
      if (!roleDoc) return res.status(404).json({ message: "Role not found" });
    }

    if (updates.employeeId !== undefined) {
      const normalizedEmployeeId = String(updates.employeeId ?? "").trim();
      if (!normalizedEmployeeId) {
        unsetFields.employeeId = 1;
        delete updates.employeeId;
      } else {
        updates.employeeId = normalizedEmployeeId;
      }
    }

    if (updates.joinDate !== undefined) {
      const normalizedJoinDate = String(updates.joinDate ?? "").trim();
      if (!normalizedJoinDate) {
        unsetFields.joinDate = 1;
        delete updates.joinDate;
      } else {
        const parsedDate = new Date(normalizedJoinDate);
        if (Number.isNaN(parsedDate.getTime())) {
          return res.status(400).json({ message: "Invalid join date" });
        }
        updates.joinDate = parsedDate;
      }
    }

    if (updates.skills !== undefined) {
      updates.skills = normalizeSkills(updates.skills);
    }

    if (updates.basicSalary !== undefined || updates.baseSalary !== undefined) {
      const normalized = parseNumber(updates.basicSalary ?? updates.baseSalary);
      if (normalized !== undefined && normalized < 0) {
        return res.status(400).json({ message: "Invalid basic salary" });
      }
      updates.basicSalary = normalized;
      delete updates.baseSalary;
    }

    if (updates.perDayRate !== undefined) {
      const normalized = parseNumber(updates.perDayRate);
      if (normalized !== undefined && normalized < 0) {
        return res.status(400).json({ message: "Invalid per day rate" });
      }
      updates.perDayRate = normalized;
    }

    if (updates.commissionPercentage !== undefined) {
      const normalized = parseNumber(updates.commissionPercentage);
      if (
        normalized !== undefined &&
        (normalized < 0 || normalized > 100)
      ) {
        return res
          .status(400)
          .json({ message: "Commission must be between 0 and 100" });
      }
      updates.commissionPercentage = normalized;
    }

    if (updates.otRatePerHourOverride !== undefined) {
      const normalized = parseNullableNumber(updates.otRatePerHourOverride);
      if (normalized === undefined || normalized < 0) {
        return res.status(400).json({ message: "Invalid OT rate override" });
      }
      updates.otRatePerHourOverride = normalized;
    }

    const updateDoc =
      Object.keys(unsetFields).length > 0
        ? { $set: updates, $unset: unsetFields }
        : updates;

    const staff = await Staff.findByIdAndUpdate(id, updateDoc, {
      new: true,
      runValidators: true,
    });
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    if (updates.employmentType !== undefined) {
      await ensureLeaveBalances(staff);
    }
    await logAudit({
      req,
      action: "update",
      entity: "employee",
      entityId: staff._id,
      entityDescription: staff.fullName,
    });
    return res.json(serializeStaff(staff));
  } catch (error) {
    return next(error);
  }
};

export const deleteStaff = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid staff id" });
    }

    const staff = await Staff.findByIdAndDelete(id);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    await logAudit({
      req,
      action: "delete",
      entity: "employee",
      entityId: staff._id,
      entityDescription: staff.fullName,
    });
    return res.json({ message: "Staff deleted" });
  } catch (error) {
    return next(error);
  }
};
