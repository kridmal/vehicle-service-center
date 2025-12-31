import mongoose from "mongoose";
import Staff from "../models/Staff.js";

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

const parseNumber = (value) => {
  if (value === null || value === undefined || value === "") return undefined;
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

export const listStaff = async (req, res, next) => {
  try {
    const activeQuery = String(req.query.active || "").toLowerCase();
    const activeOnly = activeQuery === "true";
    const activeFilter = activeOnly ? { active: true } : {};
    const roleType = normalizeRoleQuery(req.query.roleType);
    if (req.query.roleType && !roleType) {
      return res.status(400).json({ message: "Invalid role type filter" });
    }
    const roleFilter = buildRoleQuery(roleType);
    const staff = await Staff.find({ ...activeFilter, ...roleFilter }).sort({
      createdAt: -1,
    });
    return res.json(staff.map((member) => serializeStaff(member)));
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
      active,
      notes,
      idNumber,
      role,
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

    const staff = await Staff.create({
      fullName,
      phoneNumber,
      roleType: normalizedRoleType,
      roleName: normalizedRoleName,
      salaryType: normalizedSalaryType,
      basicSalary: normalizedBasicSalary,
      commissionPercentage: normalizedCommission,
      perDayRate: normalizedPerDay,
      active: active !== undefined ? Boolean(active) : true,
      notes,
      idNumber,
      role,
      skills: normalizeSkills(skills),
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

    const staff = await Staff.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

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

    return res.json({ message: "Staff deleted" });
  } catch (error) {
    return next(error);
  }
};
