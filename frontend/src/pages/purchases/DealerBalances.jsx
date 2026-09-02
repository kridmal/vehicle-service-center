import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

function PayModal({ dealer, onClose, onPaid }) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Enter a valid amount greater than 0.");
      return;
    }
    setIsPaying(true);
    try {
      const { data } = await api.post(`/dealers/${dealer._id}/pay`, {
        amount: parsedAmount,
        notes,
      });
      setResult(data);
      onPaid(dealer._id);
    } catch (err) {
      setError(err.response?.data?.message || "Payment failed. Try again.");
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="purchases-modal-overlay" role="dialog" aria-modal="true">
      <div className="purchases-modal">
        <h3 style={{ margin: 0 }}>Pay Pending Balance — {dealer.name}</h3>

        {!result ? (
          <>
            <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
              Pending:{" "}
              <strong>{formatCurrency(dealer.totalPendingBalance)}</strong> across{" "}
              {dealer.pendingCount} invoice{dealer.pendingCount !== 1 ? "s" : ""}. Payment
              is applied oldest-first (FIFO).
            </p>

            {error ? (
              <p className="purchases-alert purchases-alert--error">{error}</p>
            ) : null}

            <form onSubmit={handleSubmit}>
              <div className="purchases-field">
                <label htmlFor="pay-amount">Amount to Pay (LKR)</label>
                <input
                  id="pay-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  autoFocus
                />
              </div>
              <div className="purchases-field" style={{ marginTop: 10 }}>
                <label htmlFor="pay-notes">Notes (optional)</label>
                <input
                  id="pay-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Bank transfer ref"
                />
              </div>
              <div className="purchases-actions" style={{ marginTop: 12 }}>
                <button type="submit" className="purchases-button" disabled={isPaying}>
                  {isPaying ? "Applying..." : "Apply Payment"}
                </button>
                <button type="button" className="purchases-button-ghost" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className="purchases-alert purchases-alert--success">
              Payment of {formatCurrency(result.totalPaid)} applied successfully.
              {result.unallocated > 0
                ? ` ${formatCurrency(result.unallocated)} could not be allocated — dealer has no more pending invoices.`
                : ""}
            </p>

            <div style={{ fontSize: 13 }}>
              {(result.allocations || []).map((alloc, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <span style={{ color: "#475569" }}>Invoice …{String(alloc.invoiceId).slice(-6)}</span>
                  <span>
                    {formatCurrency(alloc.amountApplied)} applied —{" "}
                    <span
                      className={`purchase-status purchase-status--${String(alloc.resultingStatus).toLowerCase()}`}
                    >
                      {alloc.resultingStatus}
                    </span>
                    {alloc.balanceRemaining > 0 ? (
                      <span style={{ color: "#64748b", marginLeft: 6 }}>
                        ({formatCurrency(alloc.balanceRemaining)} remaining)
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>

            <div className="purchases-actions" style={{ marginTop: 12 }}>
              <button type="button" className="purchases-button" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DealerBalances() {
  const navigate = useNavigate();
  const [dealers, setDealers] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [payingDealer, setPayingDealer] = useState(null);

  const loadDealers = async () => {
    setIsLoading(true);
    setError("");
    try {
      const { data } = await api.get("/dealers");
      const dealerList = Array.isArray(data) ? data : [];
      setDealers(dealerList);

      const summaryResults = await Promise.allSettled(
        dealerList.map((d) => api.get(`/dealers/${d._id}/pending-summary`))
      );
      const map = {};
      dealerList.forEach((d, idx) => {
        const result = summaryResults[idx];
        if (result.status === "fulfilled") {
          map[d._id] = result.value.data;
        } else {
          map[d._id] = { pendingCount: 0, totalPendingBalance: 0 };
        }
      });
      setSummaries(map);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err.response?.data?.message || "Unable to load dealer balances.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDealers();
  }, [navigate]);

  const handlePaid = async (dealerId) => {
    try {
      const { data } = await api.get(`/dealers/${dealerId}/pending-summary`);
      setSummaries((prev) => ({ ...prev, [dealerId]: data }));
    } catch {
      // summary will refresh on next load
    }
  };

  const dealersWithBalance = dealers.filter(
    (d) => (summaries[d._id]?.pendingCount || 0) > 0
  );
  const dealersCleared = dealers.filter(
    (d) => (summaries[d._id]?.pendingCount || 0) === 0
  );

  return (
    <div className="purchases-page">
      <PageHeader title="Dealer Balances" />

      <section className="purchases-card">
        <div className="purchases-head">
          <div>
            <h2>Dealer Pending Balances</h2>
            <p>Pay a lump sum that is applied across invoices oldest-first.</p>
          </div>
        </div>

        {error ? <p className="purchases-alert purchases-alert--error">{error}</p> : null}

        {isLoading ? (
          <p className="purchases-empty">Loading dealer balances...</p>
        ) : dealersWithBalance.length === 0 && dealersCleared.length === 0 ? (
          <p className="purchases-empty">No dealers found.</p>
        ) : (
          <>
            {dealersWithBalance.length > 0 ? (
              <div className="purchases-table">
                <table>
                  <thead>
                    <tr>
                      <th>Dealer Code</th>
                      <th>Name</th>
                      <th className="purchases-right">Pending Invoices</th>
                      <th className="purchases-right">Total Pending Balance</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealersWithBalance.map((d) => {
                      const summary = summaries[d._id] || {};
                      return (
                        <tr key={d._id}>
                          <td>{d.dealerCode}</td>
                          <td>{d.name}</td>
                          <td className="purchases-right">{summary.pendingCount ?? "—"}</td>
                          <td className="purchases-right">
                            {formatCurrency(summary.totalPendingBalance)}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="purchases-button-ghost"
                              onClick={() =>
                                setPayingDealer({
                                  ...d,
                                  pendingCount: summary.pendingCount,
                                  totalPendingBalance: summary.totalPendingBalance,
                                })
                              }
                            >
                              Pay Balance
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="purchases-empty">All dealers are fully settled.</p>
            )}

            {dealersCleared.length > 0 ? (
              <details style={{ marginTop: 8 }}>
                <summary
                  style={{ cursor: "pointer", fontSize: 13, color: "#64748b" }}
                >
                  {dealersCleared.length} dealer{dealersCleared.length !== 1 ? "s" : ""} with no
                  outstanding balance
                </summary>
                <div className="purchases-table" style={{ marginTop: 8 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Dealer Code</th>
                        <th>Name</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dealersCleared.map((d) => (
                        <tr key={d._id}>
                          <td>{d.dealerCode}</td>
                          <td>{d.name}</td>
                          <td>
                            <span className="purchase-status purchase-status--paid">
                              Cleared
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </>
        )}
      </section>

      {payingDealer ? (
        <PayModal
          dealer={payingDealer}
          onClose={() => setPayingDealer(null)}
          onPaid={(dealerId) => {
            handlePaid(dealerId);
            setPayingDealer(null);
          }}
        />
      ) : null}
    </div>
  );
}

export default DealerBalances;
