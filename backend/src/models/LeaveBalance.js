import mongoose from "mongoose";

const leaveBalanceSchema = new mongoose.Schema(
  {
    balanceId: { type: String, trim: true, index: true, sparse: true },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    leaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveType",
      required: true,
    },
    year: { type: Number, required: true, min: 1900 },
    allocated: { type: Number, default: 0, min: 0 },
    used: { type: Number, default: 0, min: 0 },
    carryForward: { type: Number, default: 0, min: 0 },
    remaining: { type: Number, default: 0, min: 0 },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

leaveBalanceSchema.index(
  { employeeId: 1, leaveTypeId: 1, year: 1 },
  { unique: true }
);

const LeaveBalance =
  mongoose.models.LeaveBalance ||
  mongoose.model("LeaveBalance", leaveBalanceSchema);

export default LeaveBalance;
