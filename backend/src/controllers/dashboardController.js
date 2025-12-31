import Invoice from "../models/Invoice.js";
import JobCard from "../models/JobCard.js";

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

    const [
      revenueTodayAgg,
      revenueWeekAgg,
      totalInvoices,
      activeJobCards,
      invoiceStatusAgg,
      jobStatusAgg,
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

    return res.json({
      revenueToday: revenueTodayAgg[0]?.total || 0,
      revenueThisWeek: revenueWeekAgg[0]?.total || 0,
      totalInvoices,
      activeJobCards,
      invoiceStatusCounts,
      jobCardStatusCounts,
    });
  } catch (error) {
    return next(error);
  }
};
