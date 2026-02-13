import mongoose from "mongoose";

const permissionsSchema = new mongoose.Schema(
  {
    markAttendance: { type: Boolean, default: false },
    approveLeave: { type: Boolean, default: false },
    runPayroll: { type: Boolean, default: false },
    viewReports: { type: Boolean, default: false },
    manageEmployees: { type: Boolean, default: false },
    manageRoles: { type: Boolean, default: false },
    manageInventory: { type: Boolean, default: false },
    manageJobCards: { type: Boolean, default: false },
    manageCustomers: { type: Boolean, default: false },
    manageInvoices: { type: Boolean, default: false },
    manageVehicles: { type: Boolean, default: false },
    manageServices: { type: Boolean, default: false },
    viewDashboard: { type: Boolean, default: false },
    manageSalaryConfig: { type: Boolean, default: false },
    approvePayroll: { type: Boolean, default: false },
  },
  { _id: false }
);

const roleSchema = new mongoose.Schema(
  {
    roleId: { type: String, trim: true, index: true, sparse: true },
    roleName: { type: String, required: true, trim: true, unique: true },
    category: { type: String, enum: ["office", "technical"], required: true },
    permissions: { type: permissionsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

const Role = mongoose.models.Role || mongoose.model("Role", roleSchema);

export default Role;
