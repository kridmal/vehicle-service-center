const toPlainObject = (value) => {
  if (!value) return {};
  if (typeof value.toObject === "function") {
    return value.toObject();
  }
  return { ...value };
};

const SALES_ROLE_ALLOW_LIST = new Set(["admin", "reception"]);

export const mergePermissions = (...permissionSets) =>
  permissionSets.reduce(
    (acc, current) => ({
      ...acc,
      ...toPlainObject(current),
    }),
    {}
  );

export const canAccessSales = ({
  role,
  roleName,
  roleCategory,
  permissions = {},
}) => {
  if (role === "OWNER") return true;

  const normalizedRoleName = String(roleName || "")
    .trim()
    .toLowerCase();
  if (SALES_ROLE_ALLOW_LIST.has(normalizedRoleName)) {
    return true;
  }

  if (permissions.manageSales || permissions.manageInvoices) {
    return true;
  }

  const normalizedCategory = String(roleCategory || "")
    .trim()
    .toLowerCase();
  if (normalizedCategory === "office" && permissions.manageJobCards) {
    return true;
  }

  return false;
};
