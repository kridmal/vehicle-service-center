import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import OwnerRoute from "./routes/OwnerRoute.jsx";
import Billing from "./pages/Billing.jsx";
import Customers from "./pages/Customers.jsx";
import DashboardPage from "./pages/dashboard/DashboardPage.jsx";
import JobCards from "./pages/JobCards.jsx";
import JobCardNew from "./pages/JobCardNew.jsx";
import Login from "./pages/Login.jsx";
import ReportsPage from "./pages/reports/ReportsPage.jsx";
import Services from "./pages/Services.jsx";
import Unauthorized from "./pages/Unauthorized.jsx";
import Vehicles from "./pages/Vehicles.jsx";
import VehicleProfile from "./pages/VehicleProfile.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import InvoiceList from "./pages/invoices/InvoiceList.jsx";
import InvoiceView from "./pages/invoices/InvoiceView.jsx";
import JobCardBilling from "./pages/invoices/JobCardBilling.jsx";
import InventoryPage from "./pages/inventory/InventoryPage.jsx";
import Staff from "./pages/Staff.jsx";
import Attendance from "./pages/Attendance.jsx";
import Payroll from "./pages/Payroll.jsx";
import Payslips from "./pages/Payslips.jsx";
import VehicleConfiguration from "./pages/vehicles/VehicleConfiguration.jsx";

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route element={<OwnerRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/payslips" element={<Payslips />} />
            <Route
              path="/vehicles/configuration"
              element={<VehicleConfiguration />}
            />
          </Route>
          <Route path="/workers" element={<Navigate to="/staff" replace />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/vehicles/:id" element={<VehicleProfile />} />
          <Route path="/services" element={<Services />} />
          <Route path="/job-cards" element={<JobCards />} />
          <Route path="/job-cards/new" element={<JobCardNew />} />
          <Route path="/job-cards/:id/billing" element={<JobCardBilling />} />
          <Route path="/invoices" element={<InvoiceList />} />
          <Route path="/invoices/:id" element={<InvoiceView />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
