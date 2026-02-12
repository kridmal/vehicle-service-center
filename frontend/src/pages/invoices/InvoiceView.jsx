import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { useLocalStorageState } from "../../hooks/useLocalStorageState.js";
import api from "../../services/api.js";
import { getJobCards } from "../../utils/storage.js";
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
  const partsSubtotal = (invoice.partsUsed || []).reduce((sum, part) => {
    const qty = Number(part.quantity) || 0;
    const unit = Number(part.unitPrice) || 0;
    const line =
      Number(part.lineTotal) || (qty > 0 && unit > 0 ? qty * unit : 0);
    return sum + line;
  }, 0);
  const laborCharges = Number(invoice.laborCharges) || 0;
  const discountAmount = Number(invoice.discount) || 0;
  const grandTotal =
    Number(invoice.totalAmount) || partsSubtotal + laborCharges - discountAmount;

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
                    <th className="table-right">Unit Price</th>
                    <th className="table-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.partsUsed || []).map((part, index) => {
                    const qty = Number(part.quantity) || 0;
                    const unit = Number(part.unitPrice) || 0;
                    const line =
                      Number(part.lineTotal) || (qty > 0 ? qty * unit : 0);
                    return (
                      <tr key={`${part.sku}-${index}`}>
                        <td>{part.itemName || "Part"}</td>
                        <td className="table-right">{qty || "-"}</td>
                        <td className="table-right">{formatCurrency(unit)}</td>
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
              {invoice.appliedRewards?.some((r) => r.rewardType === "free_labor") ? (
                <>
                  <strong style={{ textDecoration: "line-through", color: "#9ca3af" }}>
                    {formatCurrency(laborCharges)}
                  </strong>
                  <strong style={{ color: "#16a34a", marginLeft: 8 }}>
                    {formatCurrency(0)}
                  </strong>
                  <span style={{ color: "#16a34a", fontSize: 12, marginLeft: 6 }}>
                    (Free Labor Reward)
                  </span>
                </>
              ) : invoice.appliedRewards?.some(
                  (r) => r.rewardType === "discount_percentage" && r.discountAmount > 0
                ) ? (
                <>
                  <strong style={{ textDecoration: "line-through", color: "#9ca3af" }}>
                    {formatCurrency(laborCharges)}
                  </strong>
                  <strong style={{ color: "#16a34a", marginLeft: 8 }}>
                    {formatCurrency(
                      laborCharges -
                        invoice.appliedRewards
                          .filter((r) => r.rewardType === "discount_percentage")
                          .reduce((sum, r) => sum + (r.discountAmount || 0), 0)
                    )}
                  </strong>
                </>
              ) : (
                <strong>{formatCurrency(laborCharges)}</strong>
              )}
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
                          {reward.rewardType === "free_labor" && "(Free Labor)"}
                          {reward.rewardType === "discount_percentage" && `(${reward.rewardValue}% Off)`}
                          {reward.rewardType === "discount_amount" && `(LKR ${reward.rewardValue} Off)`}
                          {reward.rewardType === "free_service" && "(Free Service)"}
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
              <span>Subtotal</span>
              <strong>{formatCurrency(partsSubtotal)}</strong>
            </div>
            <div className="invoice-summary-row">
              <span>Labor Charges</span>
              {discountAmount > 0 && invoice.appliedRewards?.some(
                (r) => r.rewardType === "free_labor" || r.rewardType === "discount_percentage"
              ) ? (
                <strong>
                  <span style={{ textDecoration: "line-through", color: "#9ca3af", marginRight: 8 }}>
                    {formatCurrency(laborCharges)}
                  </span>
                  <span style={{ color: "#16a34a" }}>
                    {formatCurrency(
                      invoice.appliedRewards.some((r) => r.rewardType === "free_labor")
                        ? 0
                        : Math.max(
                            laborCharges -
                              invoice.appliedRewards
                                .filter((r) => r.rewardType === "discount_percentage")
                                .reduce((sum, r) => sum + (r.discountAmount || 0), 0),
                            0
                          )
                    )}
                  </span>
                </strong>
              ) : (
                <strong>{formatCurrency(laborCharges)}</strong>
              )}
            </div>
            {discountAmount ? (
              <div className="invoice-summary-row" style={{ color: "#16a34a" }}>
                <span>
                  Loyalty Discount
                  {invoice.appliedRewards?.length > 0 && (
                    <small style={{ display: "block", fontSize: 11, color: "#6b7280" }}>
                      {invoice.appliedRewards.map((r) => r.ruleName).filter(Boolean).join(", ")}
                    </small>
                  )}
                </span>
                <strong>-{formatCurrency(discountAmount)}</strong>
              </div>
            ) : null}
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
