import mongoose from "mongoose";

const invoicePartSchema = new mongoose.Schema(
  {
    sku: { type: String, trim: true },
    itemName: { type: String, trim: true },
    brand: { type: String, trim: true },
    variant: { type: String, trim: true },
    unit: { type: String, trim: true },
    unitPrice: { type: Number, min: 0, default: 0 },
    quantity: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    jobCard: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobCard",
      required: true,
    },
    jobCardNo: { type: String, required: true, trim: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
    customerName: { type: String, trim: true },
    vehicleNumber: { type: String, trim: true },
    partsUsed: { type: [invoicePartSchema], default: [] },
    laborCharges: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, default: 0 },
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
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Invoice = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);

export default Invoice;
