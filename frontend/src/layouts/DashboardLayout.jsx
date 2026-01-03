import { useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../services/api.js";
import { readJson, writeJson } from "../utils/cache.js";
import Sidebar from "./Sidebar.jsx";
import "./DashboardLayout.css";

function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const isOwner = user?.role === "OWNER";

  useEffect(() => {
    const refreshCache = async (key, endpoint) => {
      try {
        const { data } = await api.get(endpoint);
        writeJson(key, Array.isArray(data) ? data : []);
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          return;
        }
      }
    };

    const hydrateCache = () => {
      const cachedKeys = [
        "ksc_customers",
        "ksc_vehicles",
        "ksc_job_cards",
        "ksc_invoices",
        "ksc_inventory",
        "ksc_staff",
        "ksc_services",
        "ksc_inventory_categories",
      ];
      cachedKeys.forEach((key) => {
        const cached = readJson(key, []);
        if (!Array.isArray(cached)) {
          writeJson(key, []);
        }
      });

      refreshCache("ksc_customers", "/customers");
      refreshCache("ksc_vehicles", "/vehicles");
      refreshCache("ksc_job_cards", "/job-cards");
      refreshCache("ksc_invoices", "/invoices");
      refreshCache("ksc_inventory", "/inventory");
      refreshCache("ksc_staff", "/staff");
      refreshCache("ksc_services", "/services");
      refreshCache("ksc_inventory_categories", "/inventory-categories");
    };

    hydrateCache();
  }, []);

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="app-shell">
      <Sidebar isOwner={isOwner} />
      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar__title">
            <p className="topbar__eyebrow">Vehicle Service Center</p>
            <h1>Operations</h1>
          </div>
          <div className="topbar__actions">
            <span className="topbar__user">{user?.email ?? "User"}</span>
            <button className="topbar__logout" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}

export default DashboardLayout;
