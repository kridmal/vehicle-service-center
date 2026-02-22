import mongoose from "mongoose";

const payrollLineSchema = new mongoose.Schema(
  {
    payrollRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PayrollRun",
      required: true,
      index: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
      index: true,
    },
    staffSnapshot: {
      name: { type: String, trim: true, default: "" },
      role: { type: String, trim: true, default: "" },
      employeeCode: { type: String, trim: true, default: "" },
    },
    salaryType: { type: String, enum: ["MONTHLY", "DAILY"], required: true },
    calendarSummary: {
      workingDaysInMonth: { type: Number, min: 0, default: 0 },
      weekendOffDays: { type: Number, min: 0, default: 0 },
      holidaysCount: { type: Number, min: 0, default: 0 },
    },
    attendanceSummary: {
      presentDays: { type: Number, min: 0, default: 0 },
      absentDays: { type: Number, min: 0, default: 0 },
      leavePaidDays: { type: Number, min: 0, default: 0 },
      leaveUnpaidDays: { type: Number, min: 0, default: 0 },
      halfDays: { type: Number, min: 0, default: 0 },
      unmarkedDays: { type: Number, min: 0, default: 0 },
    },
    payComponents: {
      basicSalary: { type: Number, min: 0, default: 0 },
      allowancesTotal: { type: Number, min: 0, default: 0 },
      grossPay: { type: Number, min: 0, default: 0 },
    },
    deductions: {
      lopDays: { type: Number, min: 0, default: 0 },
      lopAmount: { type: Number, min: 0, default: 0 },
      fixedDeductionsTotal: { type: Number, min: 0, default: 0 },
      totalDeductions: { type: Number, min: 0, default: 0 },
    },
    netPay: { type: Number, min: 0, default: 0 },
    paymentStatus: { type: String, enum: ["UNPAID", "PAID"], default: "UNPAID", index: true },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

payrollLineSchema.index(
  { payrollRunId: 1, staffId: 1 },
  { unique: true, name: "payrollRunId_1_staffId_1_unique_line" }
);

const PayrollLine = mongoose.models.PayrollLine || mongoose.model("PayrollLine", payrollLineSchema);

export default PayrollLine;
