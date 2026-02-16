import mongoose from "mongoose";

const itemSnapshotSchema = new mongoose.Schema(
  {
    sku: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const purchaseInvoiceItemSchema = new mongoose.Schema(
  {
    purchaseInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseInvoice",
      required: true,
    },
    inventoryItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
    },
    itemSnapshot: { type: itemSnapshotSchema, default: () => ({}) },
    qty: { type: Number, required: true, min: 0 },
    unitCostPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

const PurchaseInvoiceItem =
  mongoose.models.PurchaseInvoiceItem ||
  mongoose.model("PurchaseInvoiceItem", purchaseInvoiceItemSchema);

export default PurchaseInvoiceItem;

