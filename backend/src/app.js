import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import dailyAttendanceRoutes from "./routes/dailyAttendanceRoutes.js";
import payrollRunRoutes from "./routes/payrollRunRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import inventoryCategoryRoutes from "./routes/inventoryCategoryRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import jobCardRoutes from "./routes/jobCardRoutes.js";
import laborHourDetailRoutes from "./routes/laborHourDetailRoutes.js";
import laborHourLogRoutes from "./routes/laborHourLogRoutes.js";
import leaveRoutes from "./routes/leaveRoutes.js";
import leaveRequestRoutes from "./routes/leaveRequestRoutes.js";
import leaveTypeRoutes from "./routes/leaveTypeRoutes.js";
import monthlySummaryRoutes from "./routes/monthlySummaryRoutes.js";
import workCalendarRoutes from "./routes/workCalendarRoutes.js";
import payslipRoutes from "./routes/payslipRoutes.js";
import reportsRoutes from "./routes/reportsRoutes.js";
import serviceTypeRoutes from "./routes/serviceTypeRoutes.js";
import staffRoutes from "./routes/staffRoutes.js";
import vehicleMasterRoutes from "./routes/vehicleMasterRoutes.js";
import vehicleRoutes from "./routes/vehicleRoutes.js";
import workerRoutes from "./routes/workerRoutes.js";
import { errorHandler, notFound } from "./middlewares/errorMiddleware.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Kaluarachchi SC API running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/daily-attendance", dailyAttendanceRoutes);
app.use("/api/payroll-runs", payrollRunRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/inventory-categories", inventoryCategoryRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/job-cards", jobCardRoutes);
app.use("/api/labor-hour-details", laborHourDetailRoutes);
app.use("/api/labor-hour-logs", laborHourLogRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/leave-requests", leaveRequestRoutes);
app.use("/api/leave-types", leaveTypeRoutes);
app.use("/api/monthly-summaries", monthlySummaryRoutes);
app.use("/api/work-calendars", workCalendarRoutes);
app.use("/api/payslips", payslipRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/services", serviceTypeRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/vehicle-master", vehicleMasterRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/workers", workerRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
