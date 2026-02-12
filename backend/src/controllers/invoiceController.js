import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import InventoryItem from "../models/InventoryItem.js";
import Invoice from "../models/Invoice.js";
import JobCard from "../models/JobCard.js";
import Vehicle from "../models/Vehicle.js";
import { updateLoyaltyStats } from "./loyaltyController.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildInvoiceNumber = async () => {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  const candidate = `INV-${stamp}-${random}`;
  const exists = await Invoice.findOne({ invoiceNumber: candidate });
  if (exists) {
    return buildInvoiceNumber();
  }
  return candidate;
};

/**
 * Recalculate the loyalty discount from appliedRewards using actual invoice values.
 * This is needed because the frontend calculates the discount at job card creation time
 * when laborCharges may not yet be known (e.g. free_labor rewards show 0 discount).
 */
const calculateLoyaltyDiscount = (laborCharges, partsTotal, appliedRewards) => {
  if (!appliedRewards || appliedRewards.length === 0) {
    return { totalDiscount: 0, rewards: [] };
  }

  let totalDiscount = 0;
  const rewards = appliedRewards.map((reward) => {
    let discountAmount = 0;

    switch (reward.rewardType) {
      case "free_labor":
        discountAmount = laborCharges;
        break;
      case "discount_percentage": {
        const subtotal = partsTotal + laborCharges;
        discountAmount = subtotal * ((reward.rewardValue || 0) / 100);
        if (reward.maxDiscountAmount) {
          discountAmount = Math.min(discountAmount, reward.maxDiscountAmount);
        }
        break;
      }
      case "discount_amount":
        discountAmount = reward.rewardValue || 0;
        break;
      case "free_service":
        discountAmount = toNumber(reward.discountAmount);
        break;
      default:
        break;
    }

    totalDiscount += discountAmount;
    return {
      ruleId: reward.ruleId,
      ruleName: reward.ruleName,
      rewardType: reward.rewardType,
      rewardValue: reward.rewardValue,
      discountAmount,
    };
  });

  return { totalDiscount, rewards };
};

const buildPartsUsed = (partsUsed, inventoryItems) => {
  const itemBySku = new Map(inventoryItems.map((item) => [item.sku, item]));
  const itemById = new Map(
    inventoryItems.map((item) => [String(item._id), item])
  );

  return partsUsed
    .map((part) => {
      const qty = toNumber(part.quantity);
      if (qty <= 0) return null;
      const item =
        (part.sku ? itemBySku.get(part.sku) : null) ||
        (part.inventoryId ? itemById.get(String(part.inventoryId)) : null);
      const unitPrice = toNumber(item?.sellingPrice);
      const lineTotal = unitPrice * qty;
      return {
        sku: item?.sku || part.sku || "",
        itemName: item?.itemName || item?.name || "",
        brand: item?.brand || "",
        variant: item?.variant || "",
        unit: item?.unit || "",
        unitPrice,
        quantity: qty,
        lineTotal,
      };
    })
    .filter(Boolean);
};

export const listInvoices = async (req, res, next) => {
  try {
    const query = {};

    // Filter by job card
    if (req.query?.jobCardId && isValidId(req.query.jobCardId)) {
      query.jobCard = req.query.jobCardId;
    }

    // Filter by invoice type
    if (req.query?.type && ["SALE", "JOB_CARD"].includes(req.query.type)) {
      query.invoiceType = req.query.type;
    }

    // Filter by payment status
    if (req.query?.status && ["PAID", "UNPAID", "PARTIAL"].includes(req.query.status)) {
      query.paymentStatus = req.query.status;
    }

    const invoices = await Invoice.find(query)
      .populate("customer", "name phone email")
      .populate("vehicle", "vehicleNumber brandName modelName")
      .populate("jobCard", "jobCardNumber")
      .populate("sale")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    return res.json(invoices);
  } catch (error) {
    return next(error);
  }
};

export const getInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid invoice id" });
    }
    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    return res.json(invoice);
  } catch (error) {
    return next(error);
  }
};

