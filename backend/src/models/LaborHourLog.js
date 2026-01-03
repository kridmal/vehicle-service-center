import mongoose from "mongoose";

const laborHourLogSchema = new mongoose.Schema(
  {
    jobCardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobCard",
      required: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    staffName: { type: String, trim: true },
    date: { type: Date, required: true },
    month: { type: String, required: true },
    laborHours: { type: Number, min: 0, default: 0 },
    billingType: {
      type: String,
      enum: ["BILLABLE", "WARRANTY", "REWORK", "FREE"],
      default: "BILLABLE",
    },
  },
  { timestamps: true }
);

laborHourLogSchema.index({ jobCardId: 1, staffId: 1 }, { unique: true });
laborHourLogSchema.index({ month: 1, staffId: 1 });

const LaborHourLog =
  mongoose.models.LaborHourLog || mongoose.model("LaborHourLog", laborHourLogSchema);

export default LaborHourLog;
