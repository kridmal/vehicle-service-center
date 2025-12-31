import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    currentOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    vehicleNumber: { type: String, required: true, trim: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleBrand" },
    brandName: { type: String, trim: true },
    modelId: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleModel" },
    modelName: { type: String, trim: true },
  },
  { timestamps: true }
);

const Vehicle = mongoose.models.Vehicle || mongoose.model("Vehicle", vehicleSchema);

export default Vehicle;
