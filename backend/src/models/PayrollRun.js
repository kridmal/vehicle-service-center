import mongoose from "mongoose";

const payrollRunSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    staffSnapshot: {
      name: { type: String, trim: true },
      roleName: { type: String, trim: true },
      salaryType: { type: String, trim: true },
    },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 1900 },
    attendanceSummary: {
      workingDays: { type: Number, min: 0, default: 0 },
      presentDays: { type: Number, min: 0, default: 0 },
      halfDays: { type: Number, min: 0, default: 0 },
      approvedLeaveDays: { type: Number, min: 0, default: 0 },
      absentDays: { type: Number, min: 0, default: 0 },
      lopDays: { type: Number, min: 0, default: 0 },
      lopAmount: { type: Number, min: 0, default: 0 },
    },
    laborSummary: {
      completedJobs: { type: Number, min: 0, default: 0 },
      totalLaborHours: { type: Number, min: 0, default: 0 },
      targetHours: { type: Number, min: 0, default: 0 },
      extraHours: { type: Number, min: 0, default: 0 },
      laborValue: { type: Number, min: 0, default: 0 },
      incentivePercentage: { type: Number, min: 0, max: 100, default: 0 },
      incentiveAmount: { type: Number, min: 0, default: 0 },
    },
    overtimeSummary: {
      totalOtHours: { type: Number, min: 0, default: 0 },
      approvedOtHours: { type: Number, min: 0, default: 0 },
      otRate: { type: Number, min: 0, default: 0 },
      otAmount: { type: Number, min: 0, default: 0 },
    },
    allowances: {
      recurringTotal: { type: Number, min: 0, default: 0 },
      oneOffTotal: { type: Number, min: 0, default: 0 },
    },
    adjustments: {
      bonus: { type: Number, min: 0, default: 0 },
    },
    deductions: {
      advance: { type: Number, min: 0, default: 0 },
      penalties: { type: Number, min: 0, default: 0 },
      other: { type: Number, min: 0, default: 0 },
    },
    earnings: {
      baseSalary: { type: Number, min: 0, default: 0 },
      perDayEarnings: { type: Number, min: 0, default: 0 },
      incentive: { type: Number, min: 0, default: 0 },
      overtime: { type: Number, min: 0, default: 0 },
      allowances: { type: Number, min: 0, default: 0 },
    },
    grossSalary: { type: Number, min: 0, default: 0 },
    netSalary: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ["DRAFT", "FINALIZED"],
      default: "DRAFT",
    },
    finalizedAt: { type: Date },
  },
  { timestamps: true }
);

payrollRunSchema.index({ staffId: 1, month: 1, year: 1 }, { unique: true });

const PayrollRun =
  mongoose.models.PayrollRun || mongoose.model("PayrollRun", payrollRunSchema);

export default PayrollRun;
