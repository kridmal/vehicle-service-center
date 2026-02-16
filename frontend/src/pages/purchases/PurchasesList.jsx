import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import api from "../../services/api.js";
import "./Purchases.css";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

function PurchasesList() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadPurchases = async () => {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get("/purchases");
        setInvoices(Array.isArray(data) ? data : []);
      } catch (requestError) {
        if (
          requestError.response?.status === 401 ||
          requestError.response?.status === 403
        ) {
          navigate("/login", { replace: true });
          return;
        }
        setError(
          requestError.response?.data?.message ||
            "Unable to load purchases right now."
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadPurchases();
  }, [navigate]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices.filter((row) => {
      const status = String(row.status || "UNPAID").toUpperCase();
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      if (!query) return true;
      return (
        String(row.dealerInvoiceNumber || "").toLowerCase().includes(query) ||
        String(row.dealerSnapshot?.dealerCode || "")
          .toLowerCase()
          .includes(query) ||
        String(row.dealerSnapshot?.name || "").toLowerCase().includes(query)
      );
    });
  }, [invoices, search, statusFilter]);

  return (
    <div className="purchases-page">
      <PageHeader title="Purchases" />

      <section className="purchases-card">
        <div className="purchases-head">
          <div>
            <h2>Dealer Credit Invoices</h2>
            <p>Track stock-in invoices and outstanding balances by dealer.</p>
          </div>
          <Link className="purchases-button" to="/purchases/new">
            + New Purchase Invoice
          </Link>
        </div>

        <div className="purchases-grid">
          <div className="purchases-field">
            <label htmlFor="purchase-status-filter">Status</label>
            <select
              id="purchase-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">All</option>
              <option value="UNPAID">UNPAID</option>
              <option value="PARTIALLY_PAID">PARTIALLY PAID</option>
              <option value="PAID">PAID</option>
            </select>
          </div>
          <div className="purchases-field">
            <label htmlFor="purchase-search">Search</label>
            <input
              id="purchase-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Dealer code, dealer name, invoice number"
            />
          </div>
        </div>

        {error ? <p className="purchases-alert purchases-alert--error">{error}</p> : null}

        {isLoading ? (
          <p className="purchases-empty">Loading purchase invoices...</p>
        ) : filtered.length === 0 ? (
          <p className="purchases-empty">No purchase invoices found.</p>
        ) : (
          <div className="purchases-table">
            <table>
              <thead>
                <tr>
                  <th>Purchase Date</th>
                  <th>Dealer</th>
                  <th>Dealer Invoice No</th>
                  <th className="purchases-right">Total</th>
                  <th className="purchases-right">Paid</th>
                  <th className="purchases-right">Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((invoice) => {
                  const status = String(invoice.status || "UNPAID").toUpperCase();
                  const statusClass = status.toLowerCase();
                  const id = invoice._id || invoice.id;
                  return (
                    <tr key={id}>
                      <td>
                        {invoice.purchaseDate
                          ? new Date(invoice.purchaseDate).toLocaleDateString()
                          : "-"}
                      </td>
                      <td>
                        {invoice.dealerSnapshot?.dealerCode || "-"} -{" "}
                        {invoice.dealerSnapshot?.name || "-"}
                      </td>
                      <td>{invoice.dealerInvoiceNumber || "-"}</td>
                      <td className="purchases-right">
                        {formatCurrency(invoice.totalAmount)}
                      </td>
                      <td className="purchases-right">
                        {formatCurrency(invoice.paidAmount)}
                      </td>
                      <td className="purchases-right">
                        {formatCurrency(invoice.balanceAmount)}
                      </td>
                      <td>
                        <span className={`purchase-status purchase-status--${statusClass}`}>
                          {status}
                        </span>
                      </td>
                      <td>
                        <div className="purchases-actions">
                          <Link className="purchases-button-ghost" to={`/purchases/${id}`}>
                            View
                          </Link>
                          <Link
                            className="purchases-button-ghost"
                            to={`/purchases/${id}?addPayment=1`}
                          >
                            Add Payment
                          </Link>
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

export default PurchasesList;

