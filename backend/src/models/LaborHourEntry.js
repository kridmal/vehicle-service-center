import mongoose from "mongoose";

const laborHourEntrySchema = new mongoose.Schema(
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
    roleName: { type: String, trim: true },
    taskName: { type: String, trim: true },
    standardLaborHours: { type: Number, min: 0, default: 0 },
    laborHourRate: { type: Number, min: 0, default: 0 },
    date: { type: Date, required: true },
    billingType: {
      type: String,
      enum: ["BILLABLE", "WARRANTY", "REWORK", "FREE"],
      default: "BILLABLE",
    },
  },
  { timestamps: true }
);

laborHourEntrySchema.index({ jobCardId: 1, staffId: 1, taskName: 1 });
laborHourEntrySchema.index({ staffId: 1, date: 1 });

const LaborHourEntry =
  mongoose.models.LaborHourEntry ||
  mongoose.model("LaborHourEntry", laborHourEntrySchema);

export default LaborHourEntry;
