import Invoice from "../models/Invoice.js";
import JobCard from "../models/JobCard.js";
import Attendance from "../models/Attendance.js";
import LeaveRequest from "../models/LeaveRequest.js";
import Payroll from "../models/Payroll.js";
import InventoryItem from "../models/InventoryItem.js";

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const startOfWeek = (date) => {
  const day = date.getDay() || 7;
  const diff = day === 1 ? 0 : day - 1;
  const start = new Date(date);
  start.setDate(date.getDate() - diff);
  return startOfDay(start);
};

export const getDashboardSummary = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const todayDate = now.toISOString().slice(0, 10);
    const month = now.toISOString().slice(0, 7);

    const [
      revenueTodayAgg,
      revenueWeekAgg,
      totalInvoices,
      activeJobCards,
      invoiceStatusAgg,
      jobStatusAgg,
      todayAttendanceAgg,
      pendingLeaveCount,
      payrollMonthStatus,
      inventoryRows,
    ] = await Promise.all([
        Invoice.aggregate([
          {
            $match: {
              paymentStatus: "PAID",
              createdAt: { $gte: todayStart },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$totalAmount" },
            },
          },
        ]),
        Invoice.aggregate([
          {
            $match: {
              paymentStatus: "PAID",
              createdAt: { $gte: weekStart },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$totalAmount" },
            },
          },
        ]),
        Invoice.countDocuments(),
        JobCard.countDocuments({ status: { $in: ["OPEN", "IN_PROGRESS"] } }),
        Invoice.aggregate([
          {
            $group: {
              _id: "$paymentStatus",
              count: { $sum: 1 },
            },
          },
        ]),
        JobCard.aggregate([
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ]),
        Attendance.aggregate([
          { $match: { date: todayDate } },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ]),
        LeaveRequest.countDocuments({ status: "PENDING" }),
        Payroll.aggregate([
          { $match: { month } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        InventoryItem.find().select("itemName quantity minStock unit sku").lean(),
      ]);

    const invoiceStatusCounts = invoiceStatusAgg.reduce(
      (acc, entry) => {
        const key = entry._id || "UNPAID";
        acc[key] = entry.count || 0;
        return acc;
      },
      { UNPAID: 0, PARTIAL: 0, PAID: 0 }
    );

    const jobCardStatusCounts = jobStatusAgg.reduce(
      (acc, entry) => {
        const key = entry._id || "OPEN";
        acc[key] = entry.count || 0;
        return acc;
      },
      { OPEN: 0, IN_PROGRESS: 0, COMPLETED: 0 }
    );

    const todayAttendance = todayAttendanceAgg.reduce(
      (acc, row) => {
        acc[row._id || "unknown"] = row.count || 0;
        return acc;
      },
      { present: 0, absent: 0, "half-day": 0, late: 0, "on-leave": 0 }
    );

    const payrollStatus = payrollMonthStatus.reduce((acc, row) => {
      acc[row._id || "draft"] = row.count || 0;
      return acc;
    }, {});

    const lowStockItems = (inventoryRows || [])
      .filter(
        (item) => Number(item?.quantity || 0) <= Number(item?.minStock || 0)
      )
      .sort((a, b) => Number(a.quantity || 0) - Number(b.quantity || 0))
      .slice(0, 5);

    return res.json({
      revenueToday: revenueTodayAgg[0]?.total || 0,
      revenueThisWeek: revenueWeekAgg[0]?.total || 0,
      totalInvoices,
      activeJobCards,
      invoiceStatusCounts,
      jobCardStatusCounts,
      todayAttendance,
      pendingLeaveRequests: pendingLeaveCount,
      payrollCurrentMonthStatus: payrollStatus,
      lowStockItems,
    });
  } catch (error) {
    return next(error);
  }
};
