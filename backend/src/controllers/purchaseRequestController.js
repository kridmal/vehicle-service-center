import mongoose from "mongoose";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import Counter from "../models/Counter.js";
import Dealer from "../models/Dealer.js";
import PurchaseInvoice from "../models/PurchaseInvoice.js";
import PurchaseInvoiceItem from "../models/PurchaseInvoiceItem.js";
import PurchaseRequest from "../models/PurchaseRequest.js";
import SupplierPayment from "../models/SupplierPayment.js";
import InventoryItem from "../models/InventoryItem.js";
import {
  computePurchasePaymentStatus,
  computePurchaseTotals,
  roundCurrency,
  toNumber,
} from "../utils/purchaseTotals.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const isTransactionUnsupportedError = (error) =>
  /transaction|replica set|mongos/i.test(String(error?.message || ""));

const toOptionalDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const nextRequestNumber = async () => {
  const counter = await Counter.findByIdAndUpdate(
    "purchaseRequestNumber",
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return `PR-${String(counter.seq).padStart(4, "0")}`;
};

const buildDealerSnapshot = (dealer) => ({
  dealerCode: dealer?.dealerCode || "",
  name: dealer?.name || "",
  address: dealer?.address || "",
  email: dealer?.email || "",
});

const buildItemRows = (rawItems) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("At least one item is required");
  }
  return rawItems.map((row, idx) => {
    const itemName = String(row?.itemName || "").trim();
    if (!itemName) throw new Error(`Item ${idx + 1}: item name is required`);
    const quantity = toNumber(row?.quantity ?? row?.qty);
    if (quantity <= 0) throw new Error(`Item ${idx + 1}: quantity must be greater than 0`);
    return {
      itemName,
      itemDescription: String(row?.itemDescription || "").trim(),
      partNumber: String(row?.partNumber || "").trim(),
      quantity,
    };
  });
};

// ── PDF generation ────────────────────────────────────────────────────────────

const generatePdf = (request, dealer) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const primaryColor = "#1e3a8a";
    const mutedColor = "#64748b";
    const borderColor = "#e2e8f0";

    // Header
    doc.fontSize(22).fillColor(primaryColor).text("Senavi Auto Care", 50, 50);
    doc.fontSize(10).fillColor(mutedColor).text("Vehicle Service Center", 50, 76);

    doc.moveTo(50, 100).lineTo(545, 100).strokeColor(borderColor).stroke();

    // Title
    doc.fontSize(16).fillColor("#0f172a").text("Purchase Request", 50, 115);

    // Request meta
    doc.fontSize(10).fillColor("#0f172a");
    doc.text(`Request No: ${request.requestNumber || "—"}`, 50, 145);
    doc.text(
      `Date: ${new Date(request.requestDate || request.createdAt).toLocaleDateString("en-LK")}`,
      50,
      160
    );
    doc.text(`Status: ${request.status}`, 50, 175);

    // Dealer block
    doc.fontSize(11).fillColor(primaryColor).text("To:", 350, 145);
    doc.fontSize(10).fillColor("#0f172a");
    doc.text(dealer.name || "—", 350, 160);
    if (dealer.address) doc.text(dealer.address, 350, 175);
    if (dealer.email) doc.text(dealer.email, 350, 190);

    // Column positions: Item Name | Description | Part Number | Qty
    const COL = { name: 55, desc: 185, part: 360, qty: 480 };
    const tableTop = 220;

    doc.moveTo(50, tableTop).lineTo(545, tableTop).strokeColor(borderColor).stroke();
    doc
      .fontSize(9)
      .fillColor(mutedColor)
      .text("ITEM NAME", COL.name, tableTop + 8, { width: 125 })
      .text("DESCRIPTION", COL.desc, tableTop + 8, { width: 170 })
      .text("PART NO.", COL.part, tableTop + 8, { width: 115 })
      .text("QTY", COL.qty, tableTop + 8, { width: 55, align: "right" });

    doc
      .moveTo(50, tableTop + 24)
      .lineTo(545, tableTop + 24)
      .strokeColor(borderColor)
      .stroke();

    let y = tableTop + 34;
    const items = request.items || [];
    for (const item of items) {
      const desc = item.itemDescription || "N/A";
      const part = item.partNumber || "N/A";
      doc
        .fontSize(10)
        .fillColor("#0f172a")
        .text(item.itemName || "—", COL.name, y, { width: 125 })
        .text(desc, COL.desc, y, { width: 170 })
        .text(part, COL.part, y, { width: 115 })
        .text(String(item.quantity), COL.qty, y, { width: 55, align: "right" });
      y += 20;
    }

    doc.moveTo(50, y + 6).lineTo(545, y + 6).strokeColor(borderColor).stroke();

    // Notes section (only if present)
    if (request.notes) {
      y += 24;
      doc.fontSize(10).fillColor(mutedColor).text("Notes:", 50, y);
      doc.fontSize(10).fillColor("#0f172a").text(request.notes, 50, y + 14, { width: 495 });
    }

    doc.end();
  });

