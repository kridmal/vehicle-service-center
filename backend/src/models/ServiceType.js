import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    isRequired: { type: Boolean, default: false },
    laborHoursDefault: { type: Number, min: 0, default: 0 },
    laborChargeDefault: { type: Number, min: 0, default: 0 },
    isBillable: { type: Boolean, default: true },
  }
);

const serviceTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    tasks: { type: [taskSchema], default: [] },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const ServiceType =
  mongoose.models.ServiceType ||
  mongoose.model("ServiceType", serviceTypeSchema);

export default ServiceType;
