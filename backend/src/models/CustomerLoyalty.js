import mongoose from "mongoose";

const availableRewardSchema = new mongoose.Schema(
  {
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: "LoyaltyRule" },
    ruleName: { type: String, trim: true },
    rewardType: { type: String },
    rewardValue: { type: Number, default: 0 },
    rewardServiceTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceType",
      default: null,
    },
    earnedAt: { type: Date, default: Date.now },
    triggerSnapshot: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: true }
);

const redeemedRewardSchema = new mongoose.Schema(
  {
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: "LoyaltyRule" },
    ruleName: { type: String, trim: true },
    rewardType: { type: String },
    rewardValue: { type: Number, default: 0 },
    redeemedAt: { type: Date, default: Date.now },
    jobCardId: { type: mongoose.Schema.Types.ObjectId, ref: "JobCard" },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
  },
  { _id: true }
);

const serviceTypeCountSchema = new mongoose.Schema(
  {
    serviceTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceType",
    },
    count: { type: Number, default: 0 },
  },
  { _id: false }
);

const customerLoyaltySchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },
    serviceTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceType",
      default: null,
    },
    visitCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    serviceTypeCount: { type: [serviceTypeCountSchema], default: [] },
    firstVisitDate: { type: Date },
    lastVisitDate: { type: Date },
    availableRewards: { type: [availableRewardSchema], default: [] },
    redeemedRewards: { type: [redeemedRewardSchema], default: [] },
  },
  { timestamps: true }
);

const CustomerLoyalty =
  mongoose.models.CustomerLoyalty ||
  mongoose.model("CustomerLoyalty", customerLoyaltySchema);

export default CustomerLoyalty;
