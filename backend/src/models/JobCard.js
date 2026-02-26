import mongoose from "mongoose";

const partUsageSchema = new mongoose.Schema(
  {
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem" },
    sku: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPriceOriginal: { type: Number, min: 0, default: 0 },
    discountPerUnit: { type: Number, min: 0, default: 0 },
    unitPriceNet: { type: Number, min: 0, default: 0 },
    lineDiscountTotal: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const jobTaskSchema = new mongoose.Schema(
  {
    taskInstanceId: { type: String, trim: true, default: null },
    serviceTypeId: { type: String, trim: true, default: null },
    taskId: { type: String, trim: true, default: null },
    taskName: { type: String, trim: true },
    title: { type: String, required: true, trim: true },
    isRequired: { type: Boolean, default: false },
    selected: { type: Boolean, default: false },
    completed: { type: Boolean, default: false },
    laborHours: { type: Number, min: 0, default: 0 },
    laborCharge: { type: Number, min: 0, default: 0 },
    billable: { type: Boolean, default: true },
    isBillable: { type: Boolean, default: true },
    assignedStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Worker", default: null },
    assignedStaffSnapshot: {
      employeeNo: { type: String, trim: true, default: "" },
      name: { type: String, trim: true, default: "" },
    },
  },
  { _id: false }
);

const jobServiceSchema = new mongoose.Schema(
  {
    serviceType: { type: String, required: true, trim: true },
    tasks: { type: [jobTaskSchema], default: [] },
  },
  { _id: false }
);

const assignedWorkerSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Worker" },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: "Worker" },
    name: { type: String, trim: true },
    roleName: { type: String, trim: true },
    role: { type: String, trim: true },
  },
  { _id: false }
);

const appliedRewardSchema = new mongoose.Schema(
  {
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: "LoyaltyRule" },
    rewardId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ruleName: { type: String, trim: true },
    rewardType: { type: String, trim: true },
    rewardValue: { type: Number, default: 0 },
    rewardDiscountMode: {
      type: String,
      enum: ["PERCENT", "AMOUNT", "FULL"],
      default: null,
    },
    rewardDiscountValue: { type: Number, min: 0, default: null },
    rewardDiscountCap: { type: Number, min: 0, default: null },
    milestoneNumber: { type: Number, min: 1, default: null },
    discountAmount: { type: Number, min: 0, default: null },
  },
  { _id: false }
);

const jobCardSchema = new mongoose.Schema(
  {
    jobCardNo: { type: String, required: true, unique: true, trim: true },
    ownerId: { type: String, trim: true },
    customerId: { type: String, required: true, trim: true },
    vehicleId: { type: String, required: true, trim: true },
    serviceTypeIds: { type: [String], default: [] },
    services: { type: [jobServiceSchema], default: [] },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "PENDING", "COMPLETED", "CLOSED"],
      default: "OPEN",
    },
    assignedWorker: { type: String, trim: true },
    assignedWorkers: { type: [assignedWorkerSchema], default: [] },
    partsUsed: { type: [partUsageSchema], default: [] },
    laborCharges: { type: Number, min: 0, default: 0 },
    laborChargesOriginal: { type: Number, min: 0, default: 0 },
    loyaltyLaborDiscount: { type: Number, min: 0, default: 0 },
    laborChargesNet: { type: Number, min: 0, default: 0 },
    subtotalPartsOriginal: { type: Number, min: 0, default: 0 },
    partsDiscountTotal: { type: Number, min: 0, default: 0 },
    subtotalParts: { type: Number, min: 0, default: 0 },
    grandTotal: { type: Number, min: 0, default: 0 },
    loyaltyAppliedAt: { type: Date, default: null },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIAL", "PAID"],
      default: "UNPAID",
    },
    appliedRewards: { type: [appliedRewardSchema], default: [] },
    workNotes: { type: String, trim: true },
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const JobCard = mongoose.models.JobCard || mongoose.model("JobCard", jobCardSchema);

export default JobCard;
