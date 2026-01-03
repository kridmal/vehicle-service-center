import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import { useLocalStorageState } from "../hooks/useLocalStorageState.js";
import "./VehicleProfile.css";

const HISTORY_PAGE_SIZE = 8;
const REPORT_PAGE_SIZE = 4;

function VehicleProfile() {
  const { id } = useParams();
  const [customers] = useLocalStorageState("ksc_customers", []);
  const [vehicles] = useLocalStorageState("ksc_vehicles", []);
  const [jobCards] = useLocalStorageState("ksc_job_cards", []);
  const [services, setServices] = useLocalStorageState("ksc_services", []);
  const [historyPage, setHistoryPage] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const [activeJobCardId, setActiveJobCardId] = useState("");
  const [invoiceMap, setInvoiceMap] = useState({});
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");

  useEffect(() => {
    const loadServices = async () => {
      try {
        const { data } = await api.get("/services");
        setServices(Array.isArray(data) ? data : []);
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
        }
      }
    };
    loadServices();
  }, []);

  const serviceMap = useMemo(
    () =>
      new Map(services.map((service) => [String(service._id || service.id), service])),
    [services]
  );

  const vehicle = useMemo(
    () => vehicles.find((entry) => String(entry.id) === String(id)) || null,
    [vehicles, id]
  );

  const currentOwnerId = vehicle?.currentOwnerId || vehicle?.customerId || "";
  const currentOwner =
    customers.find((customer) => customer.id === currentOwnerId) || null;

  const vehicleJobs = useMemo(() => {
    return jobCards
      .filter((job) => String(job.vehicleId) === String(id))
      .sort((a, b) => {
        const aStamp = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bStamp = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bStamp - aStamp;
      });
  }, [jobCards, id]);

  const completedJobs = useMemo(
    () =>
      vehicleJobs.filter((job) =>
        ["COMPLETED", "CLOSED"].includes(job.status)
      ),
    [vehicleJobs]
  );

  useEffect(() => {
    const loadInvoices = async () => {
      const targetJobs = completedJobs.filter((job) => job.mongoId);
      if (targetJobs.length === 0) {
        setInvoiceMap({});
        return;
      }
      setInvoiceLoading(true);
      setInvoiceError("");
      try {
        const responses = await Promise.all(
          targetJobs.map((job) =>
            api.get("/invoices", { params: { jobCardId: job.mongoId } })
          )
        );
        const nextMap = {};
        responses.forEach((response, index) => {
          const invoice = Array.isArray(response.data)
            ? response.data[0]
            : null;
          nextMap[targetJobs[index].id] = invoice || null;
        });
        setInvoiceMap(nextMap);
      } catch (error) {
        setInvoiceError(
          error.response?.data?.message ||
            "Unable to load invoice information."
        );
      } finally {
        setInvoiceLoading(false);
      }
    };
    loadInvoices();
  }, [completedJobs]);

  const stats = useMemo(() => {
    if (vehicleJobs.length === 0) {
      return { total: 0, first: "-", last: "-" };
    }
    const first = vehicleJobs[vehicleJobs.length - 1]?.createdAt;
    const last = vehicleJobs[0]?.createdAt;
    return {
      total: vehicleJobs.length,
      first: first ? new Date(first).toLocaleDateString() : "-",
      last: last ? new Date(last).toLocaleDateString() : "-",
    };
  }, [vehicleJobs]);

  const resolveServices = (servicesList = []) =>
    servicesList
      .map((entry) => {
        const serviceType =
          typeof entry === "string" ? entry : entry?.serviceType;
        return serviceMap.get(String(serviceType))?.name || serviceType;
      })
      .filter(Boolean)
      .join(", ");

  const resolveOwnerForJob = (job) => {
    const ownerId = job?.ownerId || job?.customerId || "";
    return customers.find((customer) => customer.id === ownerId) || null;
  };

  const historyPages = Math.max(
    1,
    Math.ceil(vehicleJobs.length / HISTORY_PAGE_SIZE)
  );
  const reportPages = Math.max(
    1,
    Math.ceil(completedJobs.length / REPORT_PAGE_SIZE)
  );
  const historySlice = vehicleJobs.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  );
  const reportSlice = completedJobs.slice(
    (reportsPage - 1) * REPORT_PAGE_SIZE,
    reportsPage * REPORT_PAGE_SIZE
  );

  const activeJobCard = vehicleJobs.find(
    (job) => job.id === activeJobCardId
  );

  if (!vehicle) {
    return (
      <div className="vehicle-profile">
        <PageHeader title="Vehicle Profile" />
        <p className="vehicle-profile-muted">Vehicle not found.</p>
        <Link className="vehicle-profile-link" to="/vehicles">
          Back to vehicles
        </Link>
      </div>
    );
  }

  return (
    <div className="vehicle-profile">
      <div className="vehicle-profile__header">
        <div>
          <PageHeader title="Vehicle Profile" />
          <p className="vehicle-profile__subtitle">
            Complete vehicle history and service reporting.
          </p>
        </div>
        <Link className="vehicle-profile-link" to="/vehicles">
          Back to vehicles
        </Link>
      </div>

      <section className="vehicle-profile__section">
        <h2>Vehicle Identity</h2>
        <div className="vehicle-profile__grid">
          <div>
            <span>Registration</span>
            <strong>{vehicle.vehicleNumber}</strong>
          </div>
          <div>
            <span>Brand</span>
            <strong>{vehicle.brandName || vehicle.brand || "-"}</strong>
          </div>
          <div>
            <span>Model</span>
            <strong>{vehicle.modelName || vehicle.model || "-"}</strong>
          </div>
          <div>
            <span>Year</span>
            <strong>{vehicle.year}</strong>
          </div>
        </div>
      </section>

      <section className="vehicle-profile__section">
        <h2>Current Owner</h2>
        <div className="vehicle-profile__grid">
          <div>
            <span>Name</span>
            <strong>{currentOwner?.name || "Unknown"}</strong>
          </div>
          <div>
            <span>Mobile</span>
            <strong>{currentOwner?.phone || "-"}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{currentOwner?.email || "-"}</strong>
          </div>
        </div>
      </section>

      <section className="vehicle-profile__section">
        <h2>Vehicle Statistics</h2>
        <div className="vehicle-profile__grid vehicle-profile__grid--stats">
          <div>
            <span>Total Visits</span>
            <strong>{stats.total}</strong>
          </div>
          <div>
            <span>First Service</span>
            <strong>{stats.first}</strong>
          </div>
          <div>
            <span>Last Service</span>
            <strong>{stats.last}</strong>
          </div>
        </div>
      </section>

      <section className="vehicle-profile__section">
        <div className="vehicle-profile__head">
          <h2>Service History</h2>
          <div className="vehicle-profile__pager">
            <button
              type="button"
              onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
              disabled={historyPage === 1}
            >
              Prev
            </button>
            <span>
              Page {historyPage} of {historyPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setHistoryPage((prev) => Math.min(historyPages, prev + 1))
              }
              disabled={historyPage === historyPages}
            >
              Next
            </button>
          </div>
        </div>
        {historySlice.length === 0 ? (
          <p className="vehicle-profile-muted">
            No service history available for this vehicle.
          </p>
        ) : (
          <>
            <div className="vehicle-profile__table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Job Card</th>
                    <th>Service Type</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {historySlice.map((job) => (
                    <tr key={job.id}>
                      <td>
                        {job.createdAt
                          ? new Date(job.createdAt).toLocaleDateString()
                          : "-"}
                      </td>
                      <td>{job.id}</td>
                      <td>{resolveServices(job.services ?? []) || "-"}</td>
                      <td>{job.status || "OPEN"}</td>
                      <td>
                        <button
                          type="button"
                          className="vehicle-profile__action"
                          onClick={() =>
                            setActiveJobCardId((prev) =>
                              prev === job.id ? "" : job.id
                            )
                          }
                        >
                          View Job Card
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {activeJobCard ? (
              <div className="vehicle-profile__detail">
                <div className="vehicle-profile__detail-head">
                  <h3>Job Card {activeJobCard.id}</h3>
                  <button
                    type="button"
                    onClick={() => setActiveJobCardId("")}
                  >
                    Close
                  </button>
                </div>
                <div className="vehicle-profile__detail-grid">
                  <div>
                    <span>Owner at Service</span>
                    <strong>
                      {resolveOwnerForJob(activeJobCard)?.name || "Unknown"}
                    </strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{activeJobCard.status || "OPEN"}</strong>
                  </div>
                  <div>
                    <span>Service Type</span>
                    <strong>
                      {resolveServices(activeJobCard.services ?? []) || "-"}
                    </strong>
                  </div>
                  <div>
                    <span>Notes</span>
                    <strong>{activeJobCard.notes || activeJobCard.workNotes || "-"}</strong>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="vehicle-profile__section">
        <div className="vehicle-profile__head">
          <h2>Previous Reports</h2>
          <div className="vehicle-profile__pager">
            <button
              type="button"
              onClick={() => setReportsPage((prev) => Math.max(1, prev - 1))}
              disabled={reportsPage === 1}
            >
              Prev
            </button>
            <span>
              Page {reportsPage} of {reportPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setReportsPage((prev) => Math.min(reportPages, prev + 1))
              }
              disabled={reportsPage === reportPages}
            >
              Next
            </button>
          </div>
        </div>
        {invoiceError ? (
          <p className="vehicle-profile-error">{invoiceError}</p>
        ) : null}
        {reportSlice.length === 0 ? (
          <p className="vehicle-profile-muted">
            No completed job cards available.
          </p>
        ) : (
          <div className="vehicle-profile__reports">
            {reportSlice.map((job) => {
              const invoice = invoiceMap[job.id];
              return (
                <details key={job.id} className="vehicle-profile__report-card">
                  <summary>
                    <div>
                      <strong>Job Card {job.id}</strong>
                      <span>
                        {job.createdAt
                          ? new Date(job.createdAt).toLocaleDateString()
                          : "-"}{" "}
                        · {job.status}
                      </span>
                    </div>
                    <span className="vehicle-profile__summary-meta">
                      {resolveServices(job.services ?? []) || "Service"}
                    </span>
                  </summary>
                  <div className="vehicle-profile__report-body">
                    <div className="vehicle-profile__actions">
                      {invoiceLoading ? (
                        <span className="vehicle-profile-muted">Loading invoice...</span>
                      ) : invoice ? (
                        <>
                          <Link
                            className="vehicle-profile__action"
                            to={`/invoices/${invoice._id}`}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path
                                d="M12 5c5.2 0 9.4 3.4 11 7-1.6 3.6-5.8 7-11 7S2.6 15.6 1 12c1.6-3.6 5.8-7 11-7zm0 2c-3.9 0-7 2.3-8.6 5 1.6 2.7 4.7 5 8.6 5s7-2.3 8.6-5c-1.6-2.7-4.7-5-8.6-5zm0 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"
                              />
                            </svg>
                            View Invoice
                          </Link>
                          <Link
                            className="vehicle-profile__action"
                            to={`/invoices/${invoice._id}?print=1`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path
                                d="M12 3a1 1 0 0 1 1 1v9.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L11 13.6V4a1 1 0 0 1 1-1zM4 19a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1z"
                              />
                            </svg>
                            Download PDF
                          </Link>
                        </>
                      ) : (
                        <span className="vehicle-profile-muted">
                          No invoice generated yet.
                        </span>
                      )}
                    </div>

                    <div className="vehicle-profile__detail-grid">
                      <div>
                        <span>Owner at Service</span>
                        <strong>
                          {resolveOwnerForJob(job)?.name || "Unknown"}
                        </strong>
                      </div>
                      <div>
                        <span>Owner Contact</span>
                        <strong>
                          {resolveOwnerForJob(job)?.phone || "-"}
                        </strong>
                      </div>
                      <div>
                        <span>Service Type</span>
                        <strong>{resolveServices(job.services ?? []) || "-"}</strong>
                      </div>
                      <div>
                        <span>Labor Charges</span>
                        <strong>{job.laborCharges ?? 0}</strong>
                      </div>
                    </div>

                    <div className="vehicle-profile__materials">
                      <h4>Materials Used</h4>
                      {(job.partsUsed || []).length === 0 ? (
                        <p className="vehicle-profile-muted">
                          No materials recorded for this job.
                        </p>
                      ) : (
                        <div className="vehicle-profile__table">
                          <table>
                            <thead>
                              <tr>
                                <th>Item</th>
                                <th>Qty</th>
                                <th>Unit Price</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(job.partsUsed || []).map((part) => (
                                <tr
                                  key={part.inventoryId || part.sku || part.itemName}
                                >
                                  <td>{part.itemName || part.sku || "Item"}</td>
                                  <td>{part.quantity}</td>
                                  <td>{part.unitPrice ?? "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default VehicleProfile;
