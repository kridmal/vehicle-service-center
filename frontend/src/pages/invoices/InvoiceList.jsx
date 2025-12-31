import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import api from "../../services/api.js";
import "./InvoiceList.css";

function InvoiceList() {
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const loadInvoices = async () => {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get("/invoices");
        setInvoices(Array.isArray(data) ? data : []);
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          navigate("/login", { replace: true });
        }
        setError(
          error.response?.data?.message ||
            "Unable to load invoices right now."
        );
      } finally {
        setIsLoading(false);
      }
    };
    loadInvoices();
  }, [navigate]);

  const normalizedInvoices = useMemo(
    () =>
      invoices.map((invoice) => ({
        ...invoice,
        id: invoice._id || invoice.id,
        paymentStatus: (invoice.paymentStatus || "UNPAID").toUpperCase(),
      })),
    [invoices]
  );

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return normalizedInvoices.filter((invoice) => {
      if (statusFilter !== "ALL" && invoice.paymentStatus !== statusFilter) {
        return false;
      }
      if (!query) return true;
      return (
        invoice.invoiceNumber?.toLowerCase().includes(query) ||
        String(invoice.jobCardNo || "").toLowerCase().includes(query)
      );
    });
  }, [normalizedInvoices, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = normalizedInvoices.length;
    const paid = normalizedInvoices.filter(
      (invoice) => invoice.paymentStatus === "PAID"
    );
    const unpaid = normalizedInvoices.filter(
      (invoice) => invoice.paymentStatus !== "PAID"
    );
    const revenue = paid.reduce(
      (sum, invoice) => sum + (Number(invoice.totalAmount) || 0),
      0
    );
    return {
      total,
      paid: paid.length,
      unpaid: unpaid.length,
      revenue,
    };
  }, [normalizedInvoices]);

  const formatCurrency = (value) => {
    const number = Number(value);
    if (Number.isNaN(number)) return "-";
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      maximumFractionDigits: 2,
    }).format(number);
  };

  return (
    <div className="invoice-list">
      <div className="invoice-list__header">
        <div>
          <PageHeader title="Invoices" />
          <p className="invoice-list__subtitle">
            Manage and track customer invoices
          </p>
        </div>
        <div className="invoice-list__filters">
          <div className="invoice-list__field">
            <label htmlFor="invoice-status">Status</label>
            <select
              id="invoice-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">All</option>
              <option value="PAID">Paid</option>
              <option value="UNPAID">Unpaid</option>
            </select>
          </div>
          <div className="invoice-list__field">
            <label htmlFor="invoice-search">Search</label>
            <input
              id="invoice-search"
              type="search"
              placeholder="Invoice No / Job Card No"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>
      </div>

      <section className="invoice-list__stats">
        <div className="invoice-stat">
          <span>Total Invoices</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="invoice-stat">
          <span>Paid Invoices</span>
          <strong>{stats.paid}</strong>
        </div>
        <div className="invoice-stat">
          <span>Unpaid Invoices</span>
          <strong>{stats.unpaid}</strong>
        </div>
        <div className="invoice-stat invoice-stat--revenue">
          <span>Total Revenue</span>
          <strong>{formatCurrency(stats.revenue)}</strong>
        </div>
      </section>

      <section className="invoice-list__table">
        {error ? <p className="invoice-list__error">{error}</p> : null}
        {isLoading ? (
          <p className="invoice-list__muted">Loading invoices...</p>
        ) : filteredInvoices.length === 0 ? (
          <div className="invoice-list__empty">
            <p>No invoices available yet</p>
            <Link className="invoice-list__cta" to="/job-cards">
              Go to Job Cards
            </Link>
          </div>
        ) : (
          <div className="invoice-table-card">
            <table>
              <thead>
                <tr>
                  <th>Invoice No</th>
                  <th>Job Card No</th>
                  <th>Date</th>
                  <th className="cell-right">Amount (LKR)</th>
                  <th>Status</th>
                  <th className="cell-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => {
                  const statusClass = invoice.paymentStatus.toLowerCase();
                  return (
                    <tr key={invoice.id}>
                      <td>{invoice.invoiceNumber}</td>
                      <td>{invoice.jobCardNo || "-"}</td>
                      <td>
                        {invoice.createdAt
                          ? new Date(invoice.createdAt).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="cell-right">
                        {formatCurrency(invoice.totalAmount)}
                      </td>
                      <td>
                        <span
                          className={`invoice-badge invoice-badge--${statusClass}`}
                        >
                          {invoice.paymentStatus}
                        </span>
                      </td>
                      <td className="cell-right">
                        <div className="invoice-actions">
                          <Link
                            className="invoice-action"
                            to={`/invoices/${invoice.id}`}
                          >
                            View
                          </Link>
                          <button
                            type="button"
                            className="invoice-action"
                            onClick={() =>
                              window.open(
                                `/invoices/${invoice.id}?print=1`,
                                "_blank",
                                "noopener"
                              )
                            }
                          >
                            Print
                          </button>
                          <button
                            type="button"
                            className="invoice-action invoice-action--ghost"
                            disabled
                          >
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default InvoiceList;
