import mongoose from "mongoose";

const OFF_TYPES = ["WEEKEND", "PUBLIC", "CUSTOM"];

const workCalendarDaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true, trim: true, unique: true, index: true },
    year: { type: Number, required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12, index: true },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    isWorkingDay: { type: Boolean, required: true, default: true },
    offType: { type: String, enum: OFF_TYPES, default: null },
    offName: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

workCalendarDaySchema.index({ year: 1, month: 1, date: 1 });

workCalendarDaySchema.pre("validate", function workCalendarNormalize() {
  if (this.isWorkingDay === false) {
    this.offType = this.offType || "CUSTOM";
  } else {
    this.offType = null;
    this.offName = "";
  }
});

const WorkCalendarDay =
  mongoose.models.WorkCalendarDay ||
  mongoose.model("WorkCalendarDay", workCalendarDaySchema);

export default WorkCalendarDay;
