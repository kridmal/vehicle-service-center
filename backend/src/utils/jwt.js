import jwt from "jsonwebtoken";

export const signToken = (payload) => {
  const { JWT_SECRET } = process.env;
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
};
