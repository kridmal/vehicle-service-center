import mongoose from "mongoose";

const dailyAttendanceSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    staffName: { type: String, trim: true },
    attendanceType: {
      type: String,
      enum: ["WORK_FULL", "WORK_HALF", "LEAVE_FULL", "LEAVE_HALF", "ABSENT"],
      required: true,
    },
    inTime: { type: String, trim: true },
    outTime: { type: String, trim: true },
    leaveType: { type: String, trim: true, default: null },
    source: {
      type: String,
      enum: ["MANUAL", "BIOMETRIC"],
      default: "MANUAL",
    },
    remarks: { type: String, trim: true },
    isSystemGenerated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

dailyAttendanceSchema.index({ staffId: 1, date: 1 }, { unique: true });
dailyAttendanceSchema.index({ date: 1 });

const DailyAttendance =
  mongoose.models.DailyAttendance ||
  mongoose.model("DailyAttendance", dailyAttendanceSchema);

export default DailyAttendance;
