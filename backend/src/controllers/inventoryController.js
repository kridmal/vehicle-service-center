import mongoose from "mongoose";
import InventoryItem from "../models/InventoryItem.js";
import InventoryCategory from "../models/InventoryCategory.js";
import { normalizeItemDiscountType } from "../utils/itemDiscount.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const toOptionalDate = (value) => {
  if (!hasValue(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizeSegment = (value) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .trim();

const normalizeSku = (value) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const shortFromWords = (value, fallback = "") => {
  const words = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return fallback;
  return words.map((word) => normalizeSegment(word)[0]).join("");
};

const shortFromValue = (value, length, fallback = "") => {
  const normalized = normalizeSegment(value);
  if (!normalized) return fallback;
  return normalized.slice(0, length);
};

const generateSku = ({ category, brand, itemName, variant }) => {
  const categoryShort = shortFromWords(category, "GEN");
  const brandShort = shortFromValue(brand, 3, "GEN");
  const itemToken = normalizeSegment(itemName);
  const variantToken = normalizeSegment(variant);
  return [categoryShort, brandShort, itemToken, variantToken]
    .filter(Boolean)
    .join("-");
};

const resolveCategoryName = async (category) => {
  const name = String(category ?? "").trim();
  if (!name) return null;
  const match = await InventoryCategory.findOne({
    name: new RegExp(`^${name}$`, "i"),
    active: true,
  });
  return match?.name || null;
};

const DISCOUNT_KEYS = [
  "discountEnabled",
  "discountType",
  "discountValue",
  "discountStartAt",
  "discountEndAt",
  "minQtyForDiscount",
  "maxDiscountCap",
  "discountNote",
];

const hasDiscountInput = (payload = {}) =>
  DISCOUNT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(payload, key));

const normalizeDiscountPayload = (payload = {}) => {
  const discountEnabled = Boolean(payload.discountEnabled);
  const discountType = normalizeItemDiscountType(payload.discountType);
  const discountValue = Math.max(0, toNumber(payload.discountValue));
  const minQtyForDiscount = Math.max(1, toNumber(payload.minQtyForDiscount, 1));
  const maxDiscountCap = hasValue(payload.maxDiscountCap)
    ? Math.max(0, toNumber(payload.maxDiscountCap))
    : null;
  const rawStartAt = payload.discountStartAt;
  const rawEndAt = payload.discountEndAt;
  const discountStartAt = toOptionalDate(rawStartAt);
  const discountEndAt = toOptionalDate(rawEndAt);

  if (hasValue(rawStartAt) && !discountStartAt) {
    return { error: "Invalid discount start date" };
  }
  if (hasValue(rawEndAt) && !discountEndAt) {
    return { error: "Invalid discount end date" };
  }

  if (discountStartAt && discountEndAt && discountStartAt > discountEndAt) {
    return { error: "Discount end date must be after start date" };
  }

  if (!discountEnabled) {
    return {
      discountEnabled: false,
      discountType: null,
      discountValue: 0,
      discountStartAt: null,
      discountEndAt: null,
      minQtyForDiscount: 1,
      maxDiscountCap: null,
      discountNote: String(payload.discountNote || "").trim(),
    };
  }

  if (!discountType) {
    return { error: "Discount type must be PERCENT or AMOUNT" };
  }
  if (discountType === "PERCENT" && (discountValue < 0 || discountValue > 100)) {
    return { error: "Percent discount must be between 0 and 100" };
  }

  return {
    discountEnabled: true,
    discountType,
    discountValue,
    discountStartAt,
    discountEndAt,
    minQtyForDiscount,
    maxDiscountCap,
    discountNote: String(payload.discountNote || "").trim(),
  };
};

export const listInventory = async (req, res, next) => {
  try {
    const items = await InventoryItem.find().sort({ createdAt: -1 });
    return res.json(items);
  } catch (error) {
    return next(error);
  }
};

export const createInventoryItem = async (req, res, next) => {
  try {
    const {
      sku,
      itemName,
      name,
      category,
      brand,
      variant,
      quantity,
      unit,
      minStock,
      costPrice,
      sellingPrice,
      notes,
      lastPurchaseCost,
    } = req.body;
    const resolvedName = itemName || name;
    if (
      !resolvedName ||
      !category ||
      unit === undefined ||
      quantity === undefined ||
      costPrice === undefined ||
      sellingPrice === undefined
    ) {
      return res.status(400).json({
        message:
          "Item name, category, quantity, unit, cost price, and selling price are required",
      });
    }
    const resolvedCategory = await resolveCategoryName(category);
    if (!resolvedCategory) {
      return res.status(400).json({ message: "Invalid inventory category" });
    }
    const resolvedSku = normalizeSku(sku) || generateSku({
      category: resolvedCategory,
      brand,
      itemName: resolvedName,
      variant,
    });
    if (!resolvedSku) {
      return res.status(400).json({ message: "SKU could not be generated" });
    }
    const existingSku = await InventoryItem.findOne({ sku: resolvedSku });
    if (existingSku) {
      return res.status(409).json({ message: "SKU already exists" });
    }
    const numericCost = toNumber(costPrice);
    const numericSelling = toNumber(sellingPrice);
    if (numericSelling < numericCost) {
      return res
        .status(400)
        .json({ message: "Selling price must be >= cost price" });
    }
    const normalizedDiscount = normalizeDiscountPayload(req.body);
    if (normalizedDiscount.error) {
      return res.status(400).json({ message: normalizedDiscount.error });
    }

    const item = await InventoryItem.create({
      sku: resolvedSku,
      itemName: resolvedName,
      category: resolvedCategory,
      brand,
      variant,
      quantity: toNumber(quantity),
      unit,
      minStock: minStock !== undefined ? toNumber(minStock) : 0,
      costPrice: numericCost,
      lastPurchaseCost:
        lastPurchaseCost !== undefined ? Math.max(0, toNumber(lastPurchaseCost)) : numericCost,
      sellingPrice: numericSelling,
      notes,
      ...normalizedDiscount,
      updatedBy: req.user?.id || null,
    });

    return res.status(201).json(item);
  } catch (error) {
    return next(error);
  }
};

export const updateInventoryItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid inventory item id" });
    }

    const item = await InventoryItem.findById(id);
    if (!item) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    const update = { ...req.body };
    if (update.itemName === undefined && update.name !== undefined) {
      update.itemName = update.name;
    }
    if (update.category !== undefined) {
      const categoryInput = String(update.category ?? "").trim();
      if (!categoryInput) {
        return res.status(400).json({ message: "Invalid inventory category" });
      }
      const resolvedCategory = await resolveCategoryName(categoryInput);
      if (!resolvedCategory) {
        const currentCategory = String(item.category ?? "");
        if (
          currentCategory &&
          currentCategory.toLowerCase() === categoryInput.toLowerCase()
        ) {
          update.category = item.category;
        } else {
          return res.status(400).json({ message: "Invalid inventory category" });
        }
      } else {
        update.category = resolvedCategory;
      }
    }
    const nextItemName =
      update.itemName !== undefined ? update.itemName : item.itemName;
    const nextCategory =
      update.category !== undefined ? update.category : item.category;
    const nextBrand = update.brand !== undefined ? update.brand : item.brand;
    const nextVariant =
      update.variant !== undefined ? update.variant : item.variant;

    if (update.sku !== undefined) {
      const nextSku = normalizeSku(update.sku);
      if (!nextSku) {
        const generatedSku = generateSku({
          category: nextCategory,
          brand: nextBrand,
          itemName: nextItemName,
          variant: nextVariant,
        });
        if (!generatedSku) {
          return res.status(400).json({ message: "SKU could not be generated" });
        }
        const existingSku = await InventoryItem.findOne({
          sku: generatedSku,
          _id: { $ne: item._id },
        });
        if (existingSku) {
          return res.status(409).json({ message: "SKU already exists" });
        }
        update.sku = generatedSku;
      } else {
        const existingSku = await InventoryItem.findOne({
          sku: nextSku,
          _id: { $ne: item._id },
        });
        if (existingSku) {
          return res.status(409).json({ message: "SKU already exists" });
        }
        update.sku = nextSku;
      }
    }
    if (update.quantity !== undefined) {
      update.quantity = toNumber(update.quantity);
    }
    if (update.minStock !== undefined) {
      update.minStock = toNumber(update.minStock);
    }
    if (update.costPrice !== undefined) {
      update.costPrice = toNumber(update.costPrice);
    }
    if (update.lastPurchaseCost !== undefined) {
      update.lastPurchaseCost = Math.max(0, toNumber(update.lastPurchaseCost));
    }
    if (update.sellingPrice !== undefined) {
      update.sellingPrice = toNumber(update.sellingPrice);
    }
    const nextCost =
      update.costPrice !== undefined ? update.costPrice : item.costPrice;
    const nextSelling =
      update.sellingPrice !== undefined
        ? update.sellingPrice
        : item.sellingPrice;
    if (nextSelling < nextCost) {
      return res
        .status(400)
        .json({ message: "Selling price must be >= cost price" });
    }
    if (hasDiscountInput(update)) {
      const mergedDiscountPayload = {
        discountEnabled: update.discountEnabled ?? item.discountEnabled,
        discountType: update.discountType ?? item.discountType,
        discountValue: update.discountValue ?? item.discountValue,
        discountStartAt: update.discountStartAt ?? item.discountStartAt,
        discountEndAt: update.discountEndAt ?? item.discountEndAt,
        minQtyForDiscount: update.minQtyForDiscount ?? item.minQtyForDiscount,
        maxDiscountCap: update.maxDiscountCap ?? item.maxDiscountCap,
        discountNote: update.discountNote ?? item.discountNote,
      };
      const normalizedDiscount = normalizeDiscountPayload(mergedDiscountPayload);
      if (normalizedDiscount.error) {
        return res.status(400).json({ message: normalizedDiscount.error });
      }
      Object.assign(update, normalizedDiscount);
    }

    Object.entries(update).forEach(([key, value]) => {
      if (value !== undefined) {
        item.set(key, value);
      }
    });
    item.updatedBy = req.user?.id || null;

    const saved = await item.save();

    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};

export const deleteInventoryItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid inventory item id" });
    }

    const item = await InventoryItem.findByIdAndDelete(id);
    if (!item) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    return res.json({ message: "Inventory item deleted" });
  } catch (error) {
    return next(error);
  }
};
