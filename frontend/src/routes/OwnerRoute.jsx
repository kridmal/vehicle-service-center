import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function OwnerRoute() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== "OWNER") {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}

export default OwnerRoute;
