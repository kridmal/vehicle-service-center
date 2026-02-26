import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["NIC", "contract", "certificate"],
      required: true,
    },
    url: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const staffSchema = new mongoose.Schema(
  {
    employeeId: { type: String, trim: true, index: true, sparse: true },
    fullName: { type: String, required: true, trim: true },
    NIC: { type: String, trim: true },
    address: { type: String, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    roleType: { type: String, enum: ["OFFICE", "TECHNICAL"] },
    roleName: { type: String, trim: true },
    employeeType: { type: String, enum: ["office", "technical"] },
    employmentType: {
      type: String,
      enum: ["permanent", "daily-paid", "contract"],
      default: "permanent",
    },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: "Shift" },
    joinDate: { type: Date },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    documents: { type: [documentSchema], default: [] },
    salaryType: {
      type: String,
      enum: ["FIXED", "PER_DAY", "COMMISSION", "HYBRID"],
    },
    basicSalary: { type: Number, min: 0, default: 0 },
    commissionPercentage: { type: Number, min: 0, default: 0 },
    perDayRate: { type: Number, min: 0, default: 0 },
    otRatePerHourOverride: { type: Number, min: 0, default: null },
    active: { type: Boolean, default: true },
    notes: { type: String, trim: true },
    idNumber: { type: String, trim: true },
    role: { type: String, trim: true },
    skills: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Staff = mongoose.models.Worker || mongoose.model("Worker", staffSchema);

export default Staff;
