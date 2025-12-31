import { NavLink } from "react-router-dom";

function Sidebar({ isOwner }) {
  return (
    <aside className="app-sidebar">
      <div className="sidebar__brand">
        <div className="brand-mark">VSC</div>
        <div>
          <p className="brand-title">Service Center</p>
          <p className="brand-subtitle">Management</p>
        </div>
      </div>
      <nav className="sidebar__nav">
        {isOwner ? (
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `sidebar-link${isActive ? " active" : ""}`
            }
          >
            Dashboard
          </NavLink>
        ) : null}
        <NavLink
          to="/job-cards/new"
          className={({ isActive }) =>
            `sidebar-link${isActive ? " active" : ""}`
          }
        >
          New Job Card
        </NavLink>
        <NavLink
          to="/job-cards"
          className={({ isActive }) =>
            `sidebar-link${isActive ? " active" : ""}`
          }
        >
          Job Cards
        </NavLink>
        <NavLink
          to="/customers"
          className={({ isActive }) =>
            `sidebar-link${isActive ? " active" : ""}`
          }
        >
          Customers
        </NavLink>
        <NavLink
          to="/vehicles"
          className={({ isActive }) =>
            `sidebar-link${isActive ? " active" : ""}`
          }
        >
          Vehicles
        </NavLink>
        <NavLink
          to="/services"
          className={({ isActive }) =>
            `sidebar-link${isActive ? " active" : ""}`
          }
        >
          Services
        </NavLink>
        <NavLink
          to="/invoices"
          className={({ isActive }) =>
            `sidebar-link${isActive ? " active" : ""}`
          }
        >
          Invoices
        </NavLink>
        {isOwner ? (
          <NavLink
            to="/inventory"
            className={({ isActive }) =>
              `sidebar-link${isActive ? " active" : ""}`
            }
          >
            Inventory
          </NavLink>
        ) : null}
        {isOwner ? (
          <NavLink
            to="/staff"
            className={({ isActive }) =>
              `sidebar-link${isActive ? " active" : ""}`
            }
          >
            Staff
          </NavLink>
        ) : null}
        {isOwner ? (
          <NavLink
            to="/attendance"
            className={({ isActive }) =>
              `sidebar-link${isActive ? " active" : ""}`
            }
          >
            Attendance
          </NavLink>
        ) : null}
        {isOwner ? (
          <NavLink
            to="/payroll"
            className={({ isActive }) =>
              `sidebar-link${isActive ? " active" : ""}`
            }
          >
            Payroll
          </NavLink>
        ) : null}
        {isOwner ? (
          <NavLink
            to="/payslips"
            className={({ isActive }) =>
              `sidebar-link${isActive ? " active" : ""}`
            }
          >
            Payslips
          </NavLink>
        ) : null}
        {isOwner ? (
          <NavLink
            to="/reports"
            className={({ isActive }) =>
              `sidebar-link${isActive ? " active" : ""}`
            }
          >
            Reports
          </NavLink>
        ) : null}
      </nav>
    </aside>
  );
}

export default Sidebar;

