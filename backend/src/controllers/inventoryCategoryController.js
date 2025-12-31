import mongoose from "mongoose";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizeName = (name = "") => name.trim();

const findByName = async (name, ignoreId = null) => {
  const query = {
    name: new RegExp(`^${name}$`, "i"),
    ...(ignoreId ? { _id: { $ne: ignoreId } } : {}),
  };
  return InventoryCategory.findOne(query);
};

export const listInventoryCategories = async (req, res, next) => {
  try {
    const categories = await InventoryCategory.find().sort({ createdAt: -1 });
    return res.json(categories);
  } catch (error) {
    return next(error);
  }
};

export const createInventoryCategory = async (req, res, next) => {
  try {
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const existing = await findByName(name);
    if (existing) {
      return res.status(409).json({ message: "Category name already exists" });
    }

    const category = await InventoryCategory.create({
      name,
      active: req.body?.active !== undefined ? Boolean(req.body.active) : true,
    });

    return res.status(201).json(category);
  } catch (error) {
    return next(error);
  }
};

export const updateInventoryCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const category = await InventoryCategory.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const existing = await findByName(name, id);
    if (existing) {
      return res.status(409).json({ message: "Category name already exists" });
    }

    const previousName = category.name;
    category.name = name;
    if (req.body?.active !== undefined) {
      category.active = Boolean(req.body.active);
    }

    const updated = await category.save();
    if (previousName !== name) {
      await InventoryItem.updateMany(
        { category: previousName },
        { $set: { category: name } }
      );
    }

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
};

export const deleteInventoryCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const category = await InventoryCategory.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const inUse = await InventoryItem.findOne({ category: category.name });
    if (inUse) {
      return res.status(400).json({
        message: "Category is used in inventory items and cannot be deleted",
      });
    }

    await InventoryCategory.findByIdAndDelete(id);
    return res.json({ message: "Category deleted" });
  } catch (error) {
    return next(error);
  }
};
