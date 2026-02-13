import mongoose from "mongoose";

const loyaltyRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    serviceTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceType",
      default: null,
    },
    triggerType: {
      type: String,
      enum: ["visit_count", "spend_amount"],
      required: true,
    },
    triggerValue: { type: Number, required: true, min: 1 },
    rewardType: {
      type: String,
      enum: ["free_service", "discount_percentage", "discount_fixed", "free_labor"],
      required: true,
    },
    rewardValue: { type: Number, required: true, min: 0 },
    rewardServiceTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceType",
      default: null,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const LoyaltyRule =
  mongoose.models.LoyaltyRule ||
  mongoose.model("LoyaltyRule", loyaltyRuleSchema);

export default LoyaltyRule;
