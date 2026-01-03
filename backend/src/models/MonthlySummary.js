import mongoose from "mongoose";

const monthlySummarySchema = new mongoose.Schema(
  {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 1900 },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    staffName: { type: String, trim: true },
    role: { type: String, trim: true },
    salaryType: { type: String, trim: true },
    workingDays: { type: Number, min: 0, default: 0 },
    presentDays: { type: Number, min: 0, default: 0 },
    halfDays: { type: Number, min: 0, default: 0 },
    leaveDays: { type: Number, min: 0, default: 0 },
    absentDays: { type: Number, min: 0, default: 0 },
    validLaborHours: { type: Number, min: 0, default: 0 },
    actualLaborHours: { type: Number, min: 0, default: 0 },
    incentiveEligibleHours: { type: Number, min: 0, default: 0 },
    otHours: { type: Number, min: 0, default: 0 },
    lopDays: { type: Number, min: 0, default: null },
    lopAmount: { type: Number, min: 0, default: null },
    attendanceStatus: {
      type: String,
      enum: ["DRAFT", "CONFIRMED"],
      default: "DRAFT",
    },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING", "COMPLETED", "LOCKED"],
      default: "DRAFT",
    },
    checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    checkedAt: { type: Date },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    confirmedAt: { type: Date },
  },
  { timestamps: true }
);

monthlySummarySchema.index(
  { staffId: 1, month: 1, year: 1 },
  { unique: true }
);

const MonthlySummary =
  mongoose.models.MonthlySummary ||
  mongoose.model("MonthlySummary", monthlySummarySchema);

export default MonthlySummary;
