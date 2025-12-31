import mongoose from "mongoose";

const connectDB = async () => {
  const { MONGO_URI } = process.env;
  if (!MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(MONGO_URI);
  console.log("MongoDB connected");
};

export default connectDB;
