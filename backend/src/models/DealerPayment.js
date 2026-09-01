import mongoose from "mongoose";

const allocationSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseInvoice" },
    amountApplied: { type: Number, min: 0 },
    resultingStatus: {
      type: String,
      enum: ["UNPAID", "PARTIALLY_PAID", "PAID"],
    },
  },
  { _id: false }
);

const dealerPaymentSchema = new mongoose.Schema(
  {
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dealer",
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now },
    notes: { type: String, trim: true, default: "" },
    allocations: { type: [allocationSchema], default: [] },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const DealerPayment =
  mongoose.models.DealerPayment ||
  mongoose.model("DealerPayment", dealerPaymentSchema);

export default DealerPayment;
