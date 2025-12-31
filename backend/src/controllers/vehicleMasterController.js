import mongoose from "mongoose";
import Vehicle from "../models/Vehicle.js";
import VehicleBrand from "../models/VehicleBrand.js";
import VehicleModel from "../models/VehicleModel.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizeName = (value) => String(value || "").trim();

export const listVehicleBrands = async (req, res, next) => {
  try {
    const activeOnly = String(req.query.active || "").toLowerCase() === "true";
    const filter = activeOnly ? { active: true } : {};
    const brands = await VehicleBrand.find(filter).sort({ name: 1 });
    return res.json(brands);
  } catch (error) {
    return next(error);
  }
};

export const createVehicleBrand = async (req, res, next) => {
  try {
    const name = normalizeName(req.body.name);
    if (!name) {
      return res.status(400).json({ message: "Brand name is required" });
    }
    const brand = await VehicleBrand.create({
      name,
      active: req.body.active !== undefined ? Boolean(req.body.active) : true,
    });
    return res.status(201).json(brand);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Brand already exists" });
    }
    return next(error);
  }
};

export const updateVehicleBrand = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid brand id" });
    }
    const updates = {};
    if (req.body.name !== undefined) {
      const name = normalizeName(req.body.name);
      if (!name) {
        return res.status(400).json({ message: "Brand name is required" });
      }
      updates.name = name;
    }
    if (req.body.active !== undefined) {
      updates.active = Boolean(req.body.active);
    }
    const brand = await VehicleBrand.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!brand) {
      return res.status(404).json({ message: "Brand not found" });
    }
    return res.json(brand);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Brand already exists" });
    }
    return next(error);
  }
};

export const deleteVehicleBrand = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid brand id" });
    }
    const [vehiclesCount, modelsCount] = await Promise.all([
      Vehicle.countDocuments({ brandId: id }),
      VehicleModel.countDocuments({ brandId: id }),
    ]);
    if (vehiclesCount > 0 || modelsCount > 0) {
      return res.status(400).json({
        message: "Brand is in use and cannot be deleted",
      });
    }
    const brand = await VehicleBrand.findByIdAndDelete(id);
    if (!brand) {
      return res.status(404).json({ message: "Brand not found" });
    }
    return res.json({ message: "Brand deleted" });
  } catch (error) {
    return next(error);
  }
};

export const listVehicleModels = async (req, res, next) => {
  try {
    const activeOnly = String(req.query.active || "").toLowerCase() === "true";
    const filter = activeOnly ? { active: true } : {};
    if (req.query.brandId) {
      if (!isValidId(req.query.brandId)) {
        return res.status(400).json({ message: "Invalid brand id" });
      }
      filter.brandId = req.query.brandId;
    }
    const models = await VehicleModel.find(filter).sort({ name: 1 });
    return res.json(models);
  } catch (error) {
    return next(error);
  }
};

export const createVehicleModel = async (req, res, next) => {
  try {
    const name = normalizeName(req.body.name);
    const { brandId } = req.body;
    if (!name || !brandId) {
      return res.status(400).json({
        message: "Model name and brand are required",
      });
    }
    if (!isValidId(brandId)) {
      return res.status(400).json({ message: "Invalid brand id" });
    }
    const brand = await VehicleBrand.findById(brandId);
    if (!brand) {
      return res.status(404).json({ message: "Brand not found" });
    }
    const model = await VehicleModel.create({
      brandId,
      name,
      active: req.body.active !== undefined ? Boolean(req.body.active) : true,
    });
    return res.status(201).json(model);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Model already exists" });
    }
    return next(error);
  }
};

export const updateVehicleModel = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid model id" });
    }
    const updates = {};
    if (req.body.name !== undefined) {
      const name = normalizeName(req.body.name);
      if (!name) {
        return res.status(400).json({ message: "Model name is required" });
      }
      updates.name = name;
    }
    if (req.body.active !== undefined) {
      updates.active = Boolean(req.body.active);
    }
    if (req.body.brandId !== undefined) {
      if (!isValidId(req.body.brandId)) {
        return res.status(400).json({ message: "Invalid brand id" });
      }
      const brand = await VehicleBrand.findById(req.body.brandId);
      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }
      updates.brandId = req.body.brandId;
    }
    const model = await VehicleModel.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!model) {
      return res.status(404).json({ message: "Model not found" });
    }
    return res.json(model);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Model already exists" });
    }
    return next(error);
  }
};

export const deleteVehicleModel = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid model id" });
    }
    const vehiclesCount = await Vehicle.countDocuments({ modelId: id });
    if (vehiclesCount > 0) {
      return res.status(400).json({
        message: "Model is in use and cannot be deleted",
      });
    }
    const model = await VehicleModel.findByIdAndDelete(id);
    if (!model) {
      return res.status(404).json({ message: "Model not found" });
    }
    return res.json({ message: "Model deleted" });
  } catch (error) {
    return next(error);
  }
};
