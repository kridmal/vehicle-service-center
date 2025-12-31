import mongoose from "mongoose";

const leaveTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    maxDaysPerYear: { type: Number, min: 0, default: 0 },
    paid: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const LeaveType =
  mongoose.models.LeaveType || mongoose.model("LeaveType", leaveTypeSchema);

export default LeaveType;
