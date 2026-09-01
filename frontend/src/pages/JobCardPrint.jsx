import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./JobCardPrint.css";

const COMPANY_INFO = {
  name: "Senavi Auto Care",
  branch: "Main Workshop",
  address: "123 Service Lane, Colombo",
  phone: "+94 11 234 5678",
};
const ADDITIONAL_BLANK_TASK_ROWS = 8;

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const formatMoney = (value) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

function JobCardPrint() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [jobCard, setJobCard] = useState(null);
  const [error, setError] = useState("");
  const [hasPrinted, setHasPrinted] = useState(false);

  const shouldAutoPrint = useMemo(
    () => new URLSearchParams(location.search).get("autoprint") === "1",
    [location.search]
  );

  useEffect(() => {
    const loadJobCard = async () => {
      setError("");
      try {
        const { data } = await api.get(`/job-cards/${id}`);
        setJobCard(data);
      } catch (loadError) {
        if (loadError.response?.status === 401 || loadError.response?.status === 403) {
          navigate("/login", { replace: true });
          return;
        }
        setError(
          loadError.response?.data?.message || "Unable to load job card print view."
        );
      }
    };
    loadJobCard();
  }, [id, navigate]);

  useEffect(() => {
    if (!shouldAutoPrint || !jobCard || hasPrinted) return;
    setHasPrinted(true);
    const previousTitle = document.title;
    document.title = `Job Card ${jobCard.jobCardNo || id}`;
    setTimeout(() => window.print(), 250);
    setTimeout(() => {
      document.title = previousTitle;
    }, 900);
  }, [hasPrinted, id, jobCard, shouldAutoPrint]);

  const serviceEntries = useMemo(
    () => (Array.isArray(jobCard?.services) ? jobCard.services : []),
    [jobCard]
  );

  const selectedServiceTypes = useMemo(
    () =>
      serviceEntries
        .map((service) => service?.serviceName || service?.serviceType || "")
        .filter(Boolean),
    [serviceEntries]
  );

  const taskRows = useMemo(() => {
    const serviceRows = serviceEntries.flatMap((service, serviceIndex) => {
      const serviceName =
        service?.serviceName || service?.serviceType || `Service ${serviceIndex + 1}`;
      const tasks = Array.isArray(service?.tasks) ? service.tasks : [];
      if (tasks.length === 0) {
        return [
          {
            id: `${serviceName}-none-${serviceIndex}`,
            serviceName,
            description: "-",
            laborHours: "",
            laborCharge: "",
          },
        ];
      }
      return tasks.map((task, taskIndex) => ({
        id: `${serviceName}-${task?.taskId || task?.title || taskIndex}`,
        serviceName,
        description: task?.title || task?.taskName || "-",
        assignedStaff:
          task?.assignedStaffSnapshot?.employeeNo && task?.assignedStaffSnapshot?.name
            ? `${task.assignedStaffSnapshot.employeeNo} - ${task.assignedStaffSnapshot.name}`
            : task?.assignedStaffSnapshot?.name || "-",
        laborHours:
          task?.laborHours === null || task?.laborHours === undefined
            ? ""
            : Number(task.laborHours),
        laborCharge:
          task?.laborCharge === null || task?.laborCharge === undefined
            ? ""
            : Number(task.laborCharge),
      }));
    });

    const customRows = (Array.isArray(jobCard?.customTasks) ? jobCard.customTasks : []).map(
      (task, index) => ({
        id: `custom-task-${index}`,
        serviceName: "Custom Task",
        description: task?.taskName || "-",
        assignedStaff:
          task?.assignedStaffSnapshot?.employeeNo && task?.assignedStaffSnapshot?.name
            ? `${task.assignedStaffSnapshot.employeeNo} - ${task.assignedStaffSnapshot.name}`
            : task?.assignedStaffSnapshot?.name || "-",
        laborHours:
          task?.laborHours === null || task?.laborHours === undefined
            ? ""
            : Number(task.laborHours),
        laborCharge:
          task?.laborCharge === null || task?.laborCharge === undefined
            ? ""
            : Number(task.laborCharge),
      })
    );

    return [...serviceRows, ...customRows];
  }, [serviceEntries, jobCard?.customTasks]);

  const blankTaskRows = useMemo(
    () =>
      Array.from({ length: ADDITIONAL_BLANK_TASK_ROWS }, (_, index) => ({
        id: `blank-task-row-${index + 1}`,
      })),
    []
  );

  const partsUsed = Array.isArray(jobCard?.partsUsed) ? jobCard.partsUsed : [];
  const customer = jobCard?.customer || null;
  const vehicle = jobCard?.vehicle || null;
  const jobNo = jobCard?.jobCardNo || jobCard?.jobNumber || id;
  const createdAt = formatDateTime(jobCard?.createdAt);
  const customerRequests = (jobCard?.workNotes || jobCard?.notes || "").trim();
  const odometer = vehicle?.odometer ?? jobCard?.odometer ?? "";

  return (
    <div className="job-card-print-page">
      <div className="job-card-print-controls no-print">
        <div>
          <PageHeader title={`Job Card ${jobNo}`} />
          <p>Print-ready technician/customer copy.</p>
        </div>
        <div className="job-card-print-controls__actions">
          <button type="button" onClick={() => window.print()}>
            Print Job Card
          </button>
          <Link to="/job-cards">Back to Job Cards</Link>
        </div>
      </div>

      {error ? <p className="job-card-print-error no-print">{error}</p> : null}

      {!jobCard && !error ? (
        <div className="job-card-print-loading">Loading job card...</div>
      ) : null}

      {jobCard ? (
        <article className="job-card-print-sheet">
          <header className="job-card-print-header">
            <div>
              <h1>{COMPANY_INFO.name}</h1>
              <p>{COMPANY_INFO.branch}</p>
              <p>{COMPANY_INFO.address}</p>
              <p>{COMPANY_INFO.phone}</p>
            </div>
            <div className="job-card-print-meta">
              <h2>JOB CARD</h2>
              <div>
                <span>Job No</span>
                <strong>{jobNo}</strong>
              </div>
              <div>
                <span>Date / Time</span>
                <strong>{createdAt}</strong>
              </div>
              <div>
                <span>Ref No</span>
                <strong>-</strong>
              </div>
              <div>
                <span>Customer Code</span>
                <strong>-</strong>
              </div>
              <div>
                <span>Pay Method</span>
                <strong>{jobCard?.paymentStatus || "-"}</strong>
              </div>
            </div>
          </header>

          <section className="job-card-print-section">
            <h3>Customer Details</h3>
            <div className="job-card-print-grid">
              <div>
                <span>Name</span>
                <strong>{customer?.name || "-"}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{customer?.phone || "-"}</strong>
              </div>
              <div className="job-card-print-grid__wide">
                <span>Address</span>
                <strong>{customer?.address || "-"}</strong>
              </div>
            </div>
          </section>

          <section className="job-card-print-section">
            <h3>Vehicle Details</h3>
            <div className="job-card-print-grid">
              <div>
                <span>Vehicle No</span>
                <strong>{vehicle?.vehicleNumber || "-"}</strong>
              </div>
              <div>
                <span>Model</span>
                <strong>{vehicle?.model || "-"}</strong>
              </div>
              <div>
                <span>Frame / Chassis</span>
                <strong>{vehicle?.frameNumber || "-"}</strong>
              </div>
              <div>
                <span>Engine No</span>
                <strong>{vehicle?.engineNumber || "-"}</strong>
              </div>
              <div>
                <span>Odometer</span>
                <strong>{odometer || "-"}</strong>
              </div>
            </div>
          </section>

          <section className="job-card-print-section">
            <h3>Appointment / Delivery</h3>
            <div className="job-card-print-grid">
              <div>
                <span>Appointment</span>
                <strong>____________________</strong>
              </div>
              <div>
                <span>Expected Delivery</span>
                <strong>____________________</strong>
              </div>
            </div>
          </section>

          <section className="job-card-print-section">
            <h3>Selected Service Types</h3>
            {selectedServiceTypes.length === 0 ? (
              <p className="job-card-print-muted">No service types selected.</p>
            ) : (
              <ul className="job-card-print-service-list">
                {selectedServiceTypes.map((serviceType, index) => (
                  <li key={`${serviceType}-${index}`}>{serviceType}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="job-card-print-section">
            <h3>Customer Requests</h3>
            <div className="job-card-print-note">
              {customerRequests || "No additional requests noted."}
            </div>
          </section>

          <section className="job-card-print-section">
            <h3>Service Engineer Instructions / Tasks</h3>
            <table className="job-card-print-table">
              <thead>
                <tr>
                  <th>Service Type</th>
                  <th>Task Description</th>
                  <th>Assigned Staff</th>
                  <th>Hours</th>
                  <th>Charge</th>
                </tr>
              </thead>
              <tbody>
                {taskRows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No task details available.</td>
                  </tr>
                ) : (
                  taskRows.map((task) => (
                    <tr key={task.id}>
                      <td>{task.serviceName}</td>
                      <td>{task.description}</td>
                      <td>{task.assignedStaff}</td>
                      <td>
                        {task.laborHours === "" ? "-" : Number(task.laborHours).toFixed(2)}
                      </td>
                      <td>
                        {task.laborCharge === ""
                          ? "-"
                          : formatMoney(Number(task.laborCharge))}
                      </td>
                    </tr>
                  ))
                )}
                {blankTaskRows.map((blankRow) => (
                  <tr key={blankRow.id} className="job-card-print-table__blank-row">
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="job-card-print-section">
            <h3>Materials</h3>
            {partsUsed.length === 0 ? (
              <p className="job-card-print-muted">No materials recorded at this stage.</p>
            ) : (
              <table className="job-card-print-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {partsUsed.map((part, index) => (
                    <tr key={`${part.inventoryId || part.sku}-${index}`}>
                      <td>{part.sku || "-"}</td>
                      <td>{part.itemName || part.name || "-"}</td>
                      <td>{Number(part.quantity) || 0}</td>
                      <td>{formatMoney(part.lineTotal ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <footer className="job-card-print-footer">
            <div className="job-card-print-signature">
              <div className="job-card-print-signature__line" />
              <span>Engineer Signature</span>
            </div>
            <div className="job-card-print-signature">
              <div className="job-card-print-signature__line" />
              <span>Customer Signature</span>
            </div>
          </footer>

          <p className="job-card-print-terms">
            Note: Please verify listed services and materials before vehicle release.
          </p>
        </article>
      ) : null}
    </div>
  );
}

export default JobCardPrint;
