import mongoose from "mongoose";

const dealerSchema = new mongoose.Schema(
  {
    dealerCode: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true, default: "" },
    phone1: { type: String, trim: true, default: "" },
    phone2: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

const Dealer = mongoose.models.Dealer || mongoose.model("Dealer", dealerSchema);

export default Dealer;

