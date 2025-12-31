import mongoose from "mongoose";

const vehicleModelSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VehicleBrand",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

vehicleModelSchema.index({ brandId: 1, name: 1 }, { unique: true });

const VehicleModel =
  mongoose.models.VehicleModel ||
  mongoose.model("VehicleModel", vehicleModelSchema);

export default VehicleModel;
