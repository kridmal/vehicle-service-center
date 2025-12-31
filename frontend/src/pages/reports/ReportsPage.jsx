import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import api from "../../services/api.js";
import "./ReportsPage.css";

const PAYMENT_COLORS = {
  PAID: "#16a34a",
  PARTIAL: "#f59e0b",
  UNPAID: "#ef4444",
  UNKNOWN: "#94a3b8",
};

const trendColorStops = [
  { offset: "0%", color: "#0ea5e9" },
  { offset: "100%", color: "#22c55e" },
];

const toDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const getLinePoints = (values, width, height, padding = 16) => {
  if (!values.length) return "";
  const max = Math.max(...values.map((entry) => entry.value), 1);
  const min = Math.min(...values.map((entry) => entry.value), 0);
  const range = max - min || 1;
  const step = (width - padding * 2) / Math.max(values.length - 1, 1);
  return values
    .map((entry, index) => {
      const x = padding + index * step;
      const y =
        padding +
        (height - padding * 2) *
          (1 - (entry.value - min) / range);
      return `${x},${y}`;
    })
    .join(" ");
};

function ReportsPage() {
  const [fromDate, setFromDate] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return toDateInput(start);
  });
  const [toDate, setToDate] = useState(() => toDateInput(new Date()));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/reports/summary", {
          params: { from: fromDate, to: toDate },
        });
        setReport(data);
      } catch (error) {
        if (error.response?.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        if (error.response?.status === 403) {
          navigate("/unauthorized", { replace: true });
          return;
        }
        setError(
          error.response?.data?.message ||
            "Unable to load reports. Please try again."
        );
      } finally {
        setLoading(false);
      }
    };
    loadReports();
  }, [fromDate, toDate, navigate]);

  const revenueTrend = useMemo(() => {
    return (report?.overview?.revenueTrend || []).map((entry) => ({
      label: entry.date,
      value: entry.total || 0,
    }));
  }, [report]);

  const profitTrend = useMemo(() => {
    return (report?.financial?.trend || []).map((entry) => ({
      label: entry.date,
      value: entry.profit || 0,
    }));
  }, [report]);

  const paymentBreakdown = report?.overview?.paymentBreakdown || [];

  const paymentTotals = paymentBreakdown.reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  );

  const statusSlices = paymentBreakdown.map((entry) => ({
    ...entry,
    color: PAYMENT_COLORS[entry.status] || PAYMENT_COLORS.UNKNOWN,
    percent: paymentTotals ? (entry.amount / paymentTotals) * 100 : 0,
  }));

  const inventoryLow = report?.inventory?.lowStock || [];
  const technicianStats = report?.staff?.technicians || [];
  const topVehicles = report?.customers?.topVehicles || [];
  const revenueByService = report?.sales?.revenueByService || [];
  const jobStatus = report?.jobs?.statusDistribution || [];
  const serviceVolume = report?.jobs?.serviceVolume || [];
  const inventoryUsage = report?.inventory?.usage || [];

  return (
    <div className="reports-page">
      <div className="reports-hero">
        <div>
          <PageHeader title="Reports" />
          <p className="reports-subtitle">
            Read-only performance intelligence for your service center.
          </p>
        </div>
        <div className="reports-range">
          <label htmlFor="reports-from">
            From
            <input
              id="reports-from"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label htmlFor="reports-to">
            To
            <input
              id="reports-to"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
        </div>
      </div>

      {error ? <p className="reports-error">{error}</p> : null}
      {loading && !report ? (
        <p className="reports-muted">Loading reports...</p>
      ) : null}

      {report ? (
        <>
          <section className="reports-grid">
            <div className="reports-card reports-card--hero">
              <h3>Business Overview</h3>
              <div className="reports-kpis">
                <div>
                  <span>Total Revenue</span>
                  <strong>{formatCurrency(report.overview.totalRevenue)}</strong>
                </div>
                <div>
                  <span>Jobs Completed</span>
                  <strong>{report.overview.jobsCompleted}</strong>
                </div>
                <div>
                  <span>Pending Payments</span>
                  <strong>{formatCurrency(report.overview.pendingPayments)}</strong>
                </div>
              </div>
              <div className="reports-chart">
                <div className="reports-chart__header">
                  <span>Revenue Trend</span>
                  <span>{revenueTrend.length} days</span>
                </div>
                {revenueTrend.length ? (
                  <svg viewBox="0 0 320 160" role="img" aria-label="Revenue trend">
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" x2="0" y1="0" y2="1">
                        {trendColorStops.map((stop) => (
                          <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
                        ))}
                      </linearGradient>
                    </defs>
                    <polyline
                      fill="none"
                      stroke="url(#revenueGradient)"
                      strokeWidth="3"
                      points={getLinePoints(revenueTrend, 320, 160)}
                    />
                    <polyline
                      fill="rgba(14, 165, 233, 0.1)"
                      stroke="none"
                      points={`${getLinePoints(revenueTrend, 320, 160)} 304,152 16,152`}
                    />
                  </svg>
                ) : (
                  <p className="reports-muted">No revenue activity in range.</p>
                )}
              </div>
            </div>

            <div className="reports-card">
              <h3>Payment Status</h3>
              <div className="reports-donut">
                <svg viewBox="0 0 120 120" role="img" aria-label="Payment breakdown">
                  {statusSlices.reduce((acc, slice, index) => {
                    const prevTotal = acc.offset;
                    const dashArray = `${slice.percent} ${100 - slice.percent}`;
                    acc.elements.push(
                      <circle
                        key={slice.status}
                        cx="60"
                        cy="60"
                        r="46"
                        fill="none"
                        stroke={slice.color}
                        strokeWidth="12"
                        strokeDasharray={dashArray}
                        strokeDashoffset={100 - prevTotal}
                        transform="rotate(-90 60 60)"
                      />
                    );
                    acc.offset += slice.percent;
                    return acc;
                  }, { elements: [], offset: 0 }).elements}
                </svg>
                <div>
                  {statusSlices.map((slice) => (
                    <div key={slice.status} className="reports-legend">
                      <span style={{ background: slice.color }} />
                      <div>
                        <strong>{slice.status}</strong>
                        <p>
                          {slice.count} invoices - {formatCurrency(slice.amount)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="reports-card">
              <h3>Financial Health</h3>
              <div className="reports-financial">
                <div>
                  <span>Revenue</span>
                  <strong>{formatCurrency(report.financial.revenue)}</strong>
                </div>
                <div>
                  <span>Expense</span>
                  <strong>{formatCurrency(report.financial.expense)}</strong>
                </div>
                <div>
                  <span>Estimated Profit</span>
                  <strong>{formatCurrency(report.financial.profit)}</strong>
                </div>
              </div>
              <div className="reports-chart reports-chart--compact">
                {profitTrend.length ? (
                  <svg viewBox="0 0 300 120" role="img" aria-label="Profit trend">
                    <polyline
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="2.5"
                      points={getLinePoints(profitTrend, 300, 120, 12)}
                    />
                  </svg>
                ) : (
                  <p className="reports-muted">No profit data available.</p>
                )}
              </div>
            </div>
          </section>

          <section className="reports-section">
            <div className="reports-section__header">
              <h2>Sales & Revenue</h2>
              <p>Revenue performance across services and payment flow.</p>
            </div>
            <div className="reports-columns">
              <div className="reports-card">
                <h3>Revenue by Service</h3>
                {revenueByService.length ? (
                  <div className="reports-bars">
                    {revenueByService.slice(0, 6).map((service) => (
                      <div key={service.serviceType} className="reports-bar">
                        <span>{service.serviceName}</span>
                        <div>
                          <div
                            style={{
                              width: `${Math.min(
                                100,
                                (service.laborRevenue /
                                  Math.max(
                                    ...revenueByService.map((item) => item.laborRevenue || 0),
                                    1
                                  )) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                        <strong>{formatCurrency(service.laborRevenue)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="reports-muted">No service revenue in range.</p>
                )}
              </div>
              <div className="reports-card">
                <h3>Invoice Status Totals</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Invoices</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentBreakdown.map((entry) => (
                      <tr key={entry.status}>
                        <td>{entry.status}</td>
                        <td>{entry.count}</td>
                        <td>{formatCurrency(entry.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="reports-section">
            <div className="reports-section__header">
              <h2>Job Card Reports</h2>
              <p>Operational flow, volume, and completion speed.</p>
            </div>
            <div className="reports-columns">
              <div className="reports-card">
                <h3>Status Distribution</h3>
                {jobStatus.length ? (
                  <div className="reports-pillset">
                    {jobStatus.map((entry) => (
                      <div key={entry.status} className="reports-pill">
                        <strong>{entry.count}</strong>
                        <span>{entry.status}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="reports-muted">No job cards in range.</p>
                )}
              </div>
              <div className="reports-card">
                <h3>Service Volume</h3>
                {serviceVolume.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceVolume.slice(0, 8).map((entry) => (
                        <tr key={entry.serviceType}>
                          <td>{entry.serviceName}</td>
                          <td>{entry.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="reports-muted">No services in range.</p>
                )}
              </div>
              <div className="reports-card">
                <h3>Average Completion Time</h3>
                <div className="reports-metric">
                  <strong>{report.jobs.avgCompletionHours.toFixed(1)} hrs</strong>
                  <span>{report.jobs.completedCount} jobs completed</span>
                </div>
              </div>
            </div>
          </section>

          <section className="reports-section">
            <div className="reports-section__header">
              <h2>Inventory Reports</h2>
              <p>Stock health, usage, and cost exposure.</p>
            </div>
            <div className="reports-columns">
              <div className="reports-card">
                <h3>Low Stock Alerts</h3>
                {inventoryLow.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>SKU</th>
                        <th>Qty</th>
                        <th>Min</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryLow.slice(0, 8).map((item) => (
                        <tr key={item.id}>
                          <td>{item.itemName}</td>
                          <td>{item.sku}</td>
                          <td>{item.quantity}</td>
                          <td>{item.minStock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="reports-muted">No low stock alerts.</p>
                )}
              </div>
              <div className="reports-card">
                <h3>Inventory Usage & Cost</h3>
                <p className="reports-muted">
                  Estimated cost: {formatCurrency(report.inventory.usageCost)}
                </p>
                {inventoryUsage.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Used</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryUsage.slice(0, 8).map((item) => (
                        <tr key={`${item.inventoryId}-${item.sku}`}>
                          <td>{item.itemName}</td>
                          <td>{item.quantity}</td>
                          <td>{formatCurrency(item.usageCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="reports-muted">No inventory usage recorded.</p>
                )}
              </div>
              <div className="reports-card">
                <h3>Current Stock Levels</h3>
                <p className="reports-muted">
                  Total SKUs: {report.inventory.stockLevels.length}
                </p>
                <div className="reports-stock-grid">
                  {report.inventory.stockLevels.slice(0, 6).map((item) => (
                    <div key={item.id}>
                      <strong>{item.itemName}</strong>
                      <span>
                        {item.quantity} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="reports-section">
            <div className="reports-section__header">
              <h2>Staff & Payroll</h2>
              <p>Technician productivity and payroll exposure.</p>
            </div>
            <div className="reports-columns">
              <div className="reports-card">
                <h3>Jobs per Technician</h3>
                {technicianStats.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Technician</th>
                        <th>Jobs</th>
                        <th>Revenue Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {technicianStats.slice(0, 8).map((tech) => (
                        <tr key={tech.staffId}>
                          <td>{tech.name}</td>
                          <td>{tech.jobCount}</td>
                          <td>{formatCurrency(tech.laborShare)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="reports-muted">No technician activity.</p>
                )}
              </div>
              <div className="reports-card">
                <h3>Payroll Summary</h3>
                <div className="reports-metric">
                  <strong>{formatCurrency(report.staff.payrollTotal)}</strong>
                  <span>Estimated payroll</span>
                </div>
                <div className="reports-bars">
                  {technicianStats.slice(0, 5).map((tech) => (
                    <div key={tech.staffId} className="reports-bar">
                      <span>{tech.name}</span>
                      <div>
                        <div
                          style={{
                            width: `${Math.min(
                              100,
                              (tech.basePay /
                                Math.max(
                                  ...technicianStats.map((item) => item.basePay || 0),
                                  1
                                )) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                      <strong>{formatCurrency(tech.basePay)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="reports-section">
            <div className="reports-section__header">
              <h2>Customer & Vehicle Reports</h2>
              <p>Customer engagement and vehicle demand patterns.</p>
            </div>
            <div className="reports-columns">
              <div className="reports-card">
                <h3>Customer Mix</h3>
                <div className="reports-kpis reports-kpis--stack">
                  <div>
                    <span>New Customers</span>
                    <strong>{report.customers.newCustomers}</strong>
                  </div>
                  <div>
                    <span>Returning Customers</span>
                    <strong>{report.customers.returningCustomers}</strong>
                  </div>
                </div>
              </div>
              <div className="reports-card">
                <h3>Top Serviced Vehicles</h3>
                {topVehicles.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Vehicle</th>
                        <th>Brand</th>
                        <th>Visits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topVehicles.map((vehicle) => (
                        <tr key={vehicle.vehicleId}>
                          <td>{vehicle.vehicleNumber}</td>
                          <td>{vehicle.brand || vehicle.model}</td>
                          <td>{vehicle.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="reports-muted">No vehicle activity.</p>
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default ReportsPage;
