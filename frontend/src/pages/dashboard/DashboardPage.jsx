import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api.js";
import { useLocalStorageState } from "../../hooks/useLocalStorageState.js";
import "./DashboardPage.css";

function DashboardPage() {
  const [invoices] = useLocalStorageState("ksc_invoices", []);
  const [jobCards] = useLocalStorageState("ksc_job_cards", []);
  const [inventory] = useLocalStorageState("ksc_inventory", []);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);

  useEffect(() => {
    const loadSummary = async () => {
      setSummaryLoading(true);
      setSummaryError(false);
      try {
        const { data } = await api.get("/dashboard/summary");
        setSummary(data);
      } catch (error) {
        setSummaryError(true);
        console.warn("Dashboard summary load failed.");
      } finally {
        setSummaryLoading(false);
      }
    };
    loadSummary();
  }, []);

  const now = new Date();

  const fallbackInvoiceStatusCounts = invoices.reduce(
    (acc, invoice) => {
      const status = invoice.payment?.status || "UNPAID";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { UNPAID: 0, PARTIAL: 0, PAID: 0 }
  );

  const fallbackJobCardStatusCounts = jobCards.reduce(
    (acc, job) => {
      const status = job.status || "OPEN";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { OPEN: 0, IN_PROGRESS: 0, COMPLETED: 0 }
  );

  const lowStockItems = inventory
    .filter((item) => Number(item.quantity) <= Number(item.minStock))
    .sort((a, b) => Number(a.quantity) - Number(b.quantity))
    .slice(0, 5);

  const formatKpi = (value) => {
    if (summaryError) return "-";
    if (summaryLoading) return null;
    if (value === null || value === undefined) return "-";
    return Number(value).toLocaleString("en-US");
  };

  const formatCount = (value) => {
    if (summaryError) return "-";
    if (summaryLoading) return "-";
    if (value === null || value === undefined) return "-";
    return Number(value).toLocaleString("en-US");
  };

  const invoiceStatusCounts =
    summary?.invoiceStatusCounts || fallbackInvoiceStatusCounts;
  const jobCardStatusCounts =
    summary?.jobCardStatusCounts || fallbackJobCardStatusCounts;

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-hero__eyebrow">Vehicle Service Center</p>
          <h2>Dashboard</h2>
          <p className="dashboard-hero__subtitle">
            Operational overview for {now.toLocaleDateString()}
          </p>
        </div>
        <div className="dashboard-hero__badge">Business Ready</div>
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <h3>Today at a glance</h3>
            <p>Key operational metrics updated in real time.</p>
          </div>
        </div>
        <div className="dashboard__kpis">
          <div className="kpi-card">
            <p className="kpi-label">Revenue Today</p>
            <p className="kpi-value">
              {summaryLoading ? (
                <span className="kpi-skeleton" />
              ) : (
                formatKpi(summary?.revenueToday)
              )}
            </p>
            <p className="kpi-meta">Paid invoices only</p>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">Revenue This Week</p>
            <p className="kpi-value">
              {summaryLoading ? (
                <span className="kpi-skeleton" />
              ) : (
                formatKpi(summary?.revenueThisWeek)
              )}
            </p>
            <p className="kpi-meta">Week-to-date</p>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">Total Invoices</p>
            <p className="kpi-value">
              {summaryLoading ? (
                <span className="kpi-skeleton" />
              ) : (
                formatKpi(summary?.totalInvoices)
              )}
            </p>
            <p className="kpi-meta">All statuses</p>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">Active Job Cards</p>
            <p className="kpi-value">
              {summaryLoading ? (
                <span className="kpi-skeleton" />
              ) : (
                formatKpi(summary?.activeJobCards)
              )}
            </p>
            <p className="kpi-meta">Open + In progress</p>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">Attendance Today</p>
            <p className="kpi-value">
              {summaryLoading ? (
                <span className="kpi-skeleton" />
              ) : (
                `${formatCount(summary?.todayAttendance?.present)} / ${formatCount(
                  summary?.todayAttendance?.absent
                )}`
              )}
            </p>
            <p className="kpi-meta">Present / Absent</p>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">Pending Leave Requests</p>
            <p className="kpi-value">
              {summaryLoading ? (
                <span className="kpi-skeleton" />
              ) : (
                formatCount(summary?.pendingLeaveRequests)
              )}
            </p>
            <p className="kpi-meta">Awaiting review</p>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">Current Payroll</p>
            <p className="kpi-value">
              {summaryLoading ? (
                <span className="kpi-skeleton" />
              ) : (
                Object.entries(summary?.payrollCurrentMonthStatus || {})
                  .map(([status, count]) => `${status}:${count}`)
                  .join(" | ") || "No run"
              )}
            </p>
            <p className="kpi-meta">Monthly status mix</p>
          </div>
        </div>
      </section>

      <section className="dashboard-section dashboard__middle">
        <div className="dashboard__summary">
          <div className="summary-card">
            <div className="summary-card__head">
              <h2>Job Card Status</h2>
              <span className="summary-pill">Live</span>
            </div>
            <div className="summary-row">
              <span>OPEN</span>
              <span>{formatCount(jobCardStatusCounts.OPEN)}</span>
            </div>
            <div className="summary-row">
              <span>IN_PROGRESS</span>
              <span>{formatCount(jobCardStatusCounts.IN_PROGRESS)}</span>
            </div>
            <div className="summary-row">
              <span>COMPLETED</span>
              <span>{formatCount(jobCardStatusCounts.COMPLETED)}</span>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-card__head">
              <h2>Invoice Status</h2>
              <span className="summary-pill">Payments</span>
            </div>
            <div className="summary-row">
              <span>UNPAID</span>
              <span>{formatCount(invoiceStatusCounts.UNPAID)}</span>
            </div>
            <div className="summary-row">
              <span>PARTIAL</span>
              <span>{formatCount(invoiceStatusCounts.PARTIAL)}</span>
            </div>
            <div className="summary-row">
              <span>PAID</span>
              <span>{formatCount(invoiceStatusCounts.PAID)}</span>
            </div>
          </div>
        </div>

        <div className="dashboard__low-stock">
          <div className="summary-card__head">
            <h2>Low Stock</h2>
            <span className="summary-pill warning">Attention</span>
          </div>
          {lowStockItems.length === 0 ? (
            <div className="low-stock__ok">All items in stock</div>
          ) : (
            <ul className="low-stock__list">
              {lowStockItems.map((item) => (
                <li className="low-stock__item" key={item.id}>
                  <div>
                    <p className="low-stock__name">{item.itemName || item.name}</p>
                    <p className="low-stock__meta">{item.unit} remaining</p>
                  </div>
                  <span className="low-stock__qty">{item.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <h3>Quick Actions</h3>
            <p>Jump straight to the most common tasks.</p>
          </div>
        </div>
        <div className="action-grid">
          <Link className="action-card" to="/job-cards/new">
            <span>New Job Card</span>
            <span className="action-meta">Create work order</span>
          </Link>
          <Link className="action-card" to="/invoices">
            <span>Invoices</span>
            <span className="action-meta">Review payments</span>
          </Link>
          <Link className="action-card" to="/inventory">
            <span>Inventory</span>
            <span className="action-meta">Manage parts</span>
          </Link>
          <Link className="action-card" to="/customers">
            <span>Customers</span>
            <span className="action-meta">Profiles & history</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;
