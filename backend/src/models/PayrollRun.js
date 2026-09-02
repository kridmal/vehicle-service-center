import mongoose from "mongoose";

const payrollRunSchema = new mongoose.Schema(
  {
    year: { type: Number, required: true, min: 1900, index: true },
    month: { type: Number, required: true, min: 1, max: 12, index: true },
    monthKey: { type: String, required: true, trim: true, index: true },
    status: {
      type: String,
      enum: ["DRAFT", "FINALIZED", "PAID"],
      default: "DRAFT",
      index: true,
    },
    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: String, trim: true, default: "" },
    otEnabled: { type: Boolean, default: false },
    otRatePerHourUsed: { type: Number, min: 0, default: 0 },
    standardDailyHoursUsed: { type: Number, min: 0, default: 8 },
    totals: {
      totalGross: { type: Number, min: 0, default: 0 },
      totalDeductions: { type: Number, min: 0, default: 0 },
      totalNet: { type: Number, min: 0, default: 0 },
    },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

payrollRunSchema.index({ year: 1, month: 1 }, { unique: true, name: "year_1_month_1_unique_run" });

const PayrollRun = mongoose.models.PayrollRun || mongoose.model("PayrollRun", payrollRunSchema);

export default PayrollRun;
