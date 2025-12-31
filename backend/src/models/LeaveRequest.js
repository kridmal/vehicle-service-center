import mongoose from "mongoose";

const leaveRequestSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    leaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveType",
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    requestedBy: { type: String, trim: true },
    approvedBy: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

const LeaveRequest =
  mongoose.models.LeaveRequest ||
  mongoose.model("LeaveRequest", leaveRequestSchema);

export default LeaveRequest;
