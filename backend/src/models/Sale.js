import mongoose from "mongoose";

const saleItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
    },
    productName: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceOriginal: { type: Number, required: true, min: 0 },
    discountPerUnit: { type: Number, required: true, min: 0, default: 0 },
    unitPriceNet: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotalOriginal: { type: Number, required: true, min: 0 },
    lineDiscountTotal: { type: Number, required: true, min: 0, default: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    saleNumber: { type: String, required: true, unique: true, trim: true },
    items: { type: [saleItemSchema], default: [] },
    itemsSubtotalOriginal: { type: Number, required: true, min: 0, default: 0 },
    itemDiscountTotal: { type: Number, required: true, min: 0, default: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    discountType: { type: String, enum: ["AMOUNT", "PERCENT"], default: "AMOUNT" },
    discountValue: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },
    taxEnabled: { type: Boolean, default: false },
    grandTotal: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ["CASH", "CARD", "BANK_TRANSFER"],
      required: true,
    },
    status: { type: String, enum: ["PAID", "UNPAID"], required: true },
    soldBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    saleDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Sale = mongoose.models.Sale || mongoose.model("Sale", saleSchema);

export default Sale;
