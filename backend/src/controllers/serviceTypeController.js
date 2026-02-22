import mongoose from "mongoose";
import JobCard from "../models/JobCard.js";
import ServiceType from "../models/ServiceType.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const parseNonNegativeCurrency = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") {
    return { value: roundCurrency(Math.max(0, fallback)), valid: true };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: roundCurrency(Math.max(0, fallback)), valid: false };
  }
  return { value: roundCurrency(parsed), valid: true };
};

const normalizeTasks = (tasks = []) =>
  tasks
    .map((task) => {
      const taskTitle =
        typeof task === "string"
          ? task.trim()
          : String(task?.title || "").trim();
      if (!taskTitle) return null;

      const laborHoursParsed = parseNonNegativeCurrency(
        task?.laborHoursDefault,
        0
      );
      const laborChargeParsed = parseNonNegativeCurrency(
        task?.laborChargeDefault,
        0
      );
      if (!laborHoursParsed.valid || !laborChargeParsed.valid) {
        return null;
      }

      const normalized = {
        title: taskTitle,
        isRequired: Boolean(task?.isRequired),
        laborHoursDefault: laborHoursParsed.value,
        laborChargeDefault: laborChargeParsed.value,
        isBillable: task?.isBillable !== undefined ? Boolean(task.isBillable) : true,
      };

      const incomingTaskId = task?._id || task?.id;
      if (incomingTaskId) {
        normalized._id = incomingTaskId;
      }

      return normalized;
    })
    .filter((task) => task && task.title);

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
