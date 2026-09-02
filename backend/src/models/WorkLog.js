import mongoose from "mongoose";

const workLogSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, trim: true, index: true },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
      index: true,
    },
    employeeNo: { type: String, trim: true, default: "" },
    staffName: { type: String, trim: true, default: "" },
    jobCardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobCard",
      required: true,
      index: true,
    },
    jobCardNo: { type: String, trim: true, default: "" },
    serviceTypeId: { type: String, trim: true, default: "" },
    serviceTypeName: { type: String, trim: true, default: "" },
    taskInstanceId: { type: String, required: true, trim: true },
    taskName: { type: String, trim: true, default: "" },
    laborHours: { type: Number, min: 0, default: 0 },
    billable: { type: Boolean, default: true },
    selected: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["CONFIRMED"],
      default: "CONFIRMED",
    },
  },
  { timestamps: true }
);

workLogSchema.index({ staffId: 1, date: 1 });
workLogSchema.index(
  { jobCardId: 1, taskInstanceId: 1, staffId: 1 },
  { unique: true, name: "jobCardId_1_taskInstanceId_1_staffId_1_unique_worklog" }
);

const WorkLog = mongoose.models.WorkLog || mongoose.model("WorkLog", workLogSchema);

export default WorkLog;
