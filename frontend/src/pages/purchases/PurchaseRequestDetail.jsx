import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

const STATUS_LABELS = { DRAFT: "Draft", SENT: "Sent", CONVERTED: "Converted" };

// ── Convert-to-Invoice modal ─────────────────────────────────────────────────

function ConvertModal({ request, dealers, onClose, onConverted }) {
  const [inventoryItems, setInventoryItems] = useState([]);
  const [dealerId, setDealerId] = useState(
    request.dealer?._id || request.dealer || ""
  );
  const [dealerInvoiceNumber, setDealerInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [purchaseType, setPurchaseType] = useState("CREDIT");
  const [lineItems, setLineItems] = useState(
    (request.items || []).map((item) => ({
      _ref: item.itemName || "",
      qty: item.quantity || "",
      unitCostPrice: "",
      inventoryItemId: "",
    }))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/inventory")
      .then(({ data }) => setInventoryItems(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const updateLine = (idx, field, value) => {
    setLineItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!dealerId) { setError("Dealer is required"); return; }
    if (!dealerInvoiceNumber.trim()) { setError("Dealer invoice number is required"); return; }
    const payload = {
      dealerId,
      dealerInvoiceNumber: dealerInvoiceNumber.trim(),
      purchaseDate,
      purchaseType,
      items: lineItems.map((row) => ({
        inventoryItemId: row.inventoryItemId,
        qty: Number(row.qty) || 0,
        unitCostPrice: Number(row.unitCostPrice) || 0,
      })),
    };
    setIsSaving(true);
    try {
      const { data } = await api.post(
        `/purchase-requests/${request._id}/convert`,
        payload
      );
      onConverted(data);
    } catch (err) {
      setError(err.response?.data?.message || "Conversion failed. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="purchases-modal-overlay" role="dialog" aria-modal="true">
      <div className="purchases-modal" style={{ width: "min(720px, 100%)" }}>
        <h3 style={{ margin: 0 }}>Convert to Purchase Invoice</h3>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
          Map each requested item to an inventory catalog entry and enter the
          actual pricing from the dealer's invoice.
        </p>

        {error ? <p className="purchases-alert purchases-alert--error">{error}</p> : null}

        <form onSubmit={handleSubmit}>
          <div className="purchases-grid" style={{ marginBottom: 12 }}>
            <div className="purchases-field">
              <label>Dealer</label>
              <select value={dealerId} onChange={(e) => setDealerId(e.target.value)} required>
                <option value="">— Select —</option>
                {dealers.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.dealerCode} — {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="purchases-field">
              <label>Dealer Invoice Number</label>
              <input
                type="text"
                value={dealerInvoiceNumber}
                onChange={(e) => setDealerInvoiceNumber(e.target.value)}
                placeholder="As shown on dealer's invoice"
                required
              />
            </div>
            <div className="purchases-field">
              <label>Purchase Date</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                required
              />
            </div>
            <div className="purchases-field">
              <label>Type</label>
              <select value={purchaseType} onChange={(e) => setPurchaseType(e.target.value)}>
                <option value="CREDIT">Credit</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CASH">Cash</option>
              </select>
            </div>
          </div>

          <p style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 8 }}>
            LINE ITEMS — map each requested item to an inventory item and enter pricing
          </p>
          {lineItems.map((row, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div className="purchases-field">
                {idx === 0 ? <label>Inventory Item</label> : null}
                <select
                  value={row.inventoryItemId}
                  onChange={(e) => updateLine(idx, "inventoryItemId", e.target.value)}
                  required
                >
                  <option value="">— {row._ref || `Item ${idx + 1}`} —</option>
                  {inventoryItems.map((inv) => (
                    <option key={inv._id} value={inv._id}>
                      {inv.sku} — {inv.itemName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="purchases-field">
                {idx === 0 ? <label>Qty</label> : null}
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.qty}
                  onChange={(e) => updateLine(idx, "qty", e.target.value)}
                  required
                />
              </div>
              <div className="purchases-field">
                {idx === 0 ? <label>Unit Cost (LKR)</label> : null}
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={row.unitCostPrice}
                  onChange={(e) => updateLine(idx, "unitCostPrice", e.target.value)}
                  required
                />
              </div>
              <div className="purchases-field">
                {idx === 0 ? <label>Line Total</label> : null}
                <input
                  type="text"
                  readOnly
                  value={formatCurrency((Number(row.qty) || 0) * (Number(row.unitCostPrice) || 0))}
                />
              </div>
            </div>
          ))}

          <div className="purchases-actions" style={{ marginTop: 12 }}>
            <button type="submit" className="purchases-button" disabled={isSaving}>
              {isSaving ? "Creating Invoice..." : "Create Invoice"}
            </button>
            <button type="button" className="purchases-button-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main detail page ─────────────────────────────────────────────────────────

function PurchaseRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [dealers, setDealers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState("");
  const toastTimerRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [reqRes, dlrRes] = await Promise.all([
          api.get(`/purchase-requests/${id}`),
          api.get("/dealers"),
        ]);
        setRequest(reqRes.data);
        setDealers(Array.isArray(dlrRes.data) ? dlrRes.data : []);
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          navigate("/login", { replace: true });
          return;
        }
        setError(err.response?.data?.message || "Unable to load request.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  const showToast = (message, type = "success") => {
    clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  const handleDownloadPdf = () => {
    const url = `${api.defaults.baseURL}/purchase-requests/${id}/pdf`;
    const token = localStorage.getItem("ksc_token");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `purchase-request-${request?.requestNumber || id}.pdf`;
        link.click();
      })
      .catch(() => showToast("Unable to download PDF.", "error"));
  };

  const handleSend = async () => {
    setIsSending(true);
    try {
      await api.post(`/purchase-requests/${id}/send`);
      setRequest((prev) => ({ ...prev, status: "SENT", sentAt: new Date().toISOString() }));
      showToast("Purchase request sent to dealer successfully.");
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to send email.", "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleConverted = (invoice) => {
    setShowConvert(false);
    showToast(`Invoice created: ${invoice.dealerInvoiceNumber}`);
    setRequest((prev) => ({ ...prev, status: "CONVERTED" }));
    setTimeout(() => navigate(`/purchases/${invoice._id}`), 1500);
  };

  if (isLoading) {
    return (
      <div className="purchases-page">
        <PageHeader title="Purchase Request" />
        <p className="purchases-empty">Loading...</p>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="purchases-page">
        <PageHeader title="Purchase Request" />
        <p className="purchases-alert purchases-alert--error">{error || "Not found."}</p>
      </div>
    );
  }

  const status = request.status || "DRAFT";
  const canSend = status !== "CONVERTED";
  const canConvert = status === "SENT";

  return (
    <div className="purchases-page">
      <PageHeader title={`Purchase Request — ${request.requestNumber || ""}`} />

      {toast ? (
        <p
          className={`purchases-alert purchases-alert--${toast.type === "error" ? "error" : "success"}`}
        >
          {toast.message}
        </p>
      ) : null}

      <section className="purchases-card">
        <div className="purchases-head">
          <div>
            <h2>{request.requestNumber || "—"}</h2>
            <p style={{ margin: "4px 0 0" }}>
              <span className={`purchase-status purchase-status--pr-${status.toLowerCase()}`}>
                {STATUS_LABELS[status] || status}
              </span>
              {request.sentAt ? (
                <span style={{ marginLeft: 10, color: "#64748b", fontSize: 12 }}>
                  Sent {new Date(request.sentAt).toLocaleDateString()}
                </span>
              ) : null}
            </p>
          </div>
          <div className="purchases-actions">
            <button type="button" className="purchases-button-ghost" onClick={handleDownloadPdf}>
              Download PDF
            </button>
            {canSend ? (
              <button
                type="button"
                className="purchases-button-ghost"
                onClick={handleSend}
                disabled={isSending}
              >
                {isSending ? "Sending..." : "Send to Dealer"}
              </button>
            ) : null}
            {canConvert ? (
              <button
                type="button"
                className="purchases-button"
                onClick={() => setShowConvert(true)}
              >
                Convert to Invoice
              </button>
            ) : null}
          </div>
        </div>

        <div className="purchases-grid">
          <div>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>DEALER</p>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {request.dealerSnapshot?.dealerCode || "—"} —{" "}
              {request.dealerSnapshot?.name || "—"}
            </p>
            {request.dealerSnapshot?.address ? (
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "#475569" }}>
                {request.dealerSnapshot.address}
              </p>
            ) : null}
            {request.dealerSnapshot?.email ? (
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "#475569" }}>
                {request.dealerSnapshot.email}
              </p>
            ) : null}
          </div>
          <div>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>DATE</p>
            <p style={{ margin: 0 }}>
              {request.requestDate
                ? new Date(request.requestDate).toLocaleDateString()
                : "—"}
            </p>
          </div>
        </div>

        <div className="purchases-table" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Description</th>
                <th>Part No.</th>
                <th className="purchases-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {(request.items || []).map((item, idx) => (
                <tr key={idx}>
                  <td>{item.itemName || "—"}</td>
                  <td>{item.itemDescription || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td>{item.partNumber || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  <td className="purchases-right">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {request.notes ? (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>NOTES</p>
            <p style={{ margin: 0, fontSize: 13 }}>{request.notes}</p>
          </div>
        ) : null}
      </section>

      {showConvert ? (
        <ConvertModal
          request={request}
          dealers={dealers}
          onClose={() => setShowConvert(false)}
          onConverted={handleConverted}
        />
      ) : null}
    </div>
  );
}

export default PurchaseRequestDetail;
