import mongoose from "mongoose";
import { computeItemDiscount } from "../utils/itemDiscount.js";

export const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const roundCurrency = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

export const normalizeStatus = (status) => {
  const normalized = String(status || "UNPAID")
    .trim()
    .toUpperCase();
  if (!["PAID", "UNPAID"].includes(normalized)) {
    throw new Error("Invalid sale status");
  }
  return normalized;
};

export const normalizePaymentMethod = (paymentMethod) => {
  const normalized = String(paymentMethod || "CASH")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!["CASH", "CARD", "BANK_TRANSFER"].includes(normalized)) {
    throw new Error("Invalid payment method");
  }
  return normalized;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const mergeSaleItems = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one sale item is required");
  }

  const byProduct = new Map();
  for (const row of items) {
    const productId = String(row?.productId || "").trim();
    const quantity = Math.floor(toNumber(row?.quantity));
    if (!productId || !isValidObjectId(productId)) {
      throw new Error("Each sale item requires a valid productId");
    }
    if (quantity <= 0) {
      throw new Error("Each sale item requires quantity greater than zero");
    }

    const current = byProduct.get(productId);
    if (current) {
      current.quantity += quantity;
    } else {
      byProduct.set(productId, { productId, quantity });
    }
  }

  return Array.from(byProduct.values());
};

export const buildSaleItems = (requestedItems, inventoryItems) => {
  const inventoryById = new Map(
    inventoryItems.map((item) => [String(item._id), item])
  );

  const items = [];
  let subtotal = 0;
  let itemsSubtotalOriginal = 0;
  let itemDiscountTotal = 0;

  for (const requestItem of requestedItems) {
    const inventoryItem = inventoryById.get(String(requestItem.productId));
    if (!inventoryItem) {
      throw new Error(`Inventory item not found for ${requestItem.productId}`);
    }

    const quantity = toNumber(requestItem.quantity);
    const unitPriceOriginal = roundCurrency(inventoryItem.sellingPrice);
    const discountResult = computeItemDiscount({
      unitPriceOriginal,
      qty: quantity,
      discountEnabled: inventoryItem.discountEnabled,
      discountType: inventoryItem.discountType,
      discountValue: inventoryItem.discountValue,
      startAt: inventoryItem.discountStartAt,
      endAt: inventoryItem.discountEndAt,
      minQty: inventoryItem.minQtyForDiscount,
      cap: inventoryItem.maxDiscountCap,
    });
    const lineTotalOriginal = roundCurrency(unitPriceOriginal * quantity);
    const lineTotal = discountResult.lineTotalNet;

    itemsSubtotalOriginal = roundCurrency(itemsSubtotalOriginal + lineTotalOriginal);
    itemDiscountTotal = roundCurrency(itemDiscountTotal + discountResult.lineDiscountTotal);
    subtotal = roundCurrency(subtotal + lineTotal);

    items.push({
      productId: inventoryItem._id,
      productName: inventoryItem.itemName || inventoryItem.name || "Item",
      sku: inventoryItem.sku || "",
      quantity,
      unitPriceOriginal,
      discountPerUnit: discountResult.discountPerUnit,
      unitPriceNet: discountResult.unitPriceNet,
      unitPrice: discountResult.unitPriceNet,
      lineTotalOriginal,
      lineDiscountTotal: discountResult.lineDiscountTotal,
      lineTotal,
      availableStock: toNumber(inventoryItem.quantity),
    });
  }

  return { items, subtotal, itemsSubtotalOriginal, itemDiscountTotal };
};

export const normalizeDiscount = (discount, subtotal) => {
  if (discount === null || discount === undefined) {
    return { discountType: "AMOUNT", discountValue: 0, discountAmount: 0 };
  }

  if (typeof discount === "number" || typeof discount === "string") {
    const rawValue = Math.max(0, toNumber(discount));
    return {
      discountType: "AMOUNT",
      discountValue: rawValue,
      discountAmount: roundCurrency(clamp(rawValue, 0, subtotal)),
    };
  }

  const type = String(discount.type || "AMOUNT")
    .trim()
    .toUpperCase();
  const rawValue = Math.max(0, toNumber(discount.value));

  if (type === "PERCENT") {
    const percent = clamp(rawValue, 0, 100);
    return {
      discountType: "PERCENT",
      discountValue: percent,
      discountAmount: roundCurrency((subtotal * percent) / 100),
    };
  }

  return {
    discountType: "AMOUNT",
    discountValue: rawValue,
    discountAmount: roundCurrency(clamp(rawValue, 0, subtotal)),
  };
};

export const normalizeTax = (taxInput, taxableAmount) => {
  if (!taxInput || taxInput.enabled === false) {
    return {
      taxEnabled: false,
      taxRate: 0,
      taxAmount: 0,
    };
  }

  const taxRate = clamp(toNumber(taxInput.rate), 0, 100);
  return {
    taxEnabled: true,
    taxRate,
    taxAmount: roundCurrency((taxableAmount * taxRate) / 100),
  };
};

export const computeSaleTotals = ({ subtotal, discount, tax }) => {
  const discountResult = normalizeDiscount(discount, subtotal);
  const taxableAmount = roundCurrency(
    Math.max(0, toNumber(subtotal) - discountResult.discountAmount)
  );
  const taxResult = normalizeTax(tax, taxableAmount);
  const grandTotal = roundCurrency(taxableAmount + taxResult.taxAmount);

  return {
    subtotal: roundCurrency(subtotal),
    discount: discountResult.discountAmount,
    discountType: discountResult.discountType,
    discountValue: discountResult.discountValue,
    tax: taxResult.taxAmount,
    taxRate: taxResult.taxRate,
    taxEnabled: taxResult.taxEnabled,
    grandTotal,
  };
};

export const prepareSaleDraft = ({ payload, inventoryItems }) => {
  const status = normalizeStatus(payload?.status);
  const paymentMethod = normalizePaymentMethod(payload?.paymentMethod);
  const requestedItems = mergeSaleItems(payload?.items || []);
  const { items, subtotal, itemsSubtotalOriginal, itemDiscountTotal } = buildSaleItems(
    requestedItems,
    inventoryItems
  );
  const totals = computeSaleTotals({
    subtotal,
    discount: payload?.discount,
    tax: payload?.tax,
  });

  return {
    status,
    paymentMethod,
    items,
    itemsSubtotalOriginal,
    itemDiscountTotal,
    ...totals,
  };
};

export const buildStockAdjustments = (saleItems) =>
  saleItems.map((item) => {
    const requested = toNumber(item.quantity);
    const available = toNumber(item.availableStock);
    if (requested > available) {
      const error = new Error(
        `Insufficient stock for ${item.productName} (available ${available}, requested ${requested})`
      );
      error.code = "INSUFFICIENT_STOCK";
      throw error;
    }

    return {
      productId: item.productId,
      quantity: requested,
      productName: item.productName,
      availableStock: available,
    };
  });

export const performSafeStockDeduction = async ({
  adjustments,
  decrementStock,
  restoreStock,
}) => {
  const applied = [];

  for (const adjustment of adjustments) {
    // Each decrement call must enforce quantity >= requested in the DB filter.
    const decremented = await decrementStock(adjustment);
    if (!decremented) {
      if (typeof restoreStock === "function" && applied.length > 0) {
        await restoreStock(applied);
      }
      const error = new Error(
        `Insufficient stock for ${adjustment.productName} (requested ${adjustment.quantity})`
      );
      error.code = "INSUFFICIENT_STOCK";
      throw error;
    }
    applied.push(adjustment);
  }

  return applied;
};
