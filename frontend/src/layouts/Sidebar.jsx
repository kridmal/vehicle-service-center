import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

const SIDEBAR_OPEN_STATE_KEY = "ksc_sidebar_open_sections_v1";
const DEFAULT_OPEN_SECTIONS = {
  operations: true,
  inventory_purchases: false,
  employee_mgmt: false,
  employee_hr: false,
  employee_finance: false,
  administration: false,
};

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 2-1.5L22 7H7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="19" r="1.6" fill="currentColor" />
      <circle cx="18" cy="19" r="1.6" fill="currentColor" />
    </svg>
  );
}

function ChevronIcon({ open = false }) {
  return (
    <svg
      className={`sidebar-section__chevron${open ? " is-open" : ""}`}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 5l6 5-6 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const readOpenStateFromStorage = () => {
  try {
    const raw = localStorage.getItem(SIDEBAR_OPEN_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const isRouteActive = (pathname, to) =>
  pathname === to || pathname.startsWith(`${to}/`);

const filterVisibleItems = (items = []) =>
  items.reduce((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    if (item.type === "link") {
      if (item.visible === false) return acc;
      acc.push(item);
      return acc;
    }
    if (item.type === "section") {
      if (item.visible === false) return acc;
      const children = filterVisibleItems(item.children || []);
      if (!children.length) return acc;
      acc.push({ ...item, children });
      return acc;
    }
    return acc;
  }, []);

const collectActiveSectionKeys = (items = [], pathname, activeKeys) => {
  let anyActive = false;
  for (const item of items) {
    if (item.type === "link") {
      if (isRouteActive(pathname, item.to)) anyActive = true;
      continue;
    }
    if (item.type === "section") {
      const childActive = collectActiveSectionKeys(
        item.children || [],
        pathname,
        activeKeys
      );
      if (childActive) {
        activeKeys.add(item.key);
        anyActive = true;
      }
    }
  }
  return anyActive;
};

const buildSidebarSections = ({ can, isOwner }) => [
  {
    type: "link",
    key: "dashboard",
    label: "Dashboard",
    to: "/dashboard",
    visible: can("viewDashboard"),
  },
  {
    type: "section",
    key: "operations",
    label: "Operations",
    children: [
      { type: "link", key: "job_cards", label: "Job Cards", to: "/job-cards" },
      { type: "link", key: "invoices", label: "Invoices", to: "/invoices" },
      {
        type: "link",
        key: "sales",
        label: "Sales / POS",
        to: "/sales",
        icon: <CartIcon />,
        visible: can("manageSales"),
      },
      { type: "link", key: "customers", label: "Customers", to: "/customers" },
      { type: "link", key: "vehicles", label: "Vehicles", to: "/vehicles" },
      { type: "link", key: "services", label: "Services", to: "/services" },
      {
        type: "link",
        key: "loyalty",
        label: "Loyalty Program",
        to: "/loyalty",
        visible: isOwner,
      },
    ],
  },
  {
    type: "section",
    key: "inventory_purchases",
    label: "Inventory & Purchases",
    children: [
      {
        type: "link",
        key: "inventory",
        label: "Inventory",
        to: "/inventory",
        visible: can("manageInventory"),
      },
      {
        type: "link",
        key: "purchases",
        label: "Purchases",
        to: "/purchases",
        visible: can("manageInventory"),
      },
      {
        type: "link",
        key: "purchase_requests",
        label: "Purchase Requests",
        to: "/purchase-requests",
        visible: can("manageInventory"),
      },
      {
        type: "link",
        key: "dealer_balances",
        label: "Dealer Balances",
        to: "/dealer-balances",
        visible: can("manageInventory"),
      },
    ],
  },
  {
    type: "section",
    key: "employee_mgmt",
    label: "Employee Management",
    children: [
      {
        type: "section",
        key: "employee_hr",
        label: "HR",
        children: [
          {
            type: "link",
            key: "staff",
            label: "Staff",
            to: "/staff",
            visible: can("manageEmployees"),
          },
          {
            type: "link",
            key: "attendance",
            label: "Attendance",
            to: "/attendance",
            visible: can("markAttendance"),
          },
          {
            type: "link",
            key: "leave",
            label: "Leave",
            to: "/leave",
            visible: can("approveLeave"),
          },
          {
            type: "link",
            key: "worklogs",
            label: "Work Logs",
            to: "/worklogs",
            visible: can("runPayroll"),
          },
        ],
      },
      {
        type: "section",
        key: "employee_finance",
        label: "Finance",
        children: [
          {
            type: "link",
            key: "payroll",
            label: "Payroll",
            to: "/payroll",
            visible: can("runPayroll"),
          },
          {
            type: "link",
            key: "payslips",
            label: "Payslips",
            to: "/payslips",
            visible: can("runPayroll"),
          },
          {
            type: "link",
            key: "advances",
            label: "Advances",
            to: "/advances",
            visible: can("runPayroll"),
          },
        ],
      },
    ],
  },
  {
    type: "section",
    key: "administration",
    label: "Administration",
    children: [
      {
        type: "link",
        key: "roles",
        label: "Roles & Setup",
        to: "/roles",
        visible: can("manageRoles"),
      },
      {
        type: "link",
        key: "settings",
        label: "Settings",
        to: "/settings",
        visible: can("manageSalaryConfig"),
      },
      {
        type: "link",
        key: "reports",
        label: "Reports",
        to: "/reports",
        visible: can("viewReports"),
      },
    ],
  },
];

function Sidebar({ isOwner, permissions = {} }) {
  const location = useLocation();
  const [openSections, setOpenSections] = useState(readOpenStateFromStorage);
  const can = (permission) => isOwner || Boolean(permissions?.[permission]);

  useEffect(() => {
    localStorage.setItem(
      SIDEBAR_OPEN_STATE_KEY,
      JSON.stringify(openSections || {})
    );
  }, [openSections]);

  const visibleSections = useMemo(
    () => filterVisibleItems(buildSidebarSections({ can, isOwner })),
    [isOwner, permissions]
  );

  const activeSectionKeys = useMemo(() => {
    const keys = new Set();
    collectActiveSectionKeys(visibleSections, location.pathname, keys);
    return keys;
  }, [visibleSections, location.pathname]);

  const isSectionOpen = (key) => {
    if (activeSectionKeys.has(key)) return true;
    if (openSections[key] !== undefined) return Boolean(openSections[key]);
    return Boolean(DEFAULT_OPEN_SECTIONS[key]);
  };

  const toggleSection = (key) => {
    setOpenSections((prev) => {
      const baseValue =
        prev[key] !== undefined
          ? Boolean(prev[key])
          : Boolean(DEFAULT_OPEN_SECTIONS[key]);
      return {
        ...prev,
        [key]: !baseValue,
      };
    });
  };

  const renderItems = (items = [], depth = 0) =>
    items.map((item) => {
      if (item.type === "link") {
        const isActive = isRouteActive(location.pathname, item.to);
        return (
          <NavLink
            key={item.key || item.to}
            to={item.to}
            className={`sidebar-link sidebar-link--nested${
              item.icon ? " sidebar-link--with-icon" : ""
            }${isActive ? " active" : ""}`}
            style={{ "--sidebar-depth": depth }}
          >
            {item.icon ? (
              <span className="sidebar-link__icon">{item.icon}</span>
            ) : null}
            <span className="sidebar-link__text">{item.label}</span>
          </NavLink>
        );
      }

      const open = isSectionOpen(item.key);
      return (
        <div key={item.key} className="sidebar-section">
          <button
            type="button"
            className={`sidebar-section__trigger${open ? " is-open" : ""}`}
            style={{ "--sidebar-depth": depth }}
            onClick={() => toggleSection(item.key)}
          >
            <span className="sidebar-section__label">{item.label}</span>
            <ChevronIcon open={open} />
          </button>
          <div className={`sidebar-section__content${open ? " is-open" : ""}`}>
            <div className="sidebar-section__content-inner">
              {renderItems(item.children, depth + 1)}
            </div>
          </div>
        </div>
      );
    });

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
        {renderItems(visibleSections)}
      </nav>
    </aside>
  );
}

export default Sidebar;

