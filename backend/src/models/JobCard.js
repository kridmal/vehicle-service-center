import mongoose from "mongoose";

const partUsageSchema = new mongoose.Schema(
  {
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem" },
    sku: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const jobTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    isRequired: { type: Boolean, default: false },
    completed: { type: Boolean, default: false },
    standardLaborHours: { type: Number, min: 0, default: 0 },
    laborHourRate: { type: Number, min: 0, default: 0 },
    assignedStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Worker" },
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

const jobCardSchema = new mongoose.Schema(
  {
    jobCardNo: { type: String, required: true, unique: true, trim: true },
    ownerId: { type: String, trim: true },
    customerId: { type: String, required: true, trim: true },
    vehicleId: { type: String, required: true, trim: true },
    services: { type: [jobServiceSchema], default: [] },
    billingType: {
      type: String,
      enum: ["BILLABLE", "WARRANTY", "REWORK", "FREE"],
      default: "BILLABLE",
    },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "PENDING", "COMPLETED", "CLOSED"],
      default: "OPEN",
    },
    assignedWorker: { type: String, trim: true },
    assignedWorkers: { type: [assignedWorkerSchema], default: [] },
    partsUsed: { type: [partUsageSchema], default: [] },
    laborCharges: { type: Number, min: 0, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIAL", "PAID"],
      default: "UNPAID",
    },
    workNotes: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const JobCard = mongoose.models.JobCard || mongoose.model("JobCard", jobCardSchema);

export default JobCard;
