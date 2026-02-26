const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundCurrency = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export const toNonNegativeNumber = (value) => Math.max(0, toNumber(value));

const normalizeTaskTitle = (task) =>
  String(task?.taskName || task?.title || "").trim();

const normalizeKeyPart = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

const resolveTaskSelected = (task, defaultCompleted = false) => {
  if (!task || typeof task !== "object") return Boolean(defaultCompleted);
  if (task.selected !== undefined) return Boolean(task.selected);
  if (task.completed !== undefined) return Boolean(task.completed);
  return Boolean(defaultCompleted);
};

const resolveTaskBillable = (task) => {
  if (!task || typeof task !== "object") return true;
  if (task.billable !== undefined) return Boolean(task.billable);
  if (task.isBillable !== undefined) return Boolean(task.isBillable);
  return true;
};

const resolveTaskServiceType = (task) =>
  String(task?.serviceTypeId || task?.serviceType || "").trim();

export const getTaskInstanceId = (serviceType, task, index = 0) => {
  const explicitId = String(task?.taskInstanceId || task?.id || "").trim();
  if (explicitId) return explicitId;

  const normalizedServiceType = normalizeKeyPart(serviceType || "service");
  const baseTaskId =
    String(task?.taskId || task?._id || "").trim() ||
    normalizeKeyPart(normalizeTaskTitle(task) || "task");

  return `${normalizedServiceType}:${normalizeKeyPart(baseTaskId)}:${index}`;
};

export const normalizeTaskSnapshot = (
  task,
  defaultCompleted = false,
  context = {}
) => {
  const serviceType = String(context.serviceType || "").trim();
  const taskIndex = Number.isFinite(Number(context.taskIndex))
    ? Number(context.taskIndex)
    : 0;

  if (typeof task === "string") {
    const title = task.trim();
    if (!title) return null;
    return {
      taskInstanceId: getTaskInstanceId(serviceType, { title }, taskIndex),
      serviceTypeId: serviceType || "",
      taskId: null,
      taskName: title,
      title,
      isRequired: false,
      selected: resolveTaskSelected(null, defaultCompleted),
      completed: resolveTaskSelected(null, defaultCompleted),
      laborHours: 0,
      laborCharge: 0,
      isBillable: true,
      assignedStaffId: null,
      assignedStaffSnapshot: { employeeNo: "", name: "" },
    };
  }

  if (!task || typeof task !== "object") return null;

  const title = normalizeTaskTitle(task);
  if (!title) return null;

  const taskId = task.taskId || task._id || task.id || null;
  const taskInstanceId = getTaskInstanceId(serviceType, task, taskIndex);

  return {
    taskInstanceId,
    serviceTypeId: serviceType || resolveTaskServiceType(task),
    taskId: taskId ? String(taskId) : null,
    taskName: title,
    title,
    isRequired: Boolean(task.isRequired),
    selected: resolveTaskSelected(task, defaultCompleted),
    completed: resolveTaskSelected(task, defaultCompleted),
    laborHours: roundCurrency(toNonNegativeNumber(task.laborHours)),
    laborCharge: roundCurrency(toNonNegativeNumber(task.laborCharge)),
    isBillable: resolveTaskBillable(task),
    assignedStaffId: task.assignedStaffId || null,
    assignedStaffSnapshot: {
      employeeNo: String(task?.assignedStaffSnapshot?.employeeNo || "").trim(),
      name: String(task?.assignedStaffSnapshot?.name || "").trim(),
    },
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
        .map((task, taskIndex) =>
          normalizeTaskSnapshot(task, defaultCompleted, {
            serviceType,
            taskIndex,
          })
        )
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
  (Array.isArray(services) ? services : []).flatMap((service) => {
    const serviceTypeId = String(service?.serviceType || "").trim();
    const tasks = Array.isArray(service?.tasks) ? service.tasks : [];

    return tasks
      .map((task, index) => {
        if (!task) return null;

        const taskInstanceId = getTaskInstanceId(serviceTypeId, task, index);
        return {
          ...task,
          serviceTypeId,
          taskInstanceId,
        };
      })
      .filter(Boolean);
  });

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

export const computeLaborSubtotalFromTasks = (tasks = []) => {
  const seenTaskKeys = new Set();

  return roundCurrency(
    (Array.isArray(tasks) ? tasks : []).reduce((sum, task, index) => {
      if (!task) return sum;

      const serviceType =
        resolveTaskServiceType(task) || String(task?.serviceType || "").trim();
      const dedupeKey =
        String(task.taskInstanceId || "").trim() ||
        getTaskInstanceId(serviceType, task, index);

      if (seenTaskKeys.has(dedupeKey)) return sum;
      seenTaskKeys.add(dedupeKey);

      if (!resolveTaskSelected(task, false)) return sum;
      if (!resolveTaskBillable(task)) return sum;

      return sum + toNonNegativeNumber(task.laborCharge);
    }, 0)
  );
};

export const computeLaborSubtotalFromServices = (services = []) =>
  computeLaborSubtotalFromTasks(flattenServiceTasks(services));
