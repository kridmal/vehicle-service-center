import mongoose from "mongoose";

const laborHourDetailSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, immutable: true },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
      immutable: true,
    },
    staffName: { type: String, trim: true, immutable: true },
    jobCardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobCard",
      required: true,
      immutable: true,
    },
    serviceType: { type: String, trim: true, immutable: true },
    taskName: { type: String, trim: true, immutable: true },
    standardLaborHours: { type: Number, min: 0, default: 0, immutable: true },
    billingType: {
      type: String,
      enum: ["BILLABLE", "WARRANTY", "REWORK", "FREE"],
      default: "BILLABLE",
      immutable: true,
    },
  },
  { timestamps: true }
);

laborHourDetailSchema.index({ jobCardId: 1, staffId: 1, taskName: 1 });
laborHourDetailSchema.index({ staffId: 1, date: 1 });

const LaborHourDetail =
  mongoose.models.LaborHourDetail ||
  mongoose.model("LaborHourDetail", laborHourDetailSchema);

export default LaborHourDetail;
