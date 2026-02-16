import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { useLocalStorageState } from "../../hooks/useLocalStorageState.js";
import api from "../../services/api.js";
import { getJobCards } from "../../utils/storage.js";
import { formatFreeLaborRewardLabel } from "../../utils/loyaltyPricing.js";
import "./InvoiceView.css";

function InvoiceView() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState("UNPAID");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasPrinted, setHasPrinted] = useState(false);
  const [localJobCards, setLocalJobCards] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [customers] = useLocalStorageState("ksc_customers", []);
  const [vehicles] = useLocalStorageState("ksc_vehicles", []);
  const navigate = useNavigate();
  const location = useLocation();
  const shouldPrint =
    new URLSearchParams(location.search).get("print") === "1";

  useEffect(() => {
    const loadInvoice = async () => {
      setError("");
      try {
        const { data } = await api.get(`/invoices/${id}`);
        setInvoice(data);
        setPaymentStatus(data.paymentStatus || "UNPAID");
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          navigate("/login", { replace: true });
          return;
        }
        setError(
          error.response?.data?.message ||
            "Unable to load invoice details."
        );
      }
    };
    loadInvoice();
  }, [id, navigate]);

  useEffect(() => {
    const loadServices = async () => {
      try {
        const { data } = await api.get("/services");
        setServiceTypes(Array.isArray(data) ? data : []);
      } catch (error) {
        setServiceTypes([]);
      }
    };
    loadServices();
  }, []);

  useEffect(() => {
    try {
      setLocalJobCards(getJobCards());
    } catch (storageError) {
      setLocalJobCards([]);
    }
  }, []);

  useEffect(() => {
    if (shouldPrint && invoice && !hasPrinted) {
      setHasPrinted(true);
      const previousTitle = document.title;
      document.title = `Invoice ${invoice.invoiceNumber}`;
      setTimeout(() => window.print(), 300);
      setTimeout(() => {
        document.title = previousTitle;
      }, 1000);
    }
  }, [shouldPrint, invoice, hasPrinted]);

  const localJobCard = useMemo(() => {
    if (!invoice) return null;
    const jobCardId = invoice?.jobCard?._id || invoice?.jobCard;
    return (
      localJobCards.find(
        (job) =>
          String(job.mongoId) === String(jobCardId) ||
          job.id === invoice.jobCardNo
      ) || null
    );
  }, [invoice, localJobCards]);
  const serviceTypeMap = useMemo(() => {
    return new Map(
      serviceTypes.map((service) => [
        String(service._id || service.id),
        service,
      ])
    );
  }, [serviceTypes]);
  if (!invoice) {
    return (
      <div className="invoice-view">
        <div className="no-print">
          <PageHeader title="Invoice" />
        </div>
        <div className="invoice-shell invoice-shell--loading">
          {error ? (
            <p className="invoice-error">{error}</p>
          ) : (
            <p>Loading invoice...</p>
          )}
          <Link className="invoice-link no-print" to="/invoices">
            Back to invoices
          </Link>
        </div>
      </div>
    );
  }

  const localOwnerId =
    localJobCard?.ownerId || localJobCard?.customerId || "";
  const localCustomer =
    customers.find((customer) => customer.id === localOwnerId) || null;
  const localVehicle =
    vehicles.find((vehicle) => vehicle.id === localJobCard?.vehicleId) || null;
  const customerName =
    invoice.customerName ||
    invoice.customer?.name ||
    localCustomer?.name ||
    "Unknown";
  const customerPhone =
    invoice.customerPhone ||
    invoice.customer?.phone ||
    localCustomer?.phone ||
    "-";
  const vehicleNumber =
    invoice.vehicleNumber ||
    invoice.vehicle?.vehicleNumber ||
    localVehicle?.vehicleNumber ||
    "Unknown";
  const vehicleBrand =
    invoice.vehicleBrand ||
    invoice.vehicle?.brand ||
    localVehicle?.brandName ||
    localVehicle?.brand ||
    "-";
  const vehicleModel =
    invoice.vehicleModel ||
    invoice.vehicle?.model ||
    localVehicle?.modelName ||
    localVehicle?.model ||
    "-";
  const serviceEntries =
    invoice.services ||
    invoice.jobCardServices ||
    localJobCard?.services ||
    [];
  const serviceList = Array.isArray(serviceEntries)
    ? serviceEntries.filter(Boolean)
    : [];
  const resolveServiceName = (service) => {
    const directName = service.serviceName || service.name;
    if (directName) return directName;
    const key = String(service.serviceType || service._id || service.id || "");
    return serviceTypeMap.get(key)?.name || key || "Service";
  };

  const isPaid = invoice.paymentStatus === "PAID";
  const paymentState =
    (invoice.paymentStatus || "UNPAID").toString().toUpperCase();
  const statusLabel =
    invoice.status === "DRAFT" ? "DRAFT" : paymentState;
  const statusClass = statusLabel.toLowerCase();
  const formatCurrency = (value) => {
    const number = Number(value);
    if (Number.isNaN(number)) return "-";
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      maximumFractionDigits: 2,
    }).format(number);
  };
  const derivedPartsSubtotalOriginal = (invoice.partsUsed || []).reduce((sum, part) => {
    const qty = Number(part.quantity) || 0;
    const unit =
      Number(part.unitPriceOriginal) || Number(part.unitPrice) || 0;
    const line =
      Number(part.lineTotalOriginal) || (qty > 0 && unit > 0 ? qty * unit : 0);
    return sum + line;
  }, 0);
  const derivedPartsDiscountTotal = (invoice.partsUsed || []).reduce(
    (sum, part) => sum + (Number(part.lineDiscountTotal) || 0),
    0
  );
  const derivedPartsSubtotalNet = (invoice.partsUsed || []).reduce((sum, part) => {
    const qty = Number(part.quantity) || 0;
    const unit =
      Number(part.unitPriceNet) || Number(part.unitPrice) || 0;
    const line =
      Number(part.lineTotal) || (qty > 0 && unit > 0 ? qty * unit : 0);
    return sum + line;
  }, 0);
  const partsSubtotalOriginal =
    invoice.subtotalPartsOriginal !== undefined &&
    invoice.subtotalPartsOriginal !== null
      ? Number(invoice.subtotalPartsOriginal) || 0
      : derivedPartsSubtotalOriginal;
  const partsDiscountTotal =
    invoice.partsDiscountTotal !== undefined &&
    invoice.partsDiscountTotal !== null
      ? Number(invoice.partsDiscountTotal) || 0
      : derivedPartsDiscountTotal;
  const partsSubtotal =
    invoice.subtotalParts !== undefined && invoice.subtotalParts !== null
      ? Number(invoice.subtotalParts) || 0
      : derivedPartsSubtotalNet;
  const laborChargesOriginal =
    invoice.laborChargesOriginal !== undefined &&
    invoice.laborChargesOriginal !== null
      ? Number(invoice.laborChargesOriginal) || 0
      : Number(invoice.laborCharges) || 0;
  const loyaltyLaborDiscount =
    invoice.loyaltyLaborDiscount !== undefined &&
    invoice.loyaltyLaborDiscount !== null
      ? Number(invoice.loyaltyLaborDiscount) || 0
      : Number(invoice.discount) || 0;
  const laborChargesNet =
    invoice.laborChargesNet !== undefined && invoice.laborChargesNet !== null
      ? Number(invoice.laborChargesNet) || 0
      : Math.max(laborChargesOriginal - loyaltyLaborDiscount, 0);
  const grandTotal =
    invoice.totalAmount !== undefined && invoice.totalAmount !== null
      ? Number(invoice.totalAmount) || 0
      : Math.max(partsSubtotal + laborChargesNet, 0);
  const hasFreeLaborReward = (invoice.appliedRewards || []).some(
    (reward) =>
      String(reward.rewardType || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_") === "free_labor"
  );

  const formatRewardSummary = (reward) => {
    const rewardType = String(reward?.rewardType || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (rewardType === "free_labor") {
      return formatFreeLaborRewardLabel(reward);
    }
    return reward?.rewardType || "Reward";
  };

  const finalizeInvoice = async () => {
    setIsSaving(true);
    setError("");
    try {
      const { data } = await api.patch(`/invoices/${invoice._id}`, {
        status: "FINALIZED",
      });
      setInvoice(data);
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Unable to finalize invoice. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handlePaymentUpdate = async () => {
    setIsSaving(true);
    setError("");
    try {
      const { data } = await api.patch(`/invoices/${invoice._id}`, {
        paymentStatus,
      });
      setInvoice(data);
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Unable to update payment status. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="invoice-view">
      <div className="no-print">
        <PageHeader title={`Invoice ${invoice.invoiceNumber}`} />
      </div>
      <div className="invoice-shell">
        <header className="invoice-header">
          <div className="invoice-brand">
            <div className="invoice-logo" aria-hidden="true">
              Logo
            </div>
            <div className="invoice-brand-details">
              <h1>Service Center</h1>
              <p>123 Service Lane, Colombo</p>
              <p>+94 11 234 5678 · service@center.lk</p>
            </div>
          </div>
          <div className="invoice-header-meta">
            <button
              type="button"
              className="invoice-print-button no-print"
              onClick={() => window.print()}
            >
              Print Invoice
            </button>
            <div className="invoice-title-block">
              <span className="invoice-title">INVOICE</span>
              <span className="invoice-number">{invoice.invoiceNumber}</span>
              <span className={`invoice-status invoice-status--${statusClass}`}>
                {statusLabel}
              </span>
            </div>
          </div>
        </header>

        {error ? <p className="invoice-error">{error}</p> : null}

        <section className="invoice-info-grid">
          <div>
            <h2>Invoice Information</h2>
            <div className="invoice-info-row">
              <span>Invoice No</span>
              <strong>{invoice.invoiceNumber}</strong>
            </div>
            <div className="invoice-info-row">
              <span>Invoice Date</span>
              <strong>
                {invoice.createdAt
                  ? new Date(invoice.createdAt).toLocaleDateString()
                  : "-"}
              </strong>
            </div>
            <div className="invoice-info-row">
              <span>Job Card No</span>
              <strong>{invoice.jobCardNo || "-"}</strong>
            </div>
          </div>
          <div>
            <h2>Customer & Vehicle</h2>
            <div className="invoice-info-row">
              <span>Customer Name</span>
              <strong>{customerName}</strong>
            </div>
            <div className="invoice-info-row">
              <span>Phone Number</span>
              <strong>{customerPhone}</strong>
            </div>
            <div className="invoice-info-row">
              <span>Vehicle</span>
              <strong>
                {vehicleNumber} · {vehicleBrand} · {vehicleModel}
              </strong>
            </div>
          </div>
        </section>

        <section className="invoice-section">
          <div className="invoice-section-head">
            <h2>Materials Used</h2>
          </div>
          {(invoice.partsUsed || []).length === 0 ? (
            <p className="invoice-muted">No materials used.</p>
          ) : (
            <div className="invoice-table">
              <table>
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th className="table-right">Quantity</th>
                    <th className="table-right">Unit Price (Original)</th>
                    <th className="table-right">Discount</th>
                    <th className="table-right">Unit Price (Net)</th>
                    <th className="table-right">Line Total (Net)</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.partsUsed || []).map((part, index) => {
                    const qty = Number(part.quantity) || 0;
                    const unitOriginal =
                      Number(part.unitPriceOriginal) || Number(part.unitPrice) || 0;
                    const discountLine = Number(part.lineDiscountTotal) || 0;
                    const unitNet =
                      Number(part.unitPriceNet) ||
                      Math.max(0, (Number(part.lineTotal) || 0) / Math.max(1, qty));
                    const line = Number(part.lineTotal) || (qty > 0 ? qty * unitNet : 0);
                    return (
                      <tr key={`${part.sku}-${index}`}>
                        <td>{part.itemName || "Part"}</td>
                        <td className="table-right">{qty || "-"}</td>
                        <td className="table-right">{formatCurrency(unitOriginal)}</td>
                        <td className="table-right">-{formatCurrency(discountLine)}</td>
                        <td className="table-right">{formatCurrency(unitNet)}</td>
                        <td className="table-right">{formatCurrency(line)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="invoice-section">
          <div className="invoice-section-head">
            <h2>Services & Tasks</h2>
          </div>
          {serviceList.length === 0 ? (
            <p className="invoice-muted">No services listed.</p>
          ) : (
            <div className="invoice-services">
              {serviceList.map((service, index) => {
                const tasks = Array.isArray(service.tasks)
                  ? service.tasks.filter((task) => task?.title)
                  : [];
                return (
                  <div
                    key={`${service.serviceType || service._id || index}`}
                    className="invoice-service-card"
                  >
                    <div className="invoice-service-head">
                      <strong>
                        {resolveServiceName(service)}
                      </strong>
                      <span>{tasks.length ? `${tasks.length} tasks` : "No tasks"}</span>
                    </div>
                    {tasks.length ? (
                      <ul className="invoice-service-tasks">
                        {tasks.map((task, taskIndex) => (
                          <li key={`${task.title}-${taskIndex}`}>
                            <span>{task.title}</span>
                            <span>
                              {task.completed ? "Completed" : "Pending"}
                              {task.isRequired ? " · Required" : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="invoice-muted">
                        No tasks were recorded for this service.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="invoice-section invoice-split">
          <div>
            <h2>Labor Charges</h2>
            <div className="invoice-labor">
              <div className="invoice-summary-row">
                <span>Labor Charges (Original)</span>
                <strong>{formatCurrency(laborChargesOriginal)}</strong>
              </div>
              {hasFreeLaborReward || loyaltyLaborDiscount > 0 ? (
                <div className="invoice-summary-row" style={{ color: "#16a34a" }}>
                  <span>Loyalty Discount (Free Labor)</span>
                  <strong>-{formatCurrency(loyaltyLaborDiscount)}</strong>
                </div>
              ) : null}
              <div className="invoice-summary-row">
                <span>Labor Charges (Net)</span>
                <strong>{formatCurrency(laborChargesNet)}</strong>
              </div>
              {invoice.laborDescription ? (
                <p>{invoice.laborDescription}</p>
              ) : null}
            </div>

            {invoice.appliedRewards?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h2>Loyalty Rewards</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {invoice.appliedRewards.map((reward, idx) => (
                    <div
                      key={reward.ruleId || idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "4px 8px",
                        background: "#f0fdf4",
                        borderRadius: 4,
                        border: "1px solid #bbf7d0",
                        fontSize: 13,
                      }}
                    >
                      <span>
                        {reward.ruleName || "Loyalty Reward"}
                        <span style={{ color: "#6b7280", marginLeft: 6, fontSize: 12 }}>
                          ({formatRewardSummary(reward)})
                        </span>
                      </span>
                      {reward.discountAmount > 0 && (
                        <strong style={{ color: "#16a34a" }}>
                          -{formatCurrency(reward.discountAmount)}
                        </strong>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="invoice-summary">
            <h2>Summary</h2>
            <div className="invoice-summary-row">
              <span>Materials Subtotal (Original)</span>
              <strong>{formatCurrency(partsSubtotalOriginal)}</strong>
            </div>
            <div className="invoice-summary-row" style={{ color: "#16a34a" }}>
              <span>Items Discount</span>
              <strong>-{formatCurrency(partsDiscountTotal)}</strong>
            </div>
            <div className="invoice-summary-row">
              <span>Materials Subtotal (After item discounts)</span>
              <strong>{formatCurrency(partsSubtotal)}</strong>
            </div>
            <div className="invoice-summary-row">
              <span>Labor Charges (Original)</span>
              <strong>{formatCurrency(laborChargesOriginal)}</strong>
            </div>
            {hasFreeLaborReward || loyaltyLaborDiscount > 0 ? (
              <div className="invoice-summary-row" style={{ color: "#16a34a" }}>
                <span>
                  Loyalty Discount (Free Labor)
                  {invoice.appliedRewards?.length > 0 && (
                    <small style={{ display: "block", fontSize: 11, color: "#6b7280" }}>
                      {invoice.appliedRewards.map((r) => r.ruleName).filter(Boolean).join(", ")}
                    </small>
                  )}
                </span>
                <strong>-{formatCurrency(loyaltyLaborDiscount)}</strong>
              </div>
            ) : null}
            <div className="invoice-summary-row">
              <span>Labor Charges (Net)</span>
              <strong>{formatCurrency(laborChargesNet)}</strong>
            </div>
            <div className="invoice-summary-total">
              <span>Grand Total</span>
              <strong>{formatCurrency(grandTotal)}</strong>
            </div>
          </div>
        </section>

        <section className="invoice-section invoice-controls no-print">
          <div>
            <h2>Payment Status</h2>
            <label htmlFor="invoice-payment-status">Status</label>
            <select
              id="invoice-payment-status"
              value={paymentStatus}
              onChange={(event) => setPaymentStatus(event.target.value)}
              disabled={invoice.status !== "FINALIZED" || isPaid}
            >
              <option value="UNPAID">UNPAID</option>
              <option value="PARTIAL">PARTIAL</option>
              <option value="PAID">PAID</option>
            </select>
            <div>
              <button
                type="button"
                onClick={handlePaymentUpdate}
                disabled={invoice.status !== "FINALIZED" || isSaving || isPaid}
              >
                Update Payment Status
              </button>
            </div>
          </div>
          <div>
            <h2>Actions</h2>
            <button
              type="button"
              onClick={finalizeInvoice}
              disabled={invoice.status === "FINALIZED" || isSaving || isPaid}
            >
              Finalize Invoice
            </button>
          </div>
        </section>

        <div className="invoice-footer no-print">
          <Link className="invoice-link" to="/invoices">
            Back to invoices
          </Link>
        </div>
      </div>
    </div>
  );
}

export default InvoiceView;
