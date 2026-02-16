import mongoose from "mongoose";

const dealerSnapshotSchema = new mongoose.Schema(
  {
    dealerCode: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    phone1: { type: String, trim: true, default: "" },
    phone2: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const purchaseInvoiceSchema = new mongoose.Schema(
  {
    dealerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dealer",
      required: true,
    },
    dealerSnapshot: { type: dealerSnapshotSchema, default: () => ({}) },
    dealerInvoiceNumber: { type: String, required: true, trim: true },
    purchaseDate: { type: Date, required: true },
    purchaseType: {
      type: String,
      enum: ["CREDIT", "CHEQUE", "CASH"],
      default: "CREDIT",
    },
    status: {
      type: String,
      enum: ["UNPAID", "PARTIALLY_PAID", "PAID"],
      default: "UNPAID",
    },
    subtotal: { type: Number, min: 0, default: 0 },
    invoiceDiscountType: {
      type: String,
      enum: ["AMOUNT", "PERCENT"],
      default: "AMOUNT",
    },
    invoiceDiscountValue: { type: Number, min: 0, default: 0 },
    invoiceDiscountAmount: { type: Number, min: 0, default: 0 },
    taxEnabled: { type: Boolean, default: false },
    taxRate: { type: Number, min: 0, default: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, default: 0 },
    paidAmount: { type: Number, min: 0, default: 0 },
    balanceAmount: { type: Number, min: 0, default: 0 },
    nextVisitDate: { type: Date, default: null },
    remarks: { type: String, trim: true, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

purchaseInvoiceSchema.index(
  { dealerId: 1, dealerInvoiceNumber: 1 },
  { unique: true }
);

const PurchaseInvoice =
  mongoose.models.PurchaseInvoice ||
  mongoose.model("PurchaseInvoice", purchaseInvoiceSchema);

export default PurchaseInvoice;

