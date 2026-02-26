import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const PATH_PERMISSION_MAP = [
  { prefix: "/dashboard", permission: "viewDashboard" },
  { prefix: "/inventory", permission: "manageInventory" },
  { prefix: "/purchases", permission: "manageInventory" },
  { prefix: "/reports", permission: "viewReports" },
  { prefix: "/staff", permission: "manageEmployees" },
  { prefix: "/attendance", permission: "markAttendance" },
  { prefix: "/advances", permission: "runPayroll" },
  { prefix: "/worklogs", permission: "runPayroll" },
  { prefix: "/payroll", permission: "runPayroll" },
  { prefix: "/payslips", permission: "runPayroll" },
  { prefix: "/sales", permission: "manageSales" },
  { prefix: "/roles", permission: "manageRoles" },
  { prefix: "/leave", permission: "approveLeave" },
  { prefix: "/settings", permission: "manageSalaryConfig" },
];

function OwnerRoute() {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === "OWNER") {
    return <Outlet />;
  }

  const matched = PATH_PERMISSION_MAP.find((entry) =>
    location.pathname.startsWith(entry.prefix)
  );
  if (!matched) return <Navigate to="/unauthorized" replace />;
  const hasPermission = Boolean(user?.permissions?.[matched.permission]);
  if (!hasPermission) return <Navigate to="/unauthorized" replace />;

  return <Outlet />;
}

export default OwnerRoute;
