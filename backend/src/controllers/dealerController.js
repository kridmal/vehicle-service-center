import mongoose from "mongoose";
import Counter from "../models/Counter.js";
import Dealer from "../models/Dealer.js";
import DealerPayment from "../models/DealerPayment.js";
import PurchaseInvoice from "../models/PurchaseInvoice.js";
import SupplierPayment from "../models/SupplierPayment.js";
import { allocatePayment } from "../utils/allocatePayment.js";
import { roundCurrency, toNumber } from "../utils/purchaseTotals.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizeDealerCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const nextDealerCode = async () => {
  const counter = await Counter.findByIdAndUpdate(
    "dealerCode",
    { $inc: { seq: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
  return `DLR-${String(counter.seq).padStart(4, "0")}`;
};

export const createDealer = async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "Dealer name is required" });
    }

    const explicitCode = normalizeDealerCode(req.body?.dealerCode);
    const dealerCode = explicitCode || (await nextDealerCode());
    const existingCode = await Dealer.findOne({ dealerCode });
    if (existingCode) {
      return res.status(409).json({ message: "Dealer code already exists" });
    }

    const dealer = await Dealer.create({
      dealerCode,
      name,
      address: String(req.body?.address || "").trim(),
      phone1: String(req.body?.phone1 || "").trim(),
      phone2: String(req.body?.phone2 || "").trim(),
      email: String(req.body?.email || "").trim(),
      notes: String(req.body?.notes || "").trim(),
    });

    return res.status(201).json(dealer);
  } catch (error) {
    return next(error);
  }
};

export const listDealers = async (req, res, next) => {
  try {
    const search = String(
      req.query?.q || req.query?.search || req.query?.dealerCode || req.query?.name || ""
    ).trim();
    const query = {};
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { dealerCode: { $regex: safeSearch, $options: "i" } },
        { name: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const dealers = await Dealer.find(query).sort({ name: 1, dealerCode: 1 }).limit(200);
    return res.json(dealers);
  } catch (error) {
    return next(error);
  }
};

export const getDealerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid dealer id" });
    }
    const dealer = await Dealer.findById(id);
    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found" });
    }
    return res.json(dealer);
  } catch (error) {
    return next(error);
  }
};

export const getDealerPendingSummary = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid dealer id" });
    }
    const dealer = await Dealer.findById(id);
    if (!dealer) return res.status(404).json({ message: "Dealer not found" });

    const pendingInvoices = await PurchaseInvoice.find({
      dealerId: dealer._id,
      status: { $in: ["UNPAID", "PARTIALLY_PAID"] },
    }).select("totalAmount paidAmount balanceAmount status purchaseDate");

    const pendingCount = pendingInvoices.length;
    const totalPendingBalance = roundCurrency(
      pendingInvoices.reduce((sum, inv) => sum + toNumber(inv.balanceAmount), 0)
    );

    return res.json({ dealer: { _id: dealer._id, name: dealer.name }, pendingCount, totalPendingBalance });
  } catch (error) {
    return next(error);
  }
};

const isTransactionUnsupportedError = (error) =>
  /transaction|replica set|mongos/i.test(String(error?.message || ""));

