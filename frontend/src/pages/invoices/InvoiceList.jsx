import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import api from "../../services/api.js";
import "./InvoiceList.css";

function InvoiceList() {
  const [invoices, setInvoices] = useState([]);
  const [sales, setSales] = useState([]);
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
        const [invoiceResult, salesResult] = await Promise.allSettled([
          api.get("/invoices"),
          api.get("/sales"),
        ]);

        if (invoiceResult.status !== "fulfilled") {
          const invoiceError = invoiceResult.reason;
          if (
            invoiceError.response?.status === 401 ||
            invoiceError.response?.status === 403
          ) {
            navigate("/login", { replace: true });
            return;
          }
          throw invoiceError;
        }

        setInvoices(
          Array.isArray(invoiceResult.value?.data) ? invoiceResult.value.data : []
        );

        if (salesResult.status === "fulfilled") {
          setSales(Array.isArray(salesResult.value?.data) ? salesResult.value.data : []);
        } else {
          setSales([]);
        }
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
      [
        ...invoices.map((invoice) => ({
          ...invoice,
          id: invoice._id || invoice.id,
          sourceId: invoice._id || invoice.id,
          invoiceType: (invoice.invoiceType || "JOB_CARD").toUpperCase(),
          paymentStatus: (invoice.paymentStatus || "UNPAID").toUpperCase(),
          amount: Number(invoice.totalAmount) || 0,
          displayNumber: invoice.invoiceNumber || "-",
          displayDate: invoice.createdAt || null,
        })),
        ...sales.map((sale) => ({
          ...sale,
          id: `sale-${sale._id || sale.id}`,
          sourceId: sale._id || sale.id,
          invoiceType: "SALE",
          paymentStatus: String(sale.status || "UNPAID").toUpperCase() === "PAID" ? "PAID" : "UNPAID",
          amount: Number(sale.grandTotal) || 0,
          displayNumber: sale.saleNumber || "-",
          displayDate: sale.saleDate || sale.createdAt || null,
          jobCardNo: "-",
        })),
      ].sort((a, b) => {
        const dateA = new Date(a.displayDate || 0).getTime();
        const dateB = new Date(b.displayDate || 0).getTime();
        return dateB - dateA;
      }),
    [invoices, sales]
  );

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return normalizedInvoices.filter((invoice) => {
      if (statusFilter !== "ALL" && invoice.paymentStatus !== statusFilter) {
        return false;
      }
      if (!query) return true;
      return (
        String(invoice.displayNumber || "").toLowerCase().includes(query) ||
        String(invoice.invoiceType || "").toLowerCase().includes(query) ||
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
      (sum, invoice) => sum + (Number(invoice.amount) || 0),
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
                placeholder="Invoice No / Type / Job Card No"
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
                  <th>Type</th>
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
                  const typeClass =
                    invoice.invoiceType === "SALE"
                      ? "invoice-type-badge--sale"
                      : "invoice-type-badge--job";
                  const viewPath =
                    invoice.invoiceType === "SALE"
                      ? `/sales/${invoice.sourceId}/invoice`
                      : `/invoices/${invoice.sourceId}`;
                  const printPath =
                    invoice.invoiceType === "SALE"
                      ? `/sales/${invoice.sourceId}/invoice?print=1`
                      : `/invoices/${invoice.sourceId}?print=1`;
                  return (
                    <tr key={invoice.id}>
                      <td>{invoice.displayNumber}</td>
                      <td>
                        <span className={`invoice-type-badge ${typeClass}`}>
                          {invoice.invoiceType}
                        </span>
                      </td>
                      <td>{invoice.jobCardNo || "-"}</td>
                      <td>
                        {invoice.displayDate
                          ? new Date(invoice.displayDate).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="cell-right">
                        {formatCurrency(invoice.amount)}
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
                          <Link className="invoice-action" to={viewPath}>
                            View
                          </Link>
                          <button
                            type="button"
                            className="invoice-action"
                            onClick={() =>
                              window.open(
                                printPath,
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
