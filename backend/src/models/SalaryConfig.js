import mongoose from "mongoose";

const lineItemSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, min: 0, default: 0 },
    isFixed: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const salaryConfigSchema = new mongoose.Schema(
  {
    salaryConfigId: { type: String, trim: true, index: true, sparse: true },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
      unique: true,
    },
    salaryModel: {
      type: String,
      enum: ["fixed", "daily"],
      default: "fixed",
    },
    basicSalary: { type: Number, min: 0, default: 0 },
    dailyRate: { type: Number, min: 0, default: 0 },
    allowances: { type: [lineItemSchema], default: [] },
    deductions: { type: [lineItemSchema], default: [] },
    effectiveFrom: { type: Date },
    updatedBy: { type: String, trim: true },
    updatedAt: { type: Date },
  },
  { timestamps: true }
);

const SalaryConfig =
  mongoose.models.SalaryConfig || mongoose.model("SalaryConfig", salaryConfigSchema);

export default SalaryConfig;
