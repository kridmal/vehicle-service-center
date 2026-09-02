import mongoose from "mongoose";

const staffAdvanceSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
      index: true,
    },
    requestDate: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "PAID_OUT", "SETTLED"],
      default: "PENDING",
      index: true,
    },
    approvedBy: { type: String, trim: true, default: "" },
    approvedAt: { type: Date, default: null },
    paidOutBy: { type: String, trim: true, default: "" },
    paidOutAt: { type: Date, default: null },
    settledAt: { type: Date, default: null },
    outstandingAmount: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

staffAdvanceSchema.index({ staffId: 1, status: 1, requestDate: 1 });

const StaffAdvance =
  mongoose.models.StaffAdvance || mongoose.model("StaffAdvance", staffAdvanceSchema);

export default StaffAdvance;
