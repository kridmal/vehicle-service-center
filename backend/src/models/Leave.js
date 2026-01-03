import mongoose from "mongoose";

const leaveSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    leaveType: { type: String, trim: true, required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    dayType: {
      type: String,
      enum: ["FULL", "HALF"],
      default: "FULL",
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

leaveSchema.index({ staffId: 1, fromDate: 1, toDate: 1 });

const Leave = mongoose.models.Leave || mongoose.model("Leave", leaveSchema);

export default Leave;
