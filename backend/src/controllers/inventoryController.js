import mongoose from "mongoose";
import InventoryItem from "../models/InventoryItem.js";
import InventoryCategory from "../models/InventoryCategory.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
      sellingPrice: numericSelling,
      notes,
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

    Object.entries(update).forEach(([key, value]) => {
      if (value !== undefined) {
        item.set(key, value);
      }
    });

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
