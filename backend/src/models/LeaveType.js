import mongoose from "mongoose";

const leaveTypeSchema = new mongoose.Schema(
  {
    leaveTypeId: { type: String, trim: true, index: true, sparse: true },
    name: { type: String, required: true, trim: true, unique: true },
    maxDaysPerYear: { type: Number, min: 0, default: 0 },
    allocationPerYear: { type: Number, min: 0, default: 0 },
    allocationPerMonth: { type: Number, min: 0, default: 0 },
    carryForwardAllowed: { type: Boolean, default: false },
    paid: { type: Boolean, default: true },
    isPaid: { type: Boolean, default: true },
    requiresDocument: { type: Boolean, default: false },
    applicableTo: {
      type: String,
      enum: ["all", "permanent", "daily-paid"],
      default: "all",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const LeaveType =
  mongoose.models.LeaveType || mongoose.model("LeaveType", leaveTypeSchema);

export default LeaveType;
