import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
  },
  { timestamps: true }
);

const Customer =
  mongoose.models.Customer || mongoose.model("Customer", customerSchema);

export default Customer;
