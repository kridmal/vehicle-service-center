import mongoose from "mongoose";

const inventoryCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const InventoryCategory =
  mongoose.models.InventoryCategory ||
  mongoose.model("InventoryCategory", inventoryCategorySchema);

export default InventoryCategory;
