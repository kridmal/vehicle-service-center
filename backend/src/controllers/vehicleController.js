import mongoose from "mongoose";
import Vehicle from "../models/Vehicle.js";
import VehicleBrand from "../models/VehicleBrand.js";
import VehicleModel from "../models/VehicleModel.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

export const listVehicles = async (req, res, next) => {
  try {
    const { customerId } = req.query;
    const filter = customerId ? { customerId } : {};
    const vehicles = await Vehicle.find(filter).sort({ createdAt: -1 });
    return res.json(vehicles);
  } catch (error) {
    return next(error);
  }
};

export const createVehicle = async (req, res, next) => {
  try {
    const { customerId, vehicleNumber, brandId, modelId } = req.body;
    if (!customerId || !vehicleNumber || !brandId || !modelId) {
      return res.status(400).json({
        message: "Customer, vehicle number, brand, and model are required",
      });
    }
    if (!isValidId(brandId) || !isValidId(modelId)) {
      return res.status(400).json({ message: "Invalid brand or model id" });
    }

    const [brand, model] = await Promise.all([
      VehicleBrand.findById(brandId),
      VehicleModel.findById(modelId),
    ]);
    if (!brand || !brand.active) {
      return res.status(400).json({ message: "Brand is inactive or missing" });
    }
    if (!model || !model.active) {
      return res.status(400).json({ message: "Model is inactive or missing" });
    }
    if (String(model.brandId) !== String(brand._id)) {
      return res
        .status(400)
        .json({ message: "Model does not belong to selected brand" });
    }

    const vehicle = await Vehicle.create({
      customerId,
      currentOwnerId: customerId,
      vehicleNumber,
      brandId: brand._id,
      brandName: brand.name,
      modelId: model._id,
      modelName: model.name,
    });
    return res.status(201).json(vehicle);
  } catch (error) {
    return next(error);
  }
};

export const updateVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid vehicle id" });
    }

    const updatePayload = { ...req.body };
    if (updatePayload.currentOwnerId && !updatePayload.customerId) {
      updatePayload.customerId = updatePayload.currentOwnerId;
    }
    if (updatePayload.customerId && !updatePayload.currentOwnerId) {
      updatePayload.currentOwnerId = updatePayload.customerId;
    }

    if (updatePayload.brandId || updatePayload.modelId) {
      const brandId = updatePayload.brandId;
      const modelId = updatePayload.modelId;
      if (!brandId || !modelId) {
        return res.status(400).json({
          message: "Brand and model are required together",
        });
      }
      if (!isValidId(brandId) || !isValidId(modelId)) {
        return res.status(400).json({ message: "Invalid brand or model id" });
      }
      const [brand, model] = await Promise.all([
        VehicleBrand.findById(brandId),
        VehicleModel.findById(modelId),
      ]);
      if (!brand || !brand.active) {
        return res
          .status(400)
          .json({ message: "Brand is inactive or missing" });
      }
      if (!model || !model.active) {
        return res
          .status(400)
          .json({ message: "Model is inactive or missing" });
      }
      if (String(model.brandId) !== String(brand._id)) {
        return res.status(400).json({
          message: "Model does not belong to selected brand",
        });
      }
      updatePayload.brandId = brand._id;
      updatePayload.brandName = brand.name;
      updatePayload.modelId = model._id;
      updatePayload.modelName = model.name;
    }

    const vehicle = await Vehicle.findByIdAndUpdate(id, updatePayload, {
      new: true,
      runValidators: true,
    });
    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    return res.json(vehicle);
  } catch (error) {
    return next(error);
  }
};

export const deleteVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid vehicle id" });
    }

    const vehicle = await Vehicle.findByIdAndDelete(id);
    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    return res.json({ message: "Vehicle deleted" });
  } catch (error) {
    return next(error);
  }
};
