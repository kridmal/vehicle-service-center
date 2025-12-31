import mongoose from "mongoose";

const staffSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    roleType: { type: String, enum: ["OFFICE", "TECHNICAL"] },
    roleName: { type: String, trim: true },
    salaryType: {
      type: String,
      enum: ["FIXED", "PER_DAY", "COMMISSION", "HYBRID"],
    },
    basicSalary: { type: Number, min: 0, default: 0 },
    commissionPercentage: { type: Number, min: 0, default: 0 },
    perDayRate: { type: Number, min: 0, default: 0 },
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