const formatLkr = (value) =>
  `LKR ${Number(value || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ── Nodemailer transport ──────────────────────────────────────────────────────

const createTransport = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

// ── Handlers ─────────────────────────────────────────────────────────────────

export const createPurchaseRequest = async (req, res, next) => {
  try {
    const dealerId = String(req.body?.dealerId || "").trim();
    if (!dealerId || !isValidId(dealerId)) {
      return res.status(400).json({ message: "A valid dealer is required" });
    }
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) return res.status(404).json({ message: "Dealer not found" });

    const items = buildItemRows(req.body?.items);
    const requestNumber = await nextRequestNumber();

    const request = await PurchaseRequest.create({
      dealer: dealer._id,
      dealerSnapshot: buildDealerSnapshot(dealer),
      requestNumber,
      requestDate: toOptionalDate(req.body?.requestDate) || new Date(),
      items,
      notes: String(req.body?.notes || "").trim(),
      createdBy: req.user?.id || null,
    });

    return res.status(201).json(request);
  } catch (error) {
    if (error.message) return res.status(400).json({ message: error.message });
    return next(error);
  }
};

export const listPurchaseRequests = async (req, res, next) => {
  try {
    const query = {};
    const dealerId = String(req.query?.dealer || req.query?.dealerId || "").trim();
    if (dealerId) {
      if (!isValidId(dealerId)) {
        return res.status(400).json({ message: "Invalid dealer id filter" });
      }
      query.dealer = dealerId;
    }
    const status = String(req.query?.status || "").trim().toUpperCase();
    if (["DRAFT", "SENT", "CONVERTED"].includes(status)) {
      query.status = status;
    }

    const requests = await PurchaseRequest.find(query)
      .populate("dealer", "dealerCode name email")
      .sort({ requestDate: -1, createdAt: -1 });
    return res.json(requests);
  } catch (error) {
    return next(error);
  }
};

export const getPurchaseRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid purchase request id" });
    }
    const request = await PurchaseRequest.findById(id).populate(
      "dealer",
      "dealerCode name address email phone1 phone2"
    );
    if (!request) {
      return res.status(404).json({ message: "Purchase request not found" });
    }
    return res.json(request);
  } catch (error) {
    return next(error);
  }
};

export const getPurchaseRequestPdf = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid purchase request id" });
    }
    const request = await PurchaseRequest.findById(id).populate(
      "dealer",
      "dealerCode name address email"
    );
    if (!request) {
      return res.status(404).json({ message: "Purchase request not found" });
    }
    const dealer = request.dealer || request.dealerSnapshot;
    const pdfBuffer = await generatePdf(request, dealer);
    const filename = `purchase-request-${request.requestNumber || id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (error) {
    return next(error);
  }
};

export const sendPurchaseRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid purchase request id" });
    }
    const request = await PurchaseRequest.findById(id).populate(
      "dealer",
      "dealerCode name address email"
    );
    if (!request) {
      return res.status(404).json({ message: "Purchase request not found" });
    }
    if (request.status === "CONVERTED") {
      return res.status(400).json({ message: "Cannot send a converted request" });
    }

    const dealer = request.dealer;
    if (!dealer?.email) {
      return res
        .status(400)
        .json({ message: "Dealer has no email address on file" });
    }

    if (
      !process.env.SMTP_HOST ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASS ||
      !process.env.SMTP_FROM
    ) {
      return res
        .status(503)
        .json({ message: "Email is not configured on this server" });
    }

    const pdfBuffer = await generatePdf(request, dealer);
    const filename = `purchase-request-${request.requestNumber || id}.pdf`;

    const transporter = createTransport();
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: dealer.email,
      subject: `Purchase Request ${request.requestNumber} — Senavi Auto Care`,
      text: `Dear ${dealer.name},\n\nPlease find attached our purchase request ${request.requestNumber}.\n\nKind regards,\nSenavi Auto Care`,
      attachments: [
        { filename, content: pdfBuffer, contentType: "application/pdf" },
      ],
    });

    request.status = "SENT";
    request.sentAt = new Date();
    await request.save();

    return res.json({ message: "Purchase request sent successfully", request });
  } catch (error) {
    return next(error);
  }
};

