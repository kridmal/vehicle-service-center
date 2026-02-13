import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Invoice from "../models/Invoice.js";
import CustomerLoyalty from "../models/CustomerLoyalty.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

export const listCustomers = async (req, res, next) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });

    const invoiceStats = await Invoice.aggregate([
      { $match: { customer: { $ne: null }, status: "FINALIZED" } },
      {
        $group: {
          _id: "$customer",
          completedVisits: { $sum: 1 },
          lifetimeValue: { $sum: "$totalAmount" },
        },
      },
    ]);
    const statsMap = new Map(
      invoiceStats.map((row) => [String(row._id), row])
    );

    const loyaltyRecords = await CustomerLoyalty.find(
      {},
      "customerId visitCount totalSpent availableRewards"
    );
    const loyaltyMap = new Map();
    for (const record of loyaltyRecords) {
      const key = String(record.customerId);
      const existing = loyaltyMap.get(key) || {
        visitCount: 0,
        totalSpent: 0,
        availableRewardsCount: 0,
      };
      existing.visitCount += record.visitCount || 0;
      existing.totalSpent += record.totalSpent || 0;
      existing.availableRewardsCount += (record.availableRewards || []).length;
      loyaltyMap.set(key, existing);
    }

    const enriched = customers.map((customer) => {
      const id = String(customer._id);
      const stats = statsMap.get(id) || {};
      const loyalty = loyaltyMap.get(id) || {};
      return {
        ...customer.toObject(),
        completedVisits: stats.completedVisits || 0,
        lifetimeValue: stats.lifetimeValue || 0,
        loyaltyVisits: loyalty.visitCount || 0,
        loyaltySpent: loyalty.totalSpent || 0,
        availableRewardsCount: loyalty.availableRewardsCount || 0,
      };
    });

    return res.json(enriched);
  } catch (error) {
    return next(error);
  }
};

export const createCustomer = async (req, res, next) => {
  try {
    const { name, phone, email, notes } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone are required" });
    }

    const customer = await Customer.create({
      name,
      phone,
      email,
      notes,
    });
    return res.status(201).json(customer);
  } catch (error) {
    return next(error);
  }
};

export const updateCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    const customer = await Customer.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.json(customer);
  } catch (error) {
    return next(error);
  }
};

export const deleteCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    const customer = await Customer.findByIdAndDelete(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.json({ message: "Customer deleted" });
  } catch (error) {
    return next(error);
  }
};
