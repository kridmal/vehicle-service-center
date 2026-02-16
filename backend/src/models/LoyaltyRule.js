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
      // Keep both legacy and current values for backward compatibility
      enum: ["visit_count", "spend_amount", "spending_amount", "service_count"],
      required: true,
    },
    triggerValue: { type: Number, required: true, min: 1 },
    rewardType: {
      type: String,
      // Keep both legacy and current values for backward compatibility
      enum: [
        "free_service",
        "discount_percentage",
        "discount_fixed",
        "discount_amount",
        "free_labor",
      ],
      required: true,
    },
    rewardValue: { type: Number, required: true, min: 0 },
    rewardDiscountMode: {
      type: String,
      enum: ["PERCENT", "AMOUNT", "FULL"],
      default: null,
    },
    rewardDiscountValue: { type: Number, min: 0, default: null },
    rewardDiscountCap: { type: Number, min: 0, default: null },
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
