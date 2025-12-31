import mongoose from "mongoose";

const payslipSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    staffSnapshot: {
      name: { type: String, trim: true },
      roleName: { type: String, trim: true },
      salaryType: { type: String, trim: true },
    },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 1900 },
    workingDays: { type: Number, min: 0, default: 0 },
    presentDays: { type: Number, min: 0, default: 0 },
    halfDays: { type: Number, min: 0, default: 0 },
    approvedLeaveDays: { type: Number, min: 0, default: 0 },
    lopDays: { type: Number, min: 0, default: 0 },
    lopAmount: { type: Number, min: 0, default: 0 },
    perDayRate: { type: Number, min: 0, default: 0 },
    completedJobs: { type: Number, min: 0, default: 0 },
    earnings: {
      baseSalary: { type: Number, min: 0, default: 0 },
      laborShare: { type: Number, min: 0, default: 0 },
      commission: { type: Number, min: 0, default: 0 },
      bonus: { type: Number, min: 0, default: 0 },
    },
    adjustments: {
      bonus: { type: Number, min: 0, default: 0 },
      advance: { type: Number, min: 0, default: 0 },
      penalties: { type: Number, min: 0, default: 0 },
      other: { type: Number, min: 0, default: 0 },
    },
    deductions: {
      advance: { type: Number, min: 0, default: 0 },
      penalties: { type: Number, min: 0, default: 0 },
      other: { type: Number, min: 0, default: 0 },
    },
    grossSalary: { type: Number, min: 0, default: 0 },
    netSalary: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ["UNPAID", "PAID"],
      default: "UNPAID",
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

payslipSchema.index({ staffId: 1, month: 1, year: 1 }, { unique: true });

const Payslip =
  mongoose.models.Payslip || mongoose.model("Payslip", payslipSchema);

export default Payslip;
