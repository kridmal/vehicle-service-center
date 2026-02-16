import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import InventoryItem from "../models/InventoryItem.js";
import Invoice from "../models/Invoice.js";
import JobCard from "../models/JobCard.js";
import Vehicle from "../models/Vehicle.js";
import { updateLoyaltyStats } from "./loyaltyController.js";
import { computeItemDiscount, roundMoney } from "../utils/itemDiscount.js";
import {
  deriveLoyaltyPricing,
  normalizeSelectedReward,
} from "../utils/loyaltyDiscount.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) => roundMoney(value);

const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const toOptionalNumber = (value) => (hasValue(value) ? toNumber(value) : null);

const normalizeDiscountMode = (value) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (["PERCENT", "AMOUNT", "FULL"].includes(normalized)) {
    return normalized;
  }
  return null;
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

      if (!item) {
        return {
          error: "Inventory item not found",
        };
      }
      const unitPriceOriginal = hasValue(part.unitPriceOriginal)
        ? toNumber(part.unitPriceOriginal)
        : toNumber(item.sellingPrice);
      const lineTotalOriginal = hasValue(part.lineTotalOriginal)
        ? toNumber(part.lineTotalOriginal)
        : roundCurrency(unitPriceOriginal * qty);

      const hasSnapshot =
        hasValue(part.discountPerUnit) ||
        hasValue(part.unitPriceNet) ||
        hasValue(part.lineDiscountTotal) ||
        hasValue(part.lineTotal);

      const computedDiscount = computeItemDiscount({
        unitPriceOriginal,
        qty,
        discountEnabled: item.discountEnabled,
        discountType: item.discountType,
        discountValue: item.discountValue,
        startAt: item.discountStartAt,
        endAt: item.discountEndAt,
        minQty: item.minQtyForDiscount,
        cap: item.maxDiscountCap,
      });

      const discountPerUnit = roundCurrency(
        hasSnapshot ? toNumber(part.discountPerUnit) : computedDiscount.discountPerUnit
      );
      const unitPriceNet = roundCurrency(
        hasSnapshot ? toNumber(part.unitPriceNet) : computedDiscount.unitPriceNet
      );
      const lineDiscountTotal = roundCurrency(
        hasSnapshot ? toNumber(part.lineDiscountTotal) : computedDiscount.lineDiscountTotal
      );
      const lineTotalNet = roundCurrency(
        hasSnapshot
          ? toNumber(part.lineTotal)
          : Math.max(0, lineTotalOriginal - lineDiscountTotal)
      );

      return {
        sku: item?.sku || part.sku || "",
        itemName: item?.itemName || item?.name || "",
        brand: item?.brand || "",
        variant: item?.variant || "",
        unit: item?.unit || "",
        unitPriceOriginal: roundCurrency(unitPriceOriginal),
        discountPerUnit,
        unitPriceNet,
        unitPrice: unitPriceNet,
        quantity: qty,
        lineTotalOriginal: roundCurrency(lineTotalOriginal),
        lineDiscountTotal,
        lineTotal: lineTotalNet,
      };
    })
    .filter(Boolean);
};

const mapAppliedRewardsForInvoice = (appliedRewards, laborDiscount) => {
  const selectedReward = normalizeSelectedReward(appliedRewards);
  if (!selectedReward || !selectedReward.ruleId) {
    return [];
  }

  return [
    {
      rewardId: selectedReward.rewardId || null,
      ruleId: selectedReward.ruleId,
      ruleName: selectedReward.ruleName || "Loyalty Reward",
      rewardType: selectedReward.rewardType,
      rewardValue: toNumber(selectedReward.rewardValue),
      rewardDiscountMode: normalizeDiscountMode(selectedReward.rewardDiscountMode),
      rewardDiscountValue: toOptionalNumber(selectedReward.rewardDiscountValue),
      rewardDiscountCap: toOptionalNumber(selectedReward.rewardDiscountCap),
      milestoneNumber: selectedReward.milestoneNumber,
      discountAmount:
        selectedReward.rewardType === "free_labor" ? toNumber(laborDiscount) : 0,
    },
  ];
};

const buildInvoicePricingSnapshot = ({ jobCard, partsUsed }) => {
  const partsSubtotalOriginal = partsUsed.reduce(
    (sum, item) => sum + toNumber(item.lineTotalOriginal),
    0
  );
  const partsDiscountTotal = partsUsed.reduce(
    (sum, item) => sum + toNumber(item.lineDiscountTotal),
    0
  );
  const partsSubtotal = partsUsed.reduce(
    (sum, item) => sum + toNumber(item.lineTotal),
    0
  );
  const laborChargesOriginal = toNumber(
    jobCard.laborChargesOriginal ?? jobCard.laborCharges
  );

  const pricing = deriveLoyaltyPricing({
    partsSubtotal,
    laborChargesOriginal,
    appliedRewards: jobCard.appliedRewards || [],
  });

  const appliedRewards = mapAppliedRewardsForInvoice(
    jobCard.appliedRewards || [],
    pricing.loyaltyLaborDiscount
  );

  return {
    partsSubtotalOriginal: roundCurrency(partsSubtotalOriginal),
    partsDiscountTotal: roundCurrency(partsDiscountTotal),
    partsSubtotal: pricing.subtotalParts,
    laborChargesOriginal: pricing.laborChargesOriginal,
    loyaltyLaborDiscount: pricing.loyaltyLaborDiscount,
    laborChargesNet: pricing.laborChargesNet,
    subtotal: pricing.subtotal,
    totalAmount: pricing.grandTotal,
    appliedRewards,
  };
};

const makeHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isTransactionUnsupportedError = (error) =>
  /transaction|replica set|mongos/i.test(String(error?.message || ""));

const finalizeInvoiceWithoutTransaction = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    throw makeHttpError(404, "Invoice not found");
  }
  if (invoice.status === "FINALIZED") {
    throw makeHttpError(400, "Invoice is already finalized");
  }

  invoice.status = "FINALIZED";
  await invoice.save();

  if (invoice.customer) {
    await updateLoyaltyStats(invoice.customer, invoice.totalAmount || 0, invoice.jobCard, {
      invoiceId: invoice._id,
    });
  }

  return invoice;
};

const finalizeInvoiceWithLoyalty = async (invoiceId) => {
  const session = await mongoose.startSession();
  try {
    let finalizedInvoice = null;
    await session.withTransaction(async () => {
      const invoice = await Invoice.findById(invoiceId).session(session);
      if (!invoice) {
        throw makeHttpError(404, "Invoice not found");
      }
      if (invoice.status === "FINALIZED") {
        throw makeHttpError(400, "Invoice is already finalized");
      }

      invoice.status = "FINALIZED";
      await invoice.save({ session });

      if (invoice.customer) {
        await updateLoyaltyStats(
          invoice.customer,
          invoice.totalAmount || 0,
          invoice.jobCard,
          {
            session,
            invoiceId: invoice._id,
          }
        );
      }

      finalizedInvoice = invoice;
    });

    return finalizedInvoice;
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      return finalizeInvoiceWithoutTransaction(invoiceId);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

export const listInvoices = async (req, res, next) => {
  try {
    const query = {};

    if (req.query?.jobCardId && isValidId(req.query.jobCardId)) {
      query.jobCard = req.query.jobCardId;
    }

    if (req.query?.type && ["SALE", "JOB_CARD"].includes(req.query.type)) {
      query.invoiceType = req.query.type;
    }

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

    const inventoryIds = (jobCard.partsUsed || [])
      .map((part) => part.inventoryId)
      .filter(Boolean);
    const skuList = (jobCard.partsUsed || [])
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
    const missingPart = partsUsed.find((entry) => entry?.error);
    if (missingPart) {
      return res.status(400).json({ message: missingPart.error });
    }

    const pricing = buildInvoicePricingSnapshot({
      jobCard,
      partsUsed,
    });

    const ownerCandidate = jobCard.ownerId || jobCard.customerId;
    const customerId = isValidId(ownerCandidate) ? ownerCandidate : null;
    const vehicleId = isValidId(jobCard.vehicleId) ? jobCard.vehicleId : null;

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
      customerPhone: customer?.phone || "",
      vehicleNumber: vehicle?.vehicleNumber || "",
      vehicleBrand: vehicle?.brandName || "",
      vehicleModel: vehicle?.modelName || "",
      items: partsUsed,
      partsUsed,
      subtotalPartsOriginal: pricing.partsSubtotalOriginal,
      partsDiscountTotal: pricing.partsDiscountTotal,
      subtotalParts: pricing.partsSubtotal,
      laborCharges: pricing.laborChargesOriginal,
      laborChargesOriginal: pricing.laborChargesOriginal,
      loyaltyLaborDiscount: pricing.loyaltyLaborDiscount,
      laborChargesNet: pricing.laborChargesNet,
      subtotal: pricing.subtotal,
      discount: pricing.loyaltyLaborDiscount,
      totalAmount: pricing.totalAmount,
      appliedRewards: pricing.appliedRewards,
      paidAmount: 0,
      balanceAmount: pricing.totalAmount,
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

    let invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (invoice.paymentStatus === "PAID") {
      if (req.body.status || req.body.paymentStatus) {
        return res.status(400).json({ message: "Paid invoices are read-only" });
      }
    }

    if (req.body.status) {
      if (req.body.status !== "FINALIZED") {
        return res.status(400).json({ message: "Invalid invoice status" });
      }
      if (invoice.status === "FINALIZED") {
        return res.status(400).json({ message: "Invoice is already finalized" });
      }

      try {
        invoice = await finalizeInvoiceWithLoyalty(id);
      } catch (error) {
        if (error.status) {
          return res.status(error.status).json({ message: error.message });
        }
        throw error;
      }
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
      invoice = await invoice.save();
    }

    return res.json(invoice);
  } catch (error) {
    return next(error);
  }
};
