import mongoose from "mongoose";
import Counter from "../models/Counter.js";
import InventoryItem from "../models/InventoryItem.js";
import Sale from "../models/Sale.js";
import {
  buildStockAdjustments,
  mergeSaleItems,
  performSafeStockDeduction,
  prepareSaleDraft,
} from "../services/salesService.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const makeHttpError = (status, message, code) => {
  const error = new Error(message);
  error.status = status;
  error.code = code || null;
  return error;
};

const isTransactionUnsupportedError = (error) =>
  /transaction|replica set|mongos/i.test(String(error?.message || ""));

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const nextSaleNumber = async (session = null) => {
  const counter = await Counter.findByIdAndUpdate(
    "saleNumber",
    { $inc: { seq: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      session,
    }
  );

  return `SAL-${String(counter.seq).padStart(5, "0")}`;
};

const loadInventoryItems = async (payloadItems, session = null) => {
  const requestedItems = mergeSaleItems(payloadItems);
  const ids = [...new Set(requestedItems.map((item) => String(item.productId)))];
  const inventoryQuery = InventoryItem.find({ _id: { $in: ids } });
  if (session) {
    inventoryQuery.session(session);
  }
  const inventoryItems = await inventoryQuery;

  if (inventoryItems.length !== ids.length) {
    const found = new Set(inventoryItems.map((item) => String(item._id)));
    const missingId = ids.find((id) => !found.has(id));
    throw makeHttpError(404, `Inventory item not found for ${missingId}`);
  }

  return inventoryItems;
};

const toPersistedSalePayload = ({ draft, soldBy, saleNumber }) => ({
  saleNumber,
  items: draft.items.map(({ availableStock, ...item }) => item),
  itemsSubtotalOriginal: draft.itemsSubtotalOriginal,
  itemDiscountTotal: draft.itemDiscountTotal,
  subtotal: draft.subtotal,
  discount: draft.discount,
  discountType: draft.discountType,
  discountValue: draft.discountValue,
  tax: draft.tax,
  taxRate: draft.taxRate,
  taxEnabled: draft.taxEnabled,
  grandTotal: draft.grandTotal,
  paymentMethod: draft.paymentMethod,
  status: draft.status,
  soldBy,
  saleDate: new Date(),
});

const createSaleDocument = async ({ draft, soldBy, session = null }) => {
  const saleNumber = await nextSaleNumber(session);
  const payload = toPersistedSalePayload({ draft, soldBy, saleNumber });

  if (session) {
    const [sale] = await Sale.create([payload], { session });
    return sale;
  }

  return Sale.create(payload);
};

const rollbackStock = async (deductedAdjustments) => {
  if (!Array.isArray(deductedAdjustments) || deductedAdjustments.length === 0) {
    return;
  }

  const restoreOps = deductedAdjustments.map((row) => ({
    updateOne: {
      filter: { _id: row.productId },
      update: { $inc: { quantity: row.quantity } },
    },
  }));

  await InventoryItem.bulkWrite(restoreOps, { ordered: false });
};

const validateAndBuildDraft = async ({ payload, session = null }) => {
  const inventoryItems = await loadInventoryItems(payload.items || [], session);

  try {
    return prepareSaleDraft({ payload, inventoryItems });
  } catch (error) {
    throw makeHttpError(400, error.message);
  }
};

const createPaidSaleWithoutTransaction = async ({ payload, soldBy }) => {
  const draft = await validateAndBuildDraft({ payload });

  try {
    const adjustments = buildStockAdjustments(draft.items);
    const appliedAdjustments = await performSafeStockDeduction({
      adjustments,
      decrementStock: async (adjustment) => {
        const updated = await InventoryItem.findOneAndUpdate(
          {
            _id: adjustment.productId,
            quantity: { $gte: adjustment.quantity },
          },
          { $inc: { quantity: -adjustment.quantity } },
          { new: true }
        );
        return Boolean(updated);
      },
      restoreStock: rollbackStock,
    });

    try {
      return await createSaleDocument({ draft, soldBy });
    } catch (error) {
      await rollbackStock(appliedAdjustments);
      throw error;
    }
  } catch (error) {
    if (error?.code === "INSUFFICIENT_STOCK") {
      throw makeHttpError(409, error.message, "INSUFFICIENT_STOCK");
    }
    if (error?.status) {
      throw error;
    }
    throw makeHttpError(500, "Failed to complete paid sale");
  }
};

const createPaidSaleWithTransaction = async ({ payload, soldBy }) => {
  const session = await mongoose.startSession();
  try {
    let created = null;
    await session.withTransaction(async () => {
      const draft = await validateAndBuildDraft({ payload, session });
      const adjustments = buildStockAdjustments(draft.items);

      await performSafeStockDeduction({
        adjustments,
        decrementStock: async (adjustment) => {
          const updated = await InventoryItem.findOneAndUpdate(
            {
              _id: adjustment.productId,
              quantity: { $gte: adjustment.quantity },
            },
            { $inc: { quantity: -adjustment.quantity } },
            { new: true, session }
          );
          return Boolean(updated);
        },
      });

      created = await createSaleDocument({ draft, soldBy, session });
    });

    return created;
  } catch (error) {
    if (error?.code === "INSUFFICIENT_STOCK") {
      throw makeHttpError(409, error.message, "INSUFFICIENT_STOCK");
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

export const listSaleProducts = async (req, res, next) => {
  try {
    const search = String(req.query?.search || "").trim();
    const query = {};

    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { itemName: { $regex: safeSearch, $options: "i" } },
        { sku: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const products = await InventoryItem.find(query)
      .select(
        "itemName sku quantity sellingPrice unit category brand variant discountEnabled discountType discountValue discountStartAt discountEndAt minQtyForDiscount maxDiscountCap discountNote"
      )
      .sort({ itemName: 1 })
      .limit(200);

    return res.json(products);
  } catch (error) {
    return next(error);
  }
};

export const createSale = async (req, res, next) => {
  try {
    const requestedItems = mergeSaleItems(req.body?.items || []);
    const payload = {
      ...req.body,
      items: requestedItems,
    };

    let draft = null;
    try {
      draft = await validateAndBuildDraft({ payload });
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message });
    }

    let sale = null;
    if (draft.status === "UNPAID") {
      sale = await createSaleDocument({ draft, soldBy: req.user.id });
    } else {
      try {
        sale = await createPaidSaleWithTransaction({
          payload,
          soldBy: req.user.id,
        });
      } catch (error) {
        if (isTransactionUnsupportedError(error)) {
          sale = await createPaidSaleWithoutTransaction({
            payload,
            soldBy: req.user.id,
          });
        } else if (error.status) {
          return res.status(error.status).json({ message: error.message });
        } else {
          throw error;
        }
      }
    }

    const hydratedSale = await Sale.findById(sale._id).populate("soldBy", "name email");
    return res.status(201).json(hydratedSale || sale);
  } catch (error) {
    if (error?.code === "INSUFFICIENT_STOCK") {
      return res.status(409).json({ message: error.message });
    }
    if (error?.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
};

export const listSales = async (req, res, next) => {
  try {
    const query = {};
    const { from, to, cashier } = req.query || {};

    if (from || to) {
      const dateQuery = {};
      if (from) {
        const fromDate = new Date(from);
        if (Number.isNaN(fromDate.getTime())) {
          return res.status(400).json({ message: "Invalid 'from' date" });
        }
        fromDate.setHours(0, 0, 0, 0);
        dateQuery.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (Number.isNaN(toDate.getTime())) {
          return res.status(400).json({ message: "Invalid 'to' date" });
        }
        toDate.setHours(23, 59, 59, 999);
        dateQuery.$lte = toDate;
      }
      query.saleDate = dateQuery;
    }

    if (cashier) {
      if (!isValidId(cashier)) {
        return res.status(400).json({ message: "Invalid cashier id" });
      }
      query.soldBy = cashier;
    }

    const sales = await Sale.find(query)
      .populate("soldBy", "name email")
      .sort({ saleDate: -1, createdAt: -1 });

    return res.json(sales);
  } catch (error) {
    return next(error);
  }
};

export const getSaleById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid sale id" });
    }

    const sale = await Sale.findById(id).populate("soldBy", "name email");
    if (!sale) {
      return res.status(404).json({ message: "Sale not found" });
    }

    return res.json(sale);
  } catch (error) {
    return next(error);
  }
};
