import mongoose from "mongoose";

const purchaseRequestItemSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true, trim: true },
    itemDescription: { type: String, trim: true, default: "" },
    partNumber: { type: String, trim: true, default: "" },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const purchaseRequestSchema = new mongoose.Schema(
  {
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dealer",
      required: true,
    },
    dealerSnapshot: {
      dealerCode: { type: String, default: "" },
      name: { type: String, default: "" },
      address: { type: String, default: "" },
      email: { type: String, default: "" },
    },
    requestNumber: { type: String, unique: true, trim: true },
    requestDate: { type: Date, default: Date.now },
    items: { type: [purchaseRequestItemSchema], default: [] },
    status: {
      type: String,
      enum: ["DRAFT", "SENT", "CONVERTED"],
      default: "DRAFT",
    },
    sentAt: { type: Date, default: null },
    convertedToInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseInvoice",
      default: null,
    },
    notes: { type: String, trim: true, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const PurchaseRequest =
  mongoose.models.PurchaseRequest ||
  mongoose.model("PurchaseRequest", purchaseRequestSchema);

export default PurchaseRequest;
