import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    attendanceId: { type: String, trim: true, index: true, sparse: true },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    employeeId: { type: String, trim: true },
    employeeName: { type: String, trim: true },
    department: { type: String, trim: true },
    role: { type: String, trim: true },
    staffSnapshot: {
      name: { type: String, trim: true },
      roleName: { type: String, trim: true },
      salaryType: { type: String, trim: true },
    },
    summaryKey: { type: String, trim: true },
    date: { type: String, trim: true },
    checkInTime: { type: String, trim: true },
    checkOutTime: { type: String, trim: true },
    status: {
      type: String,
      enum: ["present", "absent", "half-day", "late", "on-leave"],
    },
    notes: { type: String, trim: true },
    leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "LeaveType" },
    leaveTypeName: { type: String, trim: true },
    markedBy: { type: String, trim: true },
    markedAt: { type: Date },
    isLocked: { type: Boolean, default: false },
    source: { type: String, enum: ["manual", "auto-leave"], default: "manual" },
    salaryType: { type: String, trim: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 1900 },
    workingDays: { type: Number, min: 0, default: 26 },
    presentDays: { type: Number, min: 0, default: 0 },
    halfDays: { type: Number, min: 0, default: 0 },
    approvedLeaveDays: { type: Number, min: 0, default: 0 },
    absentDays: { type: Number, min: 0, default: 0 },
    lopDays: { type: Number, min: 0, default: 0 },
    lopAmount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

attendanceSchema.index(
  { summaryKey: 1 },
  { unique: true, sparse: true, name: "summaryKey_1_unique_sparse" }
);
attendanceSchema.index(
  { staffId: 1, date: 1 },
  { unique: true, partialFilterExpression: { date: { $type: "string" } } }
);

const Attendance =
  mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);

export default Attendance;
