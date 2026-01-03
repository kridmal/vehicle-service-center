import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
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
    salaryType: { type: String, trim: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 1900 },
    workingDays: { type: Number, min: 0, default: 26 },
    presentDays: { type: Number, min: 0, default: 0 },
    halfDays: { type: Number, min: 0, default: 0 },
    approvedLeaveDays: { type: Number, min: 0, default: 0 },
    absentDays: { type: Number, min: 0, default: 0 },
    lopDays: { type: Number, min: 0, default: 0 },
    lopAmount: { type: Number, min: 0, default: 0 },
    dailyEntries: {
      type: [
        {
          date: { type: String, trim: true },
          workStart: { type: String, trim: true },
          workEnd: { type: String, trim: true },
          otHours: { type: Number, min: 0, default: 0 },
          otApproved: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    otHours: { type: Number, min: 0, default: 0 },
    otApprovedHours: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

attendanceSchema.index({ staffId: 1, month: 1, year: 1 }, { unique: true });

const Attendance =
  mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);

export default Attendance;
