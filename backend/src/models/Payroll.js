import mongoose from "mongoose";

const namedAmountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    amount: { type: Number, min: 0, default: 0 },
    reason: { type: String, trim: true },
  },
  { _id: false }
);

const payrollSchema = new mongoose.Schema(
  {
    payrollId: { type: String, trim: true, index: true, sparse: true },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    employeeName: { type: String, required: true, trim: true },
    month: { type: String, required: true, trim: true },
    year: { type: Number, required: true, min: 1900 },
    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: String, trim: true },
    attendanceSummary: {
      workingDays: { type: Number, default: 0 },
      presentDays: { type: Number, default: 0 },
      absentDays: { type: Number, default: 0 },
      leaveDays: { type: Number, default: 0 },
      lopDays: { type: Number, default: 0 },
      halfDays: { type: Number, default: 0 },
      lateDays: { type: Number, default: 0 },
      paidLeaveDays: { type: Number, default: 0 },
    },
    earnings: {
      basicSalary: { type: Number, default: 0 },
      allowances: { type: [namedAmountSchema], default: [] },
      grossEarnings: { type: Number, default: 0 },
    },
    deductions: {
      lopDeduction: { type: Number, default: 0 },
      halfDayDeduction: { type: Number, default: 0 },
      otherDeductions: { type: [namedAmountSchema], default: [] },
      totalDeductions: { type: Number, default: 0 },
    },
    oneTimeAllowances: { type: [namedAmountSchema], default: [] },
    oneTimeDeductions: { type: [namedAmountSchema], default: [] },
    netSalary: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "approved", "paid", "partially-paid"],
      default: "draft",
    },
    approvedBy: { type: String, trim: true },
    approvedAt: { type: Date },
    paymentDate: { type: Date },
    paymentMethod: { type: String, trim: true },
    paymentReference: { type: String, trim: true },
    paymentNotes: { type: String, trim: true },
    isLocked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

payrollSchema.index({ employeeId: 1, month: 1 }, { unique: true });

const Payroll = mongoose.models.Payroll || mongoose.model("Payroll", payrollSchema);

export default Payroll;
