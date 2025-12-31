import { Outlet } from "react-router-dom";
import DashboardLayout from "./DashboardLayout.jsx";

function AppLayout() {
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}

export default AppLayout;
