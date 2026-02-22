const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundCurrency = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export const toNonNegativeNumber = (value) => Math.max(0, toNumber(value));

const normalizeTaskTitle = (task) =>
  String(task?.taskName || task?.title || "").trim();

export const normalizeTaskSnapshot = (task, defaultCompleted = false) => {
  if (typeof task === "string") {
    const title = task.trim();
    if (!title) return null;
    return {
      taskId: null,
      taskName: title,
      title,
      isRequired: false,
      completed: defaultCompleted,
      laborHours: 0,
      laborCharge: 0,
      isBillable: true,
    };
  }

  if (!task || typeof task !== "object") return null;

  const title = normalizeTaskTitle(task);
  if (!title) return null;

  const taskId = task.taskId || task._id || task.id || null;

  return {
    taskId: taskId ? String(taskId) : null,
    taskName: title,
    title,
    isRequired: Boolean(task.isRequired),
    completed:
      task.completed !== undefined ? Boolean(task.completed) : defaultCompleted,
    laborHours: roundCurrency(toNonNegativeNumber(task.laborHours)),
    laborCharge: roundCurrency(toNonNegativeNumber(task.laborCharge)),
    isBillable: task.isBillable !== undefined ? Boolean(task.isBillable) : true,
  };
};

export const normalizeServiceSnapshot = (service, defaultCompleted = false) => {
  if (!service) return null;
  if (typeof service === "string") {
    const serviceType = service.trim();
    if (!serviceType) return null;
    return { serviceType, tasks: [] };
  }
  if (typeof service !== "object") return null;

  const serviceType = String(
    service.serviceType || service._id || service.id || ""
  ).trim();
  if (!serviceType) return null;

  const tasks = Array.isArray(service.tasks)
    ? service.tasks
        .map((task) => normalizeTaskSnapshot(task, defaultCompleted))
        .filter(Boolean)
    : [];

  return {
    serviceType,
    serviceName: service.serviceName || service.name || "",
    tasks,
  };
};

export const normalizeServicesSnapshot = (services = [], defaultCompleted = false) =>
  (Array.isArray(services) ? services : [])
    .map((service) => normalizeServiceSnapshot(service, defaultCompleted))
    .filter(Boolean);

export const flattenServiceTasks = (services = []) =>
  (Array.isArray(services) ? services : []).flatMap((service) =>
    Array.isArray(service?.tasks) ? service.tasks.filter(Boolean) : []
  );

export const hasTaskLaborMetadata = (services = []) =>
  flattenServiceTasks(services).some(
    (task) =>
      task &&
      (task.taskId !== undefined ||
        task.taskName !== undefined ||
        task.laborHours !== undefined ||
        task.laborCharge !== undefined ||
        task.isBillable !== undefined)
  );

export const hasPositiveTaskLaborCharge = (services = []) =>
  flattenServiceTasks(services).some(
    (task) => toNonNegativeNumber(task?.laborCharge) > 0
  );

export const computeLaborSubtotalFromTasks = (tasks = []) =>
  roundCurrency(
    (Array.isArray(tasks) ? tasks : []).reduce((sum, task) => {
      if (!task || task.isBillable === false) return sum;
      return sum + toNonNegativeNumber(task.laborCharge);
    }, 0)
  );

export const computeLaborSubtotalFromServices = (services = []) =>
  computeLaborSubtotalFromTasks(flattenServiceTasks(services));
