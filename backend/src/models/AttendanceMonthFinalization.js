import mongoose from "mongoose";

const attendanceMonthFinalizationSchema = new mongoose.Schema(
  {
    year: { type: Number, required: true, min: 1900, index: true },
    month: { type: Number, required: true, min: 1, max: 12, index: true },
    finalizedAt: { type: Date, default: Date.now, required: true },
    finalizedBy: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

attendanceMonthFinalizationSchema.index(
  { year: 1, month: 1 },
  { unique: true, name: "year_1_month_1_unique_finalization" }
);

const AttendanceMonthFinalization =
  mongoose.models.AttendanceMonthFinalization ||
  mongoose.model("AttendanceMonthFinalization", attendanceMonthFinalizationSchema);

export default AttendanceMonthFinalization;
