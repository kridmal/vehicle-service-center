import mongoose from "mongoose";

const vehicleBrandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const VehicleBrand =
  mongoose.models.VehicleBrand ||
  mongoose.model("VehicleBrand", vehicleBrandSchema);

export default VehicleBrand;
