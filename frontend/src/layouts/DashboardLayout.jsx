import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Sidebar from "./Sidebar.jsx";
import "./DashboardLayout.css";

function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isOwner = user?.role === "OWNER";

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      <Sidebar isOwner={isOwner} permissions={user?.permissions || {}} />
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