// Shared logic for createPurchaseInvoice that also accepts a purchaseRequestId
const buildPurchaseDraft = async ({ payload, userId, session = null }) => {
  const dealerId = String(payload?.dealerId || "").trim();
  if (!dealerId || !isValidId(dealerId)) {
    throw new Error("A valid dealer is required");
  }
  const dealerQuery = Dealer.findById(dealerId);
  if (session) dealerQuery.session(session);
  const dealer = await dealerQuery;
  if (!dealer) throw new Error("Dealer not found");

  const dealerInvoiceNumber = String(payload?.dealerInvoiceNumber || "").trim();
  if (!dealerInvoiceNumber) throw new Error("Dealer invoice number is required");

  const existingQuery = PurchaseInvoice.findOne({ dealerId: dealer._id, dealerInvoiceNumber });
  if (session) existingQuery.session(session);
  const existing = await existingQuery;
  if (existing) throw new Error("Dealer invoice number already exists for this dealer");

  const purchaseDate = toOptionalDate(payload?.purchaseDate);
  if (!purchaseDate) throw new Error("A valid purchase date is required");

  const purchaseType = ["CREDIT", "CHEQUE", "CASH"].includes(
    String(payload?.purchaseType || "CREDIT").toUpperCase()
  )
    ? String(payload.purchaseType).toUpperCase()
    : "CREDIT";

  const rawItems = payload?.items || [];
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("At least one line item is required");
  }
  const ids = [...new Set(rawItems.map((r) => String(r?.inventoryItemId || r?.productId || "")))];
  if (ids.some((id) => !isValidId(id))) {
    throw new Error("Each line item must include a valid inventory item");
  }
  const invQuery = InventoryItem.find({ _id: { $in: ids } });
  if (session) invQuery.session(session);
  const invItems = await invQuery;
  if (invItems.length !== ids.length) throw new Error("One or more inventory items not found");
  const byId = new Map(invItems.map((inv) => [String(inv._id), inv]));

  const lineItems = rawItems.map((row, i) => {
    const invId = String(row?.inventoryItemId || row?.productId || "");
    const inv = byId.get(invId);
    const qty = Math.max(0, toNumber(row?.qty ?? row?.quantity));
    if (qty <= 0) throw new Error(`Item ${i + 1}: quantity must be greater than 0`);
    const unitCostPrice = Math.max(0, toNumber(row?.unitCostPrice ?? row?.unitPrice));
    const lineTotal = roundCurrency(qty * unitCostPrice);
    return {
      inventoryItemId: inv._id,
      itemSnapshot: { sku: inv.sku || "", name: inv.itemName || "" },
      qty,
      unitCostPrice,
      lineTotal,
    };
  });

  const subtotal = roundCurrency(lineItems.reduce((s, l) => s + l.lineTotal, 0));
  const totals = computePurchaseTotals({
    subtotal,
    invoiceDiscount: payload?.invoiceDiscount,
    tax: payload?.tax,
  });
  const paidNow = roundCurrency(Math.max(0, toNumber(payload?.paidNow)));
  if (paidNow > totals.totalAmount) throw new Error("Paid now cannot exceed total");
  const paymentSummary = computePurchasePaymentStatus({
    totalAmount: totals.totalAmount,
    paidAmount: paidNow,
  });

  return {
    dealer,
    dealerSnapshot: {
      dealerCode: dealer.dealerCode || "",
      name: dealer.name || "",
      address: dealer.address || "",
      phone1: dealer.phone1 || "",
      phone2: dealer.phone2 || "",
    },
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
  } else {
    await InventoryItem.bulkWrite(ops, { ordered: false });
  }
};

export const convertPurchaseRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid purchase request id" });
    }
    const purchaseRequest = await PurchaseRequest.findById(id);
    if (!purchaseRequest) {
      return res.status(404).json({ message: "Purchase request not found" });
    }
    if (purchaseRequest.status === "CONVERTED") {
      return res.status(409).json({ message: "This request has already been converted" });
    }

    const userId = req.user?.id;
    let invoiceId = null;

    const tryWithTransaction = async () => {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const draft = await buildPurchaseDraft({ payload: req.body, userId, session });
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
                purchaseRequestId: purchaseRequest._id,
                createdBy: draft.createdBy,
              },
            ],
            { session }
          );
          invoiceId = invoice._id;

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

          await PurchaseRequest.findByIdAndUpdate(
            purchaseRequest._id,
            { status: "CONVERTED", convertedToInvoiceId: invoice._id },
            { session }
          );
        });
      } finally {
        await session.endSession();
      }
    };

    const tryWithoutTransaction = async () => {
      const draft = await buildPurchaseDraft({ payload: req.body, userId });
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
          purchaseRequestId: purchaseRequest._id,
          createdBy: draft.createdBy,
        });
        invoiceId = invoice._id;
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
        await PurchaseRequest.findByIdAndUpdate(purchaseRequest._id, {
          status: "CONVERTED",
          convertedToInvoiceId: invoice._id,
        });
      } catch (error) {
        if (stockApplied) {
          const rollbackOps = draft.lineItems.map((l) => ({
            updateOne: {
              filter: { _id: l.inventoryItemId },
              update: { $inc: { quantity: -l.qty } },
            },
          }));
          await InventoryItem.bulkWrite(rollbackOps, { ordered: false });
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

    try {
      await tryWithTransaction();
    } catch (error) {
      if (isTransactionUnsupportedError(error)) {
        await tryWithoutTransaction();
      } else {
        throw error;
      }
    }

    const createdInvoice = await PurchaseInvoice.findById(invoiceId).populate(
      "dealerId",
      "dealerCode name"
    );
    return res.status(201).json(createdInvoice);
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(409)
        .json({ message: "Dealer invoice number already exists for this dealer" });
    }
    if (error?.message) return res.status(400).json({ message: error.message });
    return next(error);
  }
};
