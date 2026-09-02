import mongoose from "mongoose";

const shiftSchema = new mongoose.Schema(
  {
    shiftId: { type: String, trim: true, index: true, sparse: true },
    name: { type: String, required: true, trim: true, unique: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const Shift = mongoose.models.Shift || mongoose.model("Shift", shiftSchema);

export default Shift;
