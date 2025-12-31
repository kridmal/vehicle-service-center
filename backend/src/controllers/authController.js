import User from "../models/User.js";
import { signToken } from "../utils/jwt.js";

export const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const allowedRoles = ["OWNER", "OPERATOR"];
    const userRole = allowedRoles.includes(role) ? role : "OPERATOR";

    const user = await User.create({
      name,
      email,
      password,
      role: userRole,
    });

    const token = signToken({ id: user._id, role: user.role });
    return res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (error) {
    return next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken({ id: user._id, role: user.role });
    return res.json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (error) {
    return next(error);
  }
};

export const me = async (req, res) => {
  return res.json({ user: req.user });
};
