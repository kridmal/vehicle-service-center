import mongoose from "mongoose";
import Dealer from "../models/Dealer.js";
import InventoryItem from "../models/InventoryItem.js";
import PurchaseInvoice from "../models/PurchaseInvoice.js";
import PurchaseInvoiceItem from "../models/PurchaseInvoiceItem.js";
import SupplierPayment from "../models/SupplierPayment.js";
import {
  computePurchasePaymentStatus,
  computePurchaseTotals,
  roundCurrency,
  toNumber,
} from "../utils/purchaseTotals.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isTransactionUnsupportedError = (error) =>
  /transaction|replica set|mongos/i.test(String(error?.message || ""));

const toOptionalDate = (value) => {
  if (!hasValue(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizePurchaseType = (value) => {
  const normalized = String(value || "CREDIT")
    .trim()
    .toUpperCase();
  if (["CREDIT", "CHEQUE", "CASH"].includes(normalized)) {
    return normalized;
  }
  return null;
};

const normalizePaymentMethod = (value) => {
  const normalized = String(value || "CASH")
    .trim()
    .toUpperCase();
  if (["CASH", "CHEQUE", "BANK"].includes(normalized)) {
    return normalized;
  }
  return null;
};

const buildDealerSnapshot = (dealer) => ({
  dealerCode: dealer?.dealerCode || "",
  name: dealer?.name || "",
  address: dealer?.address || "",
  phone1: dealer?.phone1 || "",
  phone2: dealer?.phone2 || "",
});

const mergePurchaseItems = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one purchase line item is required");
  }

  const grouped = new Map();
  for (const row of items) {
    const inventoryItemId = String(
      row?.inventoryItemId || row?.productId || row?.itemId || ""
    ).trim();
    const qty = toNumber(row?.qty ?? row?.quantity);
    const unitCostPrice = Math.max(0, toNumber(row?.unitCostPrice ?? row?.unitPrice));

    if (!inventoryItemId || !isValidId(inventoryItemId)) {
      throw new Error("Each line item must include a valid inventory item");
    }
    if (qty <= 0) {
      throw new Error("Line item quantity must be greater than zero");
    }

    const key = `${inventoryItemId}:${unitCostPrice}`;
    const current = grouped.get(key);
    if (current) {
      current.qty = roundCurrency(current.qty + qty);
    } else {
      grouped.set(key, {
        inventoryItemId,
        qty: roundCurrency(qty),
        unitCostPrice: roundCurrency(unitCostPrice),
      });
    }
  }

  return Array.from(grouped.values());
};

const loadInventoryForPurchase = async (mergedItems, session = null) => {
  const ids = [...new Set(mergedItems.map((item) => item.inventoryItemId))];
  const query = InventoryItem.find({ _id: { $in: ids } });
  if (session) {
    query.session(session);
  }
  const items = await query;

  if (items.length !== ids.length) {
    const found = new Set(items.map((item) => String(item._id)));
    const missingId = ids.find((id) => !found.has(String(id)));
    throw new Error(`Inventory item not found for ${missingId}`);
  }

  const byId = new Map(items.map((item) => [String(item._id), item]));
  return mergedItems.map((entry) => {
    const inventoryItem = byId.get(String(entry.inventoryItemId));
    const lineTotal = roundCurrency(entry.qty * entry.unitCostPrice);
    return {
      inventoryItemId: inventoryItem._id,
      itemSnapshot: {
        sku: inventoryItem.sku || "",
        name: inventoryItem.itemName || inventoryItem.name || "",
      },
      qty: entry.qty,
      unitCostPrice: entry.unitCostPrice,
      lineTotal,
    };
  });
};

const validateUniqueDealerInvoice = async ({
  dealerId,
  dealerInvoiceNumber,
  ignoreId = null,
  session = null,
}) => {
  const query = {
    dealerId,
    dealerInvoiceNumber,
  };
  if (ignoreId) {
    query._id = { $ne: ignoreId };
  }
  const findQuery = PurchaseInvoice.findOne(query);
  if (session) {
    findQuery.session(session);
  }
  const existing = await findQuery;
  if (existing) {
    throw new Error("Dealer invoice number already exists for this dealer");
  }
};

const buildPurchaseDraft = async ({ payload, userId, session = null }) => {
  const dealerId = String(payload?.dealerId || "").trim();
  if (!dealerId || !isValidId(dealerId)) {
    throw new Error("A valid dealer is required");
  }
  const dealerQuery = Dealer.findById(dealerId);
  if (session) {
    dealerQuery.session(session);
  }
  const dealer = await dealerQuery;
  if (!dealer) {
    throw new Error("Dealer not found");
  }

  const dealerInvoiceNumber = String(payload?.dealerInvoiceNumber || "").trim();
  if (!dealerInvoiceNumber) {
    throw new Error("Dealer invoice number is required");
  }
  await validateUniqueDealerInvoice({
    dealerId: dealer._id,
    dealerInvoiceNumber,
    session,
  });

  const purchaseDate = toOptionalDate(payload?.purchaseDate);
  if (!purchaseDate) {
    throw new Error("A valid purchase date is required");
  }

  const purchaseType = normalizePurchaseType(payload?.purchaseType);
  if (!purchaseType) {
    throw new Error("Invalid purchase type");
  }

  const mergedItems = mergePurchaseItems(payload?.items || []);
  const lineItems = await loadInventoryForPurchase(mergedItems, session);
  const subtotal = roundCurrency(
    lineItems.reduce((sum, item) => sum + toNumber(item.lineTotal), 0)
  );

  const totals = computePurchaseTotals({
    subtotal,
    invoiceDiscount: payload?.invoiceDiscount,
    tax: payload?.tax,
  });

  const paidNow = roundCurrency(Math.max(0, toNumber(payload?.paidNow)));
  if (paidNow > totals.totalAmount) {
    throw new Error("Paid now amount cannot exceed total amount");
  }
  const paymentSummary = computePurchasePaymentStatus({
    totalAmount: totals.totalAmount,
    paidAmount: paidNow,
  });

  return {
    dealer,
    dealerSnapshot: buildDealerSnapshot(dealer),
    dealerInvoiceNumber,
    purchaseDate,
    purchaseType,
    lineItems,
    totals,
    paidNow,
    paymentSummary,
    nextVisitDate: toOptionalDate(payload?.nextVisitDate),
    remarks: String(payload?.remarks || "").trim(),
    createdBy: userId || null,
  };
};

const applyStockIn = async ({ lineItems, session = null }) => {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return;
  const ops = lineItems.map((line) => ({
    updateOne: {
      filter: { _id: line.inventoryItemId },
      update: {
        $inc: { quantity: line.qty },
        $set: { lastPurchaseCost: line.unitCostPrice },
      },
    },
  }));

  if (session) {
    await InventoryItem.bulkWrite(ops, { ordered: false, session });
    return;
  }
  await InventoryItem.bulkWrite(ops, { ordered: false });
};

const rollbackStockIn = async (lineItems) => {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return;
  const ops = lineItems.map((line) => ({
    updateOne: {
      filter: { _id: line.inventoryItemId },
      update: { $inc: { quantity: -line.qty } },
    },
  }));
  await InventoryItem.bulkWrite(ops, { ordered: false });
};

const createPurchaseInvoiceWithTransaction = async ({ payload, userId }) => {
  const session = await mongoose.startSession();
  try {
    let createdInvoiceId = null;
    await session.withTransaction(async () => {
      const draft = await buildPurchaseDraft({ payload, userId, session });

      const [invoice] = await PurchaseInvoice.create(
        [
          {
            dealerId: draft.dealer._id,
            dealerSnapshot: draft.dealerSnapshot,
            dealerInvoiceNumber: draft.dealerInvoiceNumber,
            purchaseDate: draft.purchaseDate,
            purchaseType: draft.purchaseType,
            status: draft.paymentSummary.status,
            subtotal: draft.totals.subtotal,
            invoiceDiscountType: draft.totals.invoiceDiscountType,
            invoiceDiscountValue: draft.totals.invoiceDiscountValue,
            invoiceDiscountAmount: draft.totals.invoiceDiscountAmount,
            taxEnabled: draft.totals.taxEnabled,
            taxRate: draft.totals.taxRate,
            taxAmount: draft.totals.taxAmount,
            totalAmount: draft.totals.totalAmount,
            paidAmount: draft.paymentSummary.paidAmount,
            balanceAmount: draft.paymentSummary.balanceAmount,
            nextVisitDate: draft.nextVisitDate,
            remarks: draft.remarks,
            createdBy: draft.createdBy,
          },
        ],
        { session }
      );

      createdInvoiceId = invoice._id;

      const itemDocs = draft.lineItems.map((line) => ({
        purchaseInvoiceId: invoice._id,
        inventoryItemId: line.inventoryItemId,
        itemSnapshot: line.itemSnapshot,
        qty: line.qty,
        unitCostPrice: line.unitCostPrice,
        lineTotal: line.lineTotal,
      }));
      if (itemDocs.length > 0) {
        await PurchaseInvoiceItem.insertMany(itemDocs, { session });
      }

      await applyStockIn({ lineItems: draft.lineItems, session });

      if (draft.paidNow > 0) {
        await SupplierPayment.create(
          [
            {
              purchaseInvoiceId: invoice._id,
              paidDate: new Date(),
              amount: draft.paymentSummary.paidAmount,
              method: "CASH",
              note: "Paid at invoice creation",
              createdBy: draft.createdBy,
            },
          ],
          { session }
        );
      }
    });

    return createdInvoiceId;
  } finally {
    await session.endSession();
  }
};

const createPurchaseInvoiceWithoutTransaction = async ({ payload, userId }) => {
  const draft = await buildPurchaseDraft({ payload, userId });
  let invoice = null;
  let stockApplied = false;
  try {
    invoice = await PurchaseInvoice.create({
      dealerId: draft.dealer._id,
      dealerSnapshot: draft.dealerSnapshot,
      dealerInvoiceNumber: draft.dealerInvoiceNumber,
      purchaseDate: draft.purchaseDate,
      purchaseType: draft.purchaseType,
      status: draft.paymentSummary.status,
      subtotal: draft.totals.subtotal,
      invoiceDiscountType: draft.totals.invoiceDiscountType,
      invoiceDiscountValue: draft.totals.invoiceDiscountValue,
      invoiceDiscountAmount: draft.totals.invoiceDiscountAmount,
      taxEnabled: draft.totals.taxEnabled,
      taxRate: draft.totals.taxRate,
      taxAmount: draft.totals.taxAmount,
      totalAmount: draft.totals.totalAmount,
      paidAmount: draft.paymentSummary.paidAmount,
      balanceAmount: draft.paymentSummary.balanceAmount,
      nextVisitDate: draft.nextVisitDate,
      remarks: draft.remarks,
      createdBy: draft.createdBy,
    });

    const itemDocs = draft.lineItems.map((line) => ({
      purchaseInvoiceId: invoice._id,
      inventoryItemId: line.inventoryItemId,
      itemSnapshot: line.itemSnapshot,
      qty: line.qty,
      unitCostPrice: line.unitCostPrice,
      lineTotal: line.lineTotal,
    }));
    if (itemDocs.length > 0) {
      await PurchaseInvoiceItem.insertMany(itemDocs);
    }

    await applyStockIn({ lineItems: draft.lineItems });
    stockApplied = true;

    if (draft.paidNow > 0) {
      await SupplierPayment.create({
        purchaseInvoiceId: invoice._id,
        paidDate: new Date(),
        amount: draft.paymentSummary.paidAmount,
        method: "CASH",
        note: "Paid at invoice creation",
        createdBy: draft.createdBy,
      });
    }

    return invoice._id;
  } catch (error) {
    if (stockApplied) {
      await rollbackStockIn(draft.lineItems);
    }
    if (invoice?._id) {
      await Promise.allSettled([
        PurchaseInvoiceItem.deleteMany({ purchaseInvoiceId: invoice._id }),
        SupplierPayment.deleteMany({ purchaseInvoiceId: invoice._id }),
        PurchaseInvoice.findByIdAndDelete(invoice._id),
      ]);
    }
    throw error;
  }
};

const getPurchaseDetailById = async (id) => {
  const invoice = await PurchaseInvoice.findById(id).populate(
    "dealerId",
    "dealerCode name address phone1 phone2 email"
  );
  if (!invoice) return null;

  const [items, payments] = await Promise.all([
    PurchaseInvoiceItem.find({ purchaseInvoiceId: invoice._id })
      .populate("inventoryItemId", "itemName sku unit")
      .sort({ createdAt: 1 }),
    SupplierPayment.find({ purchaseInvoiceId: invoice._id }).sort({
      paidDate: 1,
      createdAt: 1,
    }),
  ]);

  return {
    ...invoice.toObject(),
    items,
    payments,
  };
};

export const createPurchaseInvoice = async (req, res, next) => {
  try {
    let purchaseInvoiceId = null;
    try {
      purchaseInvoiceId = await createPurchaseInvoiceWithTransaction({
        payload: req.body,
        userId: req.user?.id,
      });
    } catch (error) {
      if (isTransactionUnsupportedError(error)) {
        purchaseInvoiceId = await createPurchaseInvoiceWithoutTransaction({
          payload: req.body,
          userId: req.user?.id,
        });
      } else {
        throw error;
      }
    }

    const detail = await getPurchaseDetailById(purchaseInvoiceId);
    return res.status(201).json(detail);
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(409)
        .json({ message: "Dealer invoice number already exists for this dealer" });
    }
    if (error?.message) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
};

export const listPurchaseInvoices = async (req, res, next) => {
  try {
    const query = {};
    const status = String(req.query?.status || "")
      .trim()
      .toUpperCase();
    if (["UNPAID", "PARTIALLY_PAID", "PAID"].includes(status)) {
      query.status = status;
    }

    const dealerId = String(req.query?.dealer || req.query?.dealerId || "").trim();
    if (dealerId) {
      if (!isValidId(dealerId)) {
        return res.status(400).json({ message: "Invalid dealer id filter" });
      }
      query.dealerId = dealerId;
    }

    const from = toOptionalDate(req.query?.from);
    const to = toOptionalDate(req.query?.to);
    if (req.query?.from && !from) {
      return res.status(400).json({ message: "Invalid 'from' date" });
    }
    if (req.query?.to && !to) {
      return res.status(400).json({ message: "Invalid 'to' date" });
    }
    if (from || to) {
      query.purchaseDate = {};
      if (from) {
        from.setHours(0, 0, 0, 0);
        query.purchaseDate.$gte = from;
      }
      if (to) {
        to.setHours(23, 59, 59, 999);
        query.purchaseDate.$lte = to;
      }
    }

    const search = String(req.query?.q || req.query?.search || "").trim();
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { dealerInvoiceNumber: { $regex: safeSearch, $options: "i" } },
        { "dealerSnapshot.dealerCode": { $regex: safeSearch, $options: "i" } },
        { "dealerSnapshot.name": { $regex: safeSearch, $options: "i" } },
      ];
    }

    const invoices = await PurchaseInvoice.find(query)
      .populate("dealerId", "dealerCode name")
      .sort({ purchaseDate: -1, createdAt: -1 });
    return res.json(invoices);
  } catch (error) {
    return next(error);
  }
};