export const payDealerBalance = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid dealer id" });
    }
    const dealer = await Dealer.findById(id);
    if (!dealer) return res.status(404).json({ message: "Dealer not found" });

    const amount = roundCurrency(Math.max(0, toNumber(req.body?.amount)));
    if (amount <= 0) {
      return res.status(400).json({ message: "Payment amount must be greater than 0" });
    }
    const notes = String(req.body?.notes || "").trim();
    const userId = req.user?.id || null;

    const pendingInvoices = await PurchaseInvoice.find({
      dealerId: dealer._id,
      status: { $in: ["UNPAID", "PARTIALLY_PAID"] },
    }).sort({ purchaseDate: 1, createdAt: 1 });

    if (pendingInvoices.length === 0) {
      return res.status(400).json({ message: "No pending invoices for this dealer" });
    }

    const { updatedInvoices, unallocated } = allocatePayment(pendingInvoices, amount);

    const touched = updatedInvoices.filter((inv) => (inv._amountApplied || 0) > 0);
    if (touched.length === 0) {
      return res.status(400).json({ message: "No funds could be allocated" });
    }

    const applyUpdates = async (session = null) => {
      const allocations = [];
      for (const inv of touched) {
        const appliedAmount = inv._amountApplied;
        const updateOp = PurchaseInvoice.findByIdAndUpdate(
          inv._id,
          {
            $set: {
              paidAmount: inv.paidAmount,
              balanceAmount: inv.balanceAmount,
              status: inv.status,
            },
          },
          { new: true }
        );
        if (session) updateOp.session(session);
        await updateOp;

        const paymentDoc = {
          purchaseInvoiceId: inv._id,
          paidDate: new Date(),
          amount: appliedAmount,
          method: "BANK",
          note: `Dealer batch payment${notes ? `: ${notes}` : ""}`,
          createdBy: userId,
        };
        if (session) {
          await SupplierPayment.create([paymentDoc], { session });
        } else {
          await SupplierPayment.create(paymentDoc);
        }

        allocations.push({
          invoiceId: inv._id,
          amountApplied: appliedAmount,
          resultingStatus: inv.status,
        });
      }

      const dealerPaymentDoc = {
        dealer: dealer._id,
        amount,
        date: new Date(),
        notes,
        allocations,
        createdBy: userId,
      };
      if (session) {
        await DealerPayment.create([dealerPaymentDoc], { session });
      } else {
        await DealerPayment.create(dealerPaymentDoc);
      }
      return allocations;
    };

    let allocations;
    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          allocations = await applyUpdates(session);
        });
      } finally {
        await session.endSession();
      }
    } catch (error) {
      if (isTransactionUnsupportedError(error)) {
        allocations = await applyUpdates(null);
      } else {
        throw error;
      }
    }

    const allocationSummary = allocations.map((a) => {
      const inv = updatedInvoices.find(
        (u) => String(u._id) === String(a.invoiceId)
      );
      return {
        invoiceId: a.invoiceId,
        amountApplied: a.amountApplied,
        resultingStatus: a.resultingStatus,
        balanceRemaining: inv?.balanceAmount ?? 0,
      };
    });

    return res.json({
      totalPaid: amount,
      unallocated,
      allocations: allocationSummary,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateDealer = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid dealer id" });
    }

    const dealer = await Dealer.findById(id);
    if (!dealer) {
      return res.status(404).json({ message: "Dealer not found" });
    }

    const nextName = String(req.body?.name ?? dealer.name).trim();
    if (!nextName) {
      return res.status(400).json({ message: "Dealer name is required" });
    }

    if (req.body?.dealerCode !== undefined) {
      const nextCode = normalizeDealerCode(req.body?.dealerCode);
      if (!nextCode) {
        return res.status(400).json({ message: "Dealer code is invalid" });
      }
      const existingCode = await Dealer.findOne({
        dealerCode: nextCode,
        _id: { $ne: dealer._id },
      });
      if (existingCode) {
        return res.status(409).json({ message: "Dealer code already exists" });
      }
      dealer.dealerCode = nextCode;
    }

    dealer.name = nextName;
    if (req.body?.address !== undefined) {
      dealer.address = String(req.body.address || "").trim();
    }
    if (req.body?.phone1 !== undefined) {
      dealer.phone1 = String(req.body.phone1 || "").trim();
    }
    if (req.body?.phone2 !== undefined) {
      dealer.phone2 = String(req.body.phone2 || "").trim();
    }
    if (req.body?.email !== undefined) {
      dealer.email = String(req.body.email || "").trim();
    }
    if (req.body?.notes !== undefined) {
      dealer.notes = String(req.body.notes || "").trim();
    }

    const saved = await dealer.save();
    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};

