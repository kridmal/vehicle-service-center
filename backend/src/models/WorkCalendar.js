import mongoose from "mongoose";

const workCalendarSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, unique: true, trim: true },
    totalDays: { type: Number, required: true, min: 0 },
    weeklyOffPattern: {
      type: String,
      enum: ["SUN", "SAT_SUN", "CUSTOM"],
      default: "SUN",
    },
    weeklyOffDays: { type: [Number], default: [] },
    customOffDates: { type: [Date], default: [] },
    holidays: { type: [Date], default: [] },
    workingDays: { type: Number, required: true, min: 0 },
    workingDaysOverride: { type: Number, min: 0 },
    standardHoursPerDay: { type: Number, min: 0, default: 8 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

workCalendarSchema.index({ month: 1 }, { unique: true });

const WorkCalendar =
  mongoose.models.WorkCalendar ||
  mongoose.model("WorkCalendar", workCalendarSchema);

export default WorkCalendar;