export const getPurchaseInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid purchase invoice id" });
    }

    const detail = await getPurchaseDetailById(id);
    if (!detail) {
      return res.status(404).json({ message: "Purchase invoice not found" });
    }
    return res.json(detail);
  } catch (error) {
    return next(error);
  }
};

export const addPurchasePayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid purchase invoice id" });
    }

    const invoice = await PurchaseInvoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ message: "Purchase invoice not found" });
    }

    const amount = roundCurrency(Math.max(0, toNumber(req.body?.amount)));
    if (amount <= 0) {
      return res.status(400).json({ message: "Payment amount must be greater than 0" });
    }

    const currentBalance = roundCurrency(Math.max(0, toNumber(invoice.balanceAmount)));
    if (amount > currentBalance) {
      return res
        .status(400)
        .json({ message: "Payment amount cannot exceed outstanding balance" });
    }

    const method = normalizePaymentMethod(req.body?.method);
    if (!method) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    const paidDate = toOptionalDate(req.body?.paidDate);
    if (req.body?.paidDate && !paidDate) {
      return res.status(400).json({ message: "Invalid paid date" });
    }

    const payment = await SupplierPayment.create({
      purchaseInvoiceId: invoice._id,
      paidDate: paidDate || new Date(),
      amount,
      method,
      referenceNo: String(req.body?.referenceNo || "").trim(),
      note: String(req.body?.note || "").trim(),
      createdBy: req.user?.id || null,
    });

    const paymentSummary = computePurchasePaymentStatus({
      totalAmount: invoice.totalAmount,
      paidAmount: toNumber(invoice.paidAmount) + amount,
    });

    invoice.paidAmount = paymentSummary.paidAmount;
    invoice.balanceAmount = paymentSummary.balanceAmount;
    invoice.status = paymentSummary.status;
    await invoice.save();

    return res.status(201).json({
      payment,
      invoice: {
        _id: invoice._id,
        status: invoice.status,
        paidAmount: invoice.paidAmount,
        balanceAmount: invoice.balanceAmount,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const listPurchasePayments = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid purchase invoice id" });
    }

    const invoice = await PurchaseInvoice.findById(id).select("_id");
    if (!invoice) {
      return res.status(404).json({ message: "Purchase invoice not found" });
    }

    const payments = await SupplierPayment.find({ purchaseInvoiceId: id }).sort({
      paidDate: 1,
      createdAt: 1,
    });
    return res.json(payments);
  } catch (error) {
    return next(error);
  }
};

