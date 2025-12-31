import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import InventoryItem from "../models/InventoryItem.js";
import JobCard from "../models/JobCard.js";
import ServiceType from "../models/ServiceType.js";
import Staff from "../models/Staff.js";
import Customer from "../models/Customer.js";
import Vehicle from "../models/Vehicle.js";

const COMPLETED_STATUSES = ["COMPLETED", "CLOSED"];
const TECHNICAL_ROLES = ["MECHANIC", "TECHNICIAN", "ELECTRICIAN", "HELPER"];

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const endOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const getDateRange = (req) => {
  const fromInput = parseDate(req.query.from);
  const toInput = parseDate(req.query.to);
  const from = fromInput ? startOfDay(fromInput) : null;
  const to = toInput ? endOfDay(toInput) : null;
  return { from, to };
};

const buildDateMatch = (field, from, to) => {
  if (!from && !to) return {};
  if (from && to) return { [field]: { $gte: from, $lte: to } };
  if (from) return { [field]: { $gte: from } };
  return { [field]: { $lte: to } };
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDateKey = (date) => date.toISOString().slice(0, 10);

export const getReportsSummary = async (req, res, next) => {
  try {
    const { from, to } = getDateRange(req);
    const invoiceDateMatch = buildDateMatch("createdAt", from, to);
    const jobCreatedMatch = buildDateMatch("createdAt", from, to);
    const jobCompletedMatch = buildDateMatch("updatedAt", from, to);

    const [
      invoiceTotals,
      invoiceStatusTotals,
      revenueTrend,
      jobStatusBreakdown,
      serviceVolume,
      avgCompletionResult,
      inventoryItems,
      inventoryUsage,
      completedJobs,
      staffList,
      serviceTypes,
      vehicleCounts,
      invoicesInRange,
    ] = await Promise.all([
      Invoice.aggregate([
        { $match: invoiceDateMatch },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalAmount" },
            invoiceCount: { $sum: 1 },
          },
        },
      ]),
      Invoice.aggregate([
        { $match: invoiceDateMatch },
        {
          $group: {
            _id: "$paymentStatus",
            count: { $sum: 1 },
            amount: { $sum: "$totalAmount" },
          },
        },
      ]),
      Invoice.aggregate([
        { $match: invoiceDateMatch },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            total: { $sum: "$totalAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      JobCard.aggregate([
        { $match: jobCreatedMatch },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      JobCard.aggregate([
        { $match: jobCreatedMatch },
        { $unwind: "$services" },
        {
          $group: {
            _id: "$services.serviceType",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      JobCard.aggregate([
        { $match: { status: { $in: COMPLETED_STATUSES } } },
        { $match: jobCompletedMatch },
        {
          $project: {
            durationMs: { $subtract: ["$updatedAt", "$createdAt"] },
          },
        },
        {
          $group: {
            _id: null,
            avgDurationMs: { $avg: "$durationMs" },
            count: { $sum: 1 },
          },
        },
      ]),
      InventoryItem.find().sort({ itemName: 1 }),
      JobCard.aggregate([
        { $match: jobCreatedMatch },
        { $unwind: "$partsUsed" },
        {
          $group: {
            _id: {
              inventoryId: "$partsUsed.inventoryId",
              sku: "$partsUsed.sku",
            },
            quantity: { $sum: "$partsUsed.quantity" },
          },
        },
        { $sort: { quantity: -1 } },
      ]),
      JobCard.find({
        status: { $in: COMPLETED_STATUSES },
        ...jobCompletedMatch,
      }),
      Staff.find(),
      ServiceType.find().select("name"),
      JobCard.aggregate([
        { $match: jobCreatedMatch },
        {
          $group: {
            _id: "$vehicleId",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      Invoice.find(invoiceDateMatch).select(
        "customer createdAt paymentStatus totalAmount"
      ),
    ]);

    const totalsRow = invoiceTotals[0] || {};
    const totalRevenue = toNumber(totalsRow.totalRevenue);
    const paymentBreakdown = invoiceStatusTotals.map((entry) => ({
      status: entry._id || "UNKNOWN",
      count: entry.count || 0,
      amount: toNumber(entry.amount),
    }));

    const pendingPayments = paymentBreakdown
      .filter((entry) => entry.status !== "PAID")
      .reduce((sum, entry) => sum + entry.amount, 0);

    const revenueTrendPoints = revenueTrend.map((entry) => ({
      date: entry._id,
      total: toNumber(entry.total),
    }));

    const jobsCompleted = completedJobs.length;

    const serviceNameMap = new Map(
      serviceTypes.map((service) => [String(service._id), service.name])
    );

    const serviceVolumeByType = serviceVolume.map((entry) => ({
      serviceType: entry._id,
      serviceName: serviceNameMap.get(String(entry._id)) || "Service",
      count: entry.count || 0,
    }));

    const avgCompletion = avgCompletionResult[0];
    const avgCompletionHours = avgCompletion?.avgDurationMs
      ? avgCompletion.avgDurationMs / 1000 / 60 / 60
      : 0;

    const inventoryList = inventoryItems.map((item) => ({
      id: item._id,
      sku: item.sku,
      itemName: item.itemName,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      minStock: item.minStock,
      costPrice: item.costPrice,
      sellingPrice: item.sellingPrice,
    }));

    const lowStockItems = inventoryList.filter(
      (item) => Number(item.quantity) <= Number(item.minStock || 0)
    );

    const inventoryById = new Map(
      inventoryItems.map((item) => [String(item._id), item])
    );
    const inventoryBySku = new Map(
      inventoryItems.map((item) => [String(item.sku), item])
    );
    const usageByItem = inventoryUsage.map((entry) => {
      const inventoryId = entry._id?.inventoryId
        ? String(entry._id.inventoryId)
        : "";
      const sku = entry._id?.sku || "";
      const item =
        (inventoryId ? inventoryById.get(inventoryId) : null) ||
        (sku ? inventoryBySku.get(String(sku)) : null);
      const costPrice = toNumber(item?.costPrice);
      const quantity = toNumber(entry.quantity);
      return {
        inventoryId,
        sku,
        itemName: item?.itemName || item?.name || "Item",
        quantity,
        costPrice,
        usageCost: quantity * costPrice,
      };
    });
    const inventoryUsageCost = usageByItem.reduce(
      (sum, item) => sum + item.usageCost,
      0
    );

    const technicianList = staffList.filter((member) => {
      if (member.roleType === "TECHNICAL") return true;
      const roleName = member.roleName || member.role || "";
      return TECHNICAL_ROLES.includes(String(roleName).trim().toUpperCase());
    });

    const technicianMap = new Map();
    technicianList.forEach((member) => {
      technicianMap.set(String(member._id), {
        staffId: member._id,
        name: member.fullName,
        roleName: member.roleName || member.role || "",
        salaryType: member.salaryType || "FIXED",
        basicSalary: toNumber(member.basicSalary),
        commissionPercentage: toNumber(member.commissionPercentage),
        perDayRate: toNumber(member.perDayRate),
        jobCount: 0,
        laborShare: 0,
      });
    });

    completedJobs.forEach((job) => {
      const assignments = Array.isArray(job.assignedWorkers)
        ? job.assignedWorkers
        : [];
      if (assignments.length === 0) return;
      const laborCharges = toNumber(job.laborCharges);
      const laborShare = laborCharges / assignments.length;

      assignments.forEach((assignment) => {
        const staffId = assignment.staffId || assignment.workerId;
        const key = staffId ? String(staffId) : "";
        let entry = key ? technicianMap.get(key) : null;
        if (!entry) {
          const name = assignment.name || "Technician";
          entry = {
            staffId: key || name,
            name,
            roleName: assignment.roleName || assignment.role || "",
            salaryType: "FIXED",
            basicSalary: 0,
            commissionPercentage: 0,
            perDayRate: 0,
            jobCount: 0,
            laborShare: 0,
          };
          technicianMap.set(key || name, entry);
        }
        entry.jobCount += 1;
        entry.laborShare += laborShare;
      });
    });

    const technicianMetrics = Array.from(technicianMap.values()).map(
      (entry) => {
        const commissionAmount =
          (entry.commissionPercentage / 100) * entry.laborShare;
        let basePay = 0;
        switch (entry.salaryType) {
          case "PER_DAY":
            basePay = entry.perDayRate;
            break;
          case "COMMISSION":
            basePay = commissionAmount;
            break;
          case "HYBRID":
            basePay = entry.basicSalary + commissionAmount;
            break;
          default:
            basePay = entry.basicSalary;
            break;
        }
        return {
          ...entry,
          commissionAmount,
          basePay,
        };
      }
    );

    const payrollTotal = technicianMetrics.reduce(
      (sum, entry) => sum + entry.basePay,
      0
    );

    const revenueByService = serviceVolumeByType.map((entry) => ({
      ...entry,
      laborRevenue: 0,
    }));
    const revenueByServiceMap = new Map(
      revenueByService.map((entry) => [String(entry.serviceType), entry])
    );
    const jobCardsForRevenue = completedJobs.filter(
      (job) =>
        Array.isArray(job.services) && job.services.length > 0
    );
    jobCardsForRevenue.forEach((job) => {
      const laborCharges = toNumber(job.laborCharges);
      const serviceCount = job.services.length;
      if (serviceCount === 0) return;
      const perService = laborCharges / serviceCount;
      job.services.forEach((service) => {
        const key = String(service.serviceType);
        const entry = revenueByServiceMap.get(key);
        if (entry) {
          entry.laborRevenue += perService;
        } else {
          revenueByServiceMap.set(key, {
            serviceType: key,
            serviceName: serviceNameMap.get(key) || "Service",
            count: 1,
            laborRevenue: perService,
          });
        }
      });
    });

    const customersWithInvoices = invoicesInRange
      .map((invoice) => invoice.customer)
      .filter(Boolean)
      .map((id) => String(id));
    const uniqueCustomerIds = Array.from(new Set(customersWithInvoices));
    const customerRecords = uniqueCustomerIds.length
      ? await Customer.find({ _id: { $in: uniqueCustomerIds } })
      : [];
    const newCustomers = customerRecords.filter((customer) => {
      if (!from) return true;
      return customer.createdAt >= from;
    });
    const returningCustomers = customerRecords.filter((customer) => {
      if (!from) return false;
      return customer.createdAt < from;
    });

    const vehicleIds = vehicleCounts.map((entry) => entry._id).filter(Boolean);
    const validVehicleIds = vehicleIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    const vehicleRecords = validVehicleIds.length
      ? await Vehicle.find({ _id: { $in: validVehicleIds } })
      : [];
    const vehicleMap = new Map(
      vehicleRecords.map((vehicle) => [String(vehicle._id), vehicle])
    );
    const topVehicles = vehicleCounts.map((entry) => {
      const vehicle = vehicleMap.get(String(entry._id));
      return {
        vehicleId: entry._id,
        vehicleNumber: vehicle?.vehicleNumber || String(entry._id),
        model: vehicle?.modelName || vehicle?.model || "",
        brand: vehicle?.brandName || vehicle?.brand || "",
        count: entry.count || 0,
      };
    });

    const expenseTrendMap = new Map();
    completedJobs.forEach((job) => {
      if (!job.createdAt) return;
      const dateKey = formatDateKey(job.createdAt);
      const parts = Array.isArray(job.partsUsed) ? job.partsUsed : [];
      const dailyCost = parts.reduce((sum, part) => {
        const item = part.inventoryId
          ? inventoryById.get(String(part.inventoryId))
          : part.sku
          ? inventoryBySku.get(String(part.sku))
          : null;
        return sum + toNumber(part.quantity) * toNumber(item?.costPrice);
      }, 0);
      expenseTrendMap.set(
        dateKey,
        (expenseTrendMap.get(dateKey) || 0) + dailyCost
      );
    });

    const profitTrendMap = new Map();
    revenueTrendPoints.forEach((point) => {
      profitTrendMap.set(point.date, {
        date: point.date,
        revenue: point.total,
        expense: expenseTrendMap.get(point.date) || 0,
      });
    });
    expenseTrendMap.forEach((expense, date) => {
      if (!profitTrendMap.has(date)) {
        profitTrendMap.set(date, {
          date,
          revenue: 0,
          expense,
        });
      }
    });

    const profitTrend = Array.from(profitTrendMap.values())
      .map((entry) => ({
        ...entry,
        profit: entry.revenue - entry.expense,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.json({
      range: {
        from: from ? from.toISOString() : null,
        to: to ? to.toISOString() : null,
      },
      overview: {
        totalRevenue,
        jobsCompleted,
        pendingPayments,
        revenueTrend: revenueTrendPoints,
        paymentBreakdown,
      },
      sales: {
        totalRevenue,
        revenueByService: Array.from(revenueByServiceMap.values()),
        invoicePaymentStatus: paymentBreakdown,
      },
      jobs: {
        statusDistribution: jobStatusBreakdown.map((entry) => ({
          status: entry._id || "UNKNOWN",
          count: entry.count || 0,
        })),
        serviceVolume: serviceVolumeByType,
        avgCompletionHours,
        completedCount: avgCompletion?.count || 0,
      },
      inventory: {
        stockLevels: inventoryList,
        lowStock: lowStockItems,
        usage: usageByItem,
        usageCost: inventoryUsageCost,
      },
      staff: {
        technicians: technicianMetrics,
        payrollTotal,
      },
      customers: {
        newCustomers: newCustomers.length,
        returningCustomers: returningCustomers.length,
        topVehicles,
      },
      financial: {
        revenue: totalRevenue,
        expense: inventoryUsageCost,
        profit: totalRevenue - inventoryUsageCost,
        trend: profitTrend,
      },
    });
  } catch (error) {
    return next(error);
  }
};
