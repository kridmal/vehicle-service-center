import AuditLog from "../models/AuditLog.js";

export const logAudit = async ({
  req,
  action,
  entity,
  entityId,
  entityDescription,
  changes = [],
}) => {
  try {
    await AuditLog.create({
      timestamp: new Date(),
      performedBy: {
        userId: req?.user?.id ? String(req.user.id) : "",
        name: req?.user?.name || req?.user?.email || "system",
      },
      action,
      entity,
      entityId: String(entityId || ""),
      entityDescription: entityDescription || "",
      changes,
    });
  } catch {
    // Avoid blocking primary operations on audit write failure.
  }
};
