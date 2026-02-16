import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
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

const todayIso = new Date().toISOString().slice(0, 10);

function PurchaseDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [purchase, setPurchase] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    paidDate: todayIso,
    method: "CASH",
    referenceNo: "",
    note: "",
  });

  const loadPurchase = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/purchases/${id}`);
      setPurchase(data);
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
          "Unable to load purchase invoice details."
      );
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadPurchase();
  }, [loadPurchase]);

  useEffect(() => {
    if (!purchase) return;
    const shouldOpenPayment = new URLSearchParams(location.search).get("addPayment") === "1";
    if (shouldOpenPayment && purchase.status !== "PAID") {
      setShowPaymentModal(true);
      navigate(`/purchases/${id}`, { replace: true });
    }
  }, [id, location.search, navigate, purchase]);

  const statusClass = useMemo(
    () => String(purchase?.status || "UNPAID").toLowerCase(),
    [purchase]
  );

  const savePayment = async () => {
    if (!purchase) return;
    const amount = Math.max(0, Number(paymentForm.amount) || 0);
    if (amount <= 0) {
      setError("Payment amount must be greater than 0.");
      return;
    }

    setIsSavingPayment(true);
    setError("");
    setNotice("");
    try {
      await api.post(`/purchases/${purchase._id}/payments`, {
        amount,
        paidDate: paymentForm.paidDate,
        method: paymentForm.method,
        referenceNo: paymentForm.referenceNo.trim(),
        note: paymentForm.note.trim(),
      });
      setNotice("Payment added successfully.");
      setShowPaymentModal(false);
      setPaymentForm({
        amount: "",
        paidDate: todayIso,
        method: "CASH",
        referenceNo: "",
        note: "",
      });
      await loadPurchase();
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
          "Unable to add payment right now."
      );
    } finally {
      setIsSavingPayment(false);
    }
  };

  if (!purchase) {
    return (
      <div className="purchases-page">
        <PageHeader title="Purchase Invoice" />
        {error ? (
          <p className="purchases-alert purchases-alert--error">{error}</p>
        ) : (
          <p className="purchases-empty">
            {isLoading ? "Loading purchase invoice..." : "Purchase invoice not found."}
          </p>
        )}
        <Link className="purchases-button-ghost" to="/purchases">
          Back to Purchases
        </Link>
      </div>
    );
  }

  return (
    <div className="purchases-page">
      <PageHeader title={`Purchase ${purchase.dealerInvoiceNumber || ""}`} />

      {error ? <p className="purchases-alert purchases-alert--error">{error}</p> : null}
      {notice ? <p className="purchases-alert purchases-alert--success">{notice}</p> : null}

      <section className="purchases-card">
        <div className="purchases-head">
          <div>
            <h2>Dealer Snapshot</h2>
            <p>
              {purchase.dealerSnapshot?.dealerCode || "-"} -{" "}
              {purchase.dealerSnapshot?.name || "-"}
            </p>
          </div>
          <span className={`purchase-status purchase-status--${statusClass}`}>
            {purchase.status}
          </span>
        </div>

        <div className="purchases-grid">
          <div className="purchases-field">
            <label>Address</label>
            <input value={purchase.dealerSnapshot?.address || "-"} readOnly />
          </div>
          <div className="purchases-field">
            <label>Phone</label>
            <input
              value={
                [purchase.dealerSnapshot?.phone1, purchase.dealerSnapshot?.phone2]
                  .filter(Boolean)
                  .join(" / ") || "-"
              }
              readOnly
            />
          </div>
        </div>

        <div className="purchases-grid">
          <div className="purchases-field">
            <label>Dealer Invoice Number</label>
            <input value={purchase.dealerInvoiceNumber || "-"} readOnly />
          </div>
          <div className="purchases-field">
            <label>Purchase Date</label>
            <input
              value={
                purchase.purchaseDate
                  ? new Date(purchase.purchaseDate).toLocaleDateString()
                  : "-"
              }
              readOnly
            />
          </div>
        </div>
      </section>

      <section className="purchases-card">
        <div className="purchases-head">
          <div>
            <h2>Line Items</h2>
            <p>Stock-in items recorded for this invoice.</p>
          </div>
        </div>
        {(purchase.items || []).length === 0 ? (
          <p className="purchases-empty">No line items found.</p>
        ) : (
          <div className="purchases-table">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>SKU</th>
                  <th className="purchases-right">Qty</th>
                  <th className="purchases-right">Unit Cost</th>
                  <th className="purchases-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {(purchase.items || []).map((item, index) => (
                  <tr key={`${item._id || index}`}>
                    <td>{item.itemSnapshot?.name || item.inventoryItemId?.itemName || "-"}</td>
                    <td>{item.itemSnapshot?.sku || item.inventoryItemId?.sku || "-"}</td>
                    <td className="purchases-right">{item.qty}</td>
                    <td className="purchases-right">{formatCurrency(item.unitCostPrice)}</td>
                    <td className="purchases-right">{formatCurrency(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="purchases-card">
        <div className="purchases-head">
          <div>
            <h2>Totals</h2>
            <p>Payment and balance summary for this purchase.</p>
          </div>
          <div className="purchases-actions">
            <button
              type="button"
              className="purchases-button"
              onClick={() => setShowPaymentModal(true)}
              disabled={purchase.status === "PAID"}
            >
              Add Payment
            </button>
            <Link className="purchases-button-ghost" to="/purchases">
              Back to List
            </Link>
          </div>
        </div>

        <div className="purchases-summary">
          <div>
            <span>Subtotal</span>
            <strong>{formatCurrency(purchase.subtotal)}</strong>
          </div>
          <div>
            <span>Invoice Discount</span>
            <strong>-{formatCurrency(purchase.invoiceDiscountAmount)}</strong>
          </div>
          <div>
            <span>Tax</span>
            <strong>{formatCurrency(purchase.taxAmount)}</strong>
          </div>
          <div className="is-grand">
            <span>Total</span>
            <strong>{formatCurrency(purchase.totalAmount)}</strong>
          </div>
          <div>
            <span>Paid</span>
            <strong>{formatCurrency(purchase.paidAmount)}</strong>
          </div>
          <div>
            <span>Balance</span>
            <strong>{formatCurrency(purchase.balanceAmount)}</strong>
          </div>
        </div>
      </section>

      <section className="purchases-card">
        <div className="purchases-head">
          <div>
            <h2>Payments History</h2>
            <p>Recorded supplier payments for this invoice.</p>
          </div>
        </div>
        {(purchase.payments || []).length === 0 ? (
          <p className="purchases-empty">No payments recorded yet.</p>
        ) : (
          <div className="purchases-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="purchases-right">Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(purchase.payments || []).map((payment) => (
                  <tr key={payment._id}>
                    <td>
                      {payment.paidDate
                        ? new Date(payment.paidDate).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="purchases-right">{formatCurrency(payment.amount)}</td>
                    <td>{payment.method || "-"}</td>
                    <td>{payment.referenceNo || "-"}</td>
                    <td>{payment.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showPaymentModal ? (
        <div className="purchases-modal-overlay" role="dialog" aria-modal="true">
          <div className="purchases-modal">
            <div className="purchases-head">
              <div>
                <h2>Add Payment</h2>
                <p>Outstanding balance: {formatCurrency(purchase.balanceAmount)}</p>
              </div>
              <button
                type="button"
                className="purchases-button-ghost"
                onClick={() => setShowPaymentModal(false)}
                disabled={isSavingPayment}
              >
                Close
              </button>
            </div>

            <div className="purchases-grid">
              <div className="purchases-field">
                <label htmlFor="payment-amount">Amount</label>
                <input
                  id="payment-amount"
                  type="number"
                  min="0"
                  value={paymentForm.amount}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                />
              </div>
              <div className="purchases-field">
                <label htmlFor="payment-date">Paid Date</label>
                <input
                  id="payment-date"
                  type="date"
                  value={paymentForm.paidDate}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, paidDate: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="purchases-grid">
              <div className="purchases-field">
                <label htmlFor="payment-method">Method</label>
                <select
                  id="payment-method"
                  value={paymentForm.method}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, method: event.target.value }))
                  }
                >
                  <option value="CASH">CASH</option>
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="BANK">BANK</option>
                </select>
              </div>
              <div className="purchases-field">
                <label htmlFor="payment-ref">Reference No (optional)</label>
                <input
                  id="payment-ref"
                  value={paymentForm.referenceNo}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, referenceNo: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="purchases-field">
              <label htmlFor="payment-note">Note (optional)</label>
              <textarea
                id="payment-note"
                rows={2}
                value={paymentForm.note}
                onChange={(event) =>
                  setPaymentForm((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </div>

            <div className="purchases-actions">
              <button
                type="button"
                className="purchases-button-ghost"
                onClick={() => setShowPaymentModal(false)}
                disabled={isSavingPayment}
              >
                Cancel
              </button>
              <button
                type="button"
                className="purchases-button"
                onClick={savePayment}
                disabled={isSavingPayment}
              >
                Save Payment
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PurchaseDetail;

