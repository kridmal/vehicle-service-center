import mongoose from "mongoose";
import JobCard from "../models/JobCard.js";
import ServiceType from "../models/ServiceType.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const normalizeTasks = (tasks = []) =>
  tasks
    .map((task) => ({
      title: task.title?.trim(),
      isRequired: Boolean(task.isRequired),
    }))
    .filter((task) => task.title);

const ensureUniqueName = async (name, ignoreId = null) => {
  const existing = await ServiceType.findOne({
    name: new RegExp(`^${name}$`, "i"),
    ...(ignoreId ? { _id: { $ne: ignoreId } } : {}),
  });
  return !existing;
};

export const listServiceTypes = async (req, res, next) => {
  try {
    const services = await ServiceType.find().sort({ createdAt: -1 });
    return res.json(services);
  } catch (error) {
    return next(error);
  }
};

export const createServiceType = async (req, res, next) => {
  try {
    const { name, tasks, active } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Service name is required" });
    }
    const normalizedTasks = normalizeTasks(tasks);
    if (tasks && normalizedTasks.length !== tasks.length) {
      return res.status(400).json({ message: "Task title is required" });
    }

    const isUnique = await ensureUniqueName(name.trim());
    if (!isUnique) {
      return res.status(409).json({ message: "Service name already exists" });
    }

    const service = await ServiceType.create({
      name: name.trim(),
      tasks: normalizedTasks,
      active: active !== undefined ? Boolean(active) : true,
    });

    return res.status(201).json(service);
  } catch (error) {
    return next(error);
  }
};

export const updateServiceType = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid service id" });
    }

    const { name, tasks, active } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Service name is required" });
    }
    const normalizedTasks = normalizeTasks(tasks);
    if (tasks && normalizedTasks.length !== tasks.length) {
      return res.status(400).json({ message: "Task title is required" });
    }

    const isUnique = await ensureUniqueName(name.trim(), id);
    if (!isUnique) {
      return res.status(409).json({ message: "Service name already exists" });
    }

    const service = await ServiceType.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        tasks: normalizedTasks,
        active: active !== undefined ? Boolean(active) : true,
      },
      { new: true, runValidators: true }
    );

    if (!service) {
      return res.status(404).json({ message: "Service type not found" });
    }

    return res.json(service);
  } catch (error) {
    return next(error);
  }
};

export const deleteServiceType = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid service id" });
    }

    const inUse = await JobCard.findOne({
      $or: [{ services: id }, { "services.serviceType": id }],
    });
    if (inUse) {
      return res.status(400).json({
        message: "Service type is used in job cards and cannot be deleted",
      });
    }

    const service = await ServiceType.findByIdAndDelete(id);
    if (!service) {
      return res.status(404).json({ message: "Service type not found" });
    }

    return res.json({ message: "Service type deleted" });
  } catch (error) {
    return next(error);
  }
};
