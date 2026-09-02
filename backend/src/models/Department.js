import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    departmentId: { type: String, trim: true, index: true, sparse: true },
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
  },
  { timestamps: true }
);

const Department =
  mongoose.models.Department || mongoose.model("Department", departmentSchema);

export default Department;
