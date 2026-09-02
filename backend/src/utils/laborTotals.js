const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundCurrency = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export const toNonNegativeNumber = (value) => Math.max(0, toNumber(value));

export const isTaskSelected = (task) => {
  if (!task || typeof task !== "object") return false;
  if (task.selected !== undefined) return Boolean(task.selected);
  if (task.completed !== undefined) return Boolean(task.completed);
  return false;
};

export const isTaskBillable = (task) => {
  if (!task || typeof task !== "object") return true;
  if (task.billable !== undefined) return Boolean(task.billable);
  if (task.isBillable !== undefined) return Boolean(task.isBillable);
  return true;
};

const toTaskObject = (task) => {
  if (!task) return null;
  if (typeof task === "string") {
    const taskName = task.trim();
    if (!taskName) return null;
    return { taskName };
  }
  if (typeof task !== "object") return null;
  return task;
};

export const flattenServiceTasks = (services = []) => {
  if (!Array.isArray(services)) return [];
  return services.flatMap((service) => {
    if (!service || typeof service !== "object") return [];
    if (!Array.isArray(service.tasks)) return [];
    return service.tasks
      .map((task) => toTaskObject(task))
      .filter(Boolean);
  });
};

export const hasTaskLaborMetadata = (services = []) =>
  flattenServiceTasks(services).some((task) => {
    if (!task || typeof task !== "object") return false;
    return (
      task.taskId !== undefined ||
      task.taskName !== undefined ||
      task.selected !== undefined ||
      task.laborHours !== undefined ||
      task.laborCharge !== undefined ||
      task.billable !== undefined ||
      task.isBillable !== undefined
    );
  });

export const hasPositiveTaskLaborCharge = (services = []) =>
  flattenServiceTasks(services).some(
    (task) => toNonNegativeNumber(task?.laborCharge) > 0
  );

export const computeLaborTotals = (jobCardTasks = []) => {
  const tasks = Array.isArray(jobCardTasks) ? jobCardTasks : [];

  const laborSubtotalOriginal = tasks.reduce((sum, task) => {
    if (!task || typeof task !== "object") return sum;
    if (!isTaskSelected(task)) return sum;
    if (!isTaskBillable(task)) return sum;
    return roundCurrency(sum + toNonNegativeNumber(task.laborCharge));
  }, 0);

  return {
    laborSubtotalOriginal: roundCurrency(laborSubtotalOriginal),
  };
};
