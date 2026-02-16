import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Role from "../models/Role.js";
import { canAccessSales, mergePermissions } from "../utils/accessControl.js";

const getTokenFromHeader = (req) => {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return null;
};

export const protect = async (req, res, next) => {
  try {
    const token = getTokenFromHeader(req);
    if (!token) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const { JWT_SECRET } = process.env;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is not set" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireAuth = protect;

export const requireOwner = (req, res, next) => {
  if (!req.user || req.user.role !== "OWNER") {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
};

export const requireSalesAccess = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const user = await User.findById(req.user.id).select("role roleId permissions");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    let role = null;
    if (user.roleId) {
      role = await Role.findById(user.roleId).select("roleName category permissions");
    }

    const permissions = mergePermissions(role?.permissions, user.permissions);
    const hasSalesAccess = canAccessSales({
      role: user.role,
      roleName: role?.roleName,
      roleCategory: role?.category,
      permissions,
    });

    if (!hasSalesAccess) {
      return res.status(403).json({ message: "Forbidden" });
    }

    req.userAccess = {
      roleName: role?.roleName || null,
      roleCategory: role?.category || null,
      permissions,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};