export const createInvoiceFromJobCard = async (req, res, next) => {
  try {
    const { jobCardId } = req.params;
    if (!isValidId(jobCardId)) {
      return res.status(400).json({ message: "Invalid job card id" });
    }

    const jobCard = await JobCard.findById(jobCardId);
    if (!jobCard) {
      return res.status(404).json({ message: "Job card not found" });
    }
    if (jobCard.status !== "COMPLETED") {
      return res.status(400).json({
        message: "Invoice can only be generated for completed job cards",
      });
    }

    const existing = await Invoice.findOne({ jobCard: jobCard._id });
    if (existing) {
      return res.status(409).json({ message: "Invoice already exists" });
    }

    const inventoryIds = jobCard.partsUsed
      .map((part) => part.inventoryId)
      .filter(Boolean);
    const skuList = jobCard.partsUsed
      .map((part) => part.sku)
      .filter(Boolean);
    const inventoryQuery = [
      inventoryIds.length ? { _id: { $in: inventoryIds } } : null,
      skuList.length ? { sku: { $in: skuList } } : null,
    ].filter(Boolean);
    const inventoryItems =
      inventoryQuery.length === 0
        ? []
        : await InventoryItem.find({ $or: inventoryQuery });

    const partsUsed = buildPartsUsed(jobCard.partsUsed || [], inventoryItems);
    const partsTotal = partsUsed.reduce(
      (sum, item) => sum + toNumber(item.lineTotal),
      0
    );
    const laborCharges = toNumber(jobCard.laborCharges);

    // Recalculate loyalty discount from appliedRewards using actual labor/parts values.
    // The frontend-stored loyaltyDiscount may be 0 for free_labor rewards because
    // laborCharges aren't known at job card creation time.
    const { totalDiscount: loyaltyDiscount, rewards: resolvedRewards } =
      calculateLoyaltyDiscount(
        laborCharges,
        partsTotal,
        jobCard.appliedRewards || []
      );
    const totalAmount = Math.max(partsTotal + laborCharges - loyaltyDiscount, 0);

    const ownerCandidate = jobCard.ownerId || jobCard.customerId;
    const customerId = isValidId(ownerCandidate) ? ownerCandidate : null;
    const vehicleId = isValidId(jobCard.vehicleId)
      ? jobCard.vehicleId
      : null;

    const [customer, vehicle] = await Promise.all([
      customerId ? Customer.findById(customerId) : null,
      vehicleId ? Vehicle.findById(vehicleId) : null,
    ]);

    const invoiceNumber = await buildInvoiceNumber();
    const invoice = await Invoice.create({
      invoiceNumber,
      invoiceType: "JOB_CARD",
      sale: null,
      jobCard: jobCard._id,
      jobCardNo: jobCard.jobCardNo,
      customer: customer?._id,
      vehicle: vehicle?._id,
      customerName: customer?.name || "",
      vehicleNumber: vehicle?.vehicleNumber || "",
      items: partsUsed,
      partsUsed,
      laborCharges,
      subtotal: partsTotal + laborCharges,
      discount: loyaltyDiscount,
      totalAmount,
      appliedRewards: resolvedRewards,
      paidAmount: 0,
      balanceAmount: totalAmount,
      paymentMethod: null,
      paymentStatus: "UNPAID",
      status: "DRAFT",
      createdBy: req.user?.id,
    });

    return res.status(201).json(invoice);
  } catch (error) {
    return next(error);
  }
};

export const updateInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid invoice id" });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (invoice.paymentStatus === "PAID") {
      if (req.body.status || req.body.paymentStatus) {
        return res.status(400).json({ message: "Paid invoices are read-only" });
      }
    }

    let wasJustFinalized = false;
    if (req.body.status) {
      if (invoice.status === "FINALIZED") {
        return res.status(400).json({ message: "Invoice is already finalized" });
      }
      if (req.body.status !== "FINALIZED") {
        return res.status(400).json({ message: "Invalid invoice status" });
      }
      invoice.status = "FINALIZED";
      wasJustFinalized = true;
    }

    if (req.body.paymentStatus) {
      if (invoice.status !== "FINALIZED") {
        return res.status(400).json({
          message: "Payment status can be updated only after finalization",
        });
      }
      const nextStatus = req.body.paymentStatus;
      if (!["UNPAID", "PARTIAL", "PAID"].includes(nextStatus)) {
        return res.status(400).json({ message: "Invalid payment status" });
      }
      invoice.paymentStatus = nextStatus;
    }

    const saved = await invoice.save();

    // Update customer loyalty stats when invoice is finalized
    if (wasJustFinalized && invoice.customer) {
      try {
        await updateLoyaltyStats(
          invoice.customer,
          invoice.totalAmount || 0,
          invoice.jobCard
        );
      } catch (loyaltyError) {
        console.error("Error updating loyalty stats:", loyaltyError);
        // Don't fail the invoice update if loyalty update fails
      }
    }

    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};
