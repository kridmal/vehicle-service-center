import mongoose from "mongoose";

const invoicePartSchema = new mongoose.Schema(
  {
    sku: { type: String, trim: true },
    itemName: { type: String, trim: true },
    brand: { type: String, trim: true },
    variant: { type: String, trim: true },
    unit: { type: String, trim: true },
    unitPriceOriginal: { type: Number, min: 0, default: 0 },
    discountPerUnit: { type: Number, min: 0, default: 0 },
    unitPriceNet: { type: Number, min: 0, default: 0 },
    unitPrice: { type: Number, min: 0, default: 0 },
    quantity: { type: Number, min: 0, default: 0 },
    lineTotalOriginal: { type: Number, min: 0, default: 0 },
    lineDiscountTotal: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const invoiceAppliedRewardSchema = new mongoose.Schema(
  {
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: "LoyaltyRule" },
    rewardId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ruleName: { type: String, trim: true },
    rewardType: { type: String, trim: true },
    rewardValue: { type: Number, min: 0, default: 0 },
    rewardDiscountMode: {
      type: String,
      enum: ["PERCENT", "AMOUNT", "FULL"],
      default: null,
    },
    rewardDiscountValue: { type: Number, min: 0, default: null },
    rewardDiscountCap: { type: Number, min: 0, default: null },
    milestoneNumber: { type: Number, min: 1, default: null },
    discountAmount: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    invoiceType: {
      type: String,
      enum: ["SALE", "JOB_CARD"],
      default: "JOB_CARD",
    },
    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      default: null,
    },
    jobCard: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobCard",
      required: true,
    },
    jobCardNo: { type: String, required: true, trim: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    vehicleNumber: { type: String, trim: true },
    vehicleBrand: { type: String, trim: true },
    vehicleModel: { type: String, trim: true },
    items: { type: [invoicePartSchema], default: [] },
    partsUsed: { type: [invoicePartSchema], default: [] },
    subtotalPartsOriginal: { type: Number, min: 0, default: 0 },
    partsDiscountTotal: { type: Number, min: 0, default: 0 },
    subtotalParts: { type: Number, min: 0, default: 0 },
    laborCharges: { type: Number, min: 0, default: 0 },
    laborChargesOriginal: { type: Number, min: 0, default: 0 },
    loyaltyLaborDiscount: { type: Number, min: 0, default: 0 },
    laborChargesNet: { type: Number, min: 0, default: 0 },
    subtotal: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },
    appliedRewards: { type: [invoiceAppliedRewardSchema], default: [] },
    totalAmount: { type: Number, min: 0, default: 0 },
    paidAmount: { type: Number, min: 0, default: 0 },
    balanceAmount: { type: Number, min: 0, default: 0 },
    paymentMethod: { type: String, trim: true, default: null },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIAL", "PAID"],
      default: "UNPAID",
    },
    status: {
      type: String,
      enum: ["DRAFT", "FINALIZED"],
      default: "DRAFT",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Invoice = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);

export default Invoice;
