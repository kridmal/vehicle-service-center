import mongoose from "mongoose";

const leaveRequestSchema = new mongoose.Schema(
  {
    leaveRequestId: { type: String, trim: true, index: true, sparse: true },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    employeeId: { type: String, trim: true },
    employeeName: { type: String, trim: true },
    leaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveType",
      required: true,
    },
    leaveTypeName: { type: String, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, min: 0, default: 0 },
    totalDays: { type: Number, min: 0, default: 0 },
    reason: { type: String, trim: true },
    attachmentUrl: { type: String, trim: true },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    requestedBy: { type: String, trim: true },
    approvedBy: { type: String, trim: true },
    reviewedBy: { type: String, trim: true },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true },
    autoMarkedAttendance: { type: Boolean, default: false },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

const LeaveRequest =
  mongoose.models.LeaveRequest ||
  mongoose.model("LeaveRequest", leaveRequestSchema);

export default LeaveRequest;
