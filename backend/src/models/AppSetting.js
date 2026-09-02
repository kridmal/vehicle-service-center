import mongoose from "mongoose";

const appSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const AppSetting =
  mongoose.models.AppSetting || mongoose.model("AppSetting", appSettingSchema);

export default AppSetting;
