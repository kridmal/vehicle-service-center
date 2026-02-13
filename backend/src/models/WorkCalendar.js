import mongoose from "mongoose";

const workCalendarSchema = new mongoose.Schema(
  {
    calendarId: { type: String, trim: true, index: true, sparse: true },
    month: { type: String, required: true, trim: true, unique: true },
    totalDays: { type: Number, min: 0, required: true },
    weeklyOffPattern: {
      type: String,
      enum: ["none", "sunday", "saturday-sunday", "custom"],
      default: "sunday",
    },
    customWeeklyOffDays: { type: [String], default: [] },
    customOffDates: { type: [String], default: [] },
    holidayDates: { type: [String], default: [] },
    calculatedWorkingDays: { type: Number, min: 0, default: 0 },
    workingDaysOverride: { type: Number, min: 0, default: 0 },
    effectiveWorkingDays: { type: Number, min: 0, default: 0 },
    createdBy: { type: String, trim: true },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

const WorkCalendar =
  mongoose.models.WorkCalendar ||
  mongoose.model("WorkCalendar", workCalendarSchema);

export default WorkCalendar;
