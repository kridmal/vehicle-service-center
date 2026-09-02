import AuditLog from "../models/AuditLog.js";

export const listAuditLogs = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.entity) filter.entity = String(req.query.entity);
    if (req.query.performedBy) {
      filter["performedBy.name"] = new RegExp(String(req.query.performedBy), "i");
    }
    if (req.query.from || req.query.to) {
      filter.timestamp = {};
      if (req.query.from) filter.timestamp.$gte = new Date(req.query.from);
      if (req.query.to) filter.timestamp.$lte = new Date(req.query.to);
    }
    const rows = await AuditLog.find(filter).sort({ timestamp: -1 }).limit(500);
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};
