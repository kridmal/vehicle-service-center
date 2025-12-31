import mongoose from "mongoose";

const inventoryItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, trim: true },
    itemName: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    brand: { type: String, trim: true },
    variant: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: {
      type: String,
      required: true,
      enum: ["Bottle", "Bottles", "Liter", "Liters", "Piece", "Pieces"],
    },
    minStock: { type: Number, default: 0, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 },
    sellingPrice: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: function validateSellingPrice(value) {
          return value >= this.costPrice;
        },
        message: "Selling price must be greater than or equal to cost price",
      },
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

const InventoryItem =
  mongoose.models.InventoryItem ||
  mongoose.model("InventoryItem", inventoryItemSchema);

export default InventoryItem;
