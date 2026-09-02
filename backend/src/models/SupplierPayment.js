import mongoose from "mongoose";

const supplierPaymentSchema = new mongoose.Schema(
  {
    purchaseInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseInvoice",
      required: true,
    },
    paidDate: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      enum: ["CASH", "CHEQUE", "BANK"],
      default: "CASH",
    },
    referenceNo: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const SupplierPayment =
  mongoose.models.SupplierPayment ||
  mongoose.model("SupplierPayment", supplierPaymentSchema);

export default SupplierPayment;

