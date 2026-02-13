import mongoose from "mongoose";

const changeSchema = new mongoose.Schema(
  {
    field: { type: String, trim: true },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const auditLogSchema = new mongoose.Schema(
  {
    auditId: { type: String, trim: true, index: true, sparse: true },
    timestamp: { type: Date, default: Date.now },
    performedBy: {
      userId: { type: String, trim: true },
      name: { type: String, trim: true },
    },
    action: {
      type: String,
      enum: ["create", "update", "delete", "approve", "reject", "lock", "unlock"],
      required: true,
    },
    entity: {
      type: String,
      enum: [
        "attendance",
        "leave",
        "payroll",
        "employee",
        "salary-config",
        "role",
        "work-calendar",
      ],
      required: true,
    },
    entityId: { type: String, required: true, trim: true },
    entityDescription: { type: String, trim: true },
    changes: { type: [changeSchema], default: [] },
  },
  { timestamps: false }
);

const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
