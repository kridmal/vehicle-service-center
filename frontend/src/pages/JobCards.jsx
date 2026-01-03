import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import { readJson } from "../utils/cache.js";
import { useLocalStorageState } from "../hooks/useLocalStorageState.js";
import "./JobCards.css";

function JobCards() {
  const [allJobs, setAllJobs] = useLocalStorageState("ksc_job_cards", []);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [customers] = useLocalStorageState("ksc_customers", []);
  const [vehicles] = useLocalStorageState("ksc_vehicles", []);
  const [services, setServices] = useLocalStorageState("ksc_services", []);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeJobCard, setActiveJobCard] = useState(null);
  const [workers, setWorkers] = useState(() => {
    const cached = readJson("ksc_staff", []);
    if (!Array.isArray(cached)) return [];
    return cached.filter(
      (member) => member?.active !== false && member?.roleType === "TECHNICAL"
    );
  });
  const [workerSearch, setWorkerSearch] = useState("");
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [assignedWorkerText, setAssignedWorkerText] = useState("");
  const [workerLoadError, setWorkerLoadError] = useState("");
  const [jobStatus, setJobStatus] = useState("OPEN");
  const [paymentStatus, setPaymentStatus] = useState("UNPAID");
  const [billingType, setBillingType] = useState("BILLABLE");
  const [workNotes, setWorkNotes] = useState("");
  const [partsUsed, setPartsUsed] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  const [partQuantity, setPartQuantity] = useState("");
  const [modalError, setModalError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [jobServices, setJobServices] = useState([]);
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoiceError, setInvoiceError] = useState("");
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const loadServices = async () => {
      try {
        const { data } = await api.get("/services");
        setServices(Array.isArray(data) ? data : []);
      } catch (error) {
        if (error.response?.status === 401) {
        }
      }
    };
    loadServices();
  }, []);

  useEffect(() => {
    const loadWorkers = async () => {
      setWorkerLoadError("");
      try {
        const { data } = await api.get("/staff", {
          params: { active: true, roleType: "TECHNICAL" },
        });
        setWorkers(Array.isArray(data) ? data : []);
      } catch (error) {
        if (error.response?.status === 401) {
          return;
        }
        setWorkers([]);
        setWorkerLoadError(
          error.response?.data?.message ||
            "Staff module is temporarily unavailable."
        );
      }
    };
    loadWorkers();
  }, []);

  const lookup = useMemo(() => {
    const customerMap = new Map();
    customers.forEach((customer) => {
      if (!customer) return;
      const keys = [customer.id, customer.mongoId, customer._id].filter(Boolean);
      keys.forEach((key) => customerMap.set(String(key), customer));
    });
    const vehicleMap = new Map();
    vehicles.forEach((vehicle) => {
      if (!vehicle) return;
      const keys = [vehicle.id, vehicle.mongoId, vehicle._id].filter(Boolean);
      keys.forEach((key) => vehicleMap.set(String(key), vehicle));
    });
    const serviceMap = new Map(
      services.map((s) => [String(s._id || s.id), s])
    );
    return { customerMap, vehicleMap, serviceMap };
  }, [customers, vehicles, services]);

  const resolveOwnerId = (job) => job?.ownerId || job?.customerId;
  const resolveOwnerMongoId = (job) => {
    const ownerId = resolveOwnerId(job);
    if (!ownerId) return "";
    const customer = customers.find(
      (entry) =>
        String(entry.id) === String(ownerId) ||
        String(entry.mongoId) === String(ownerId) ||
        String(entry._id) === String(ownerId)
    );
    return customer?.mongoId || "";
  };
  const resolveVehicleMongoId = (job) => {
    if (!job?.vehicleId) return "";
    const vehicle = vehicles.find(
      (entry) =>
        String(entry.id) === String(job.vehicleId) ||
        String(entry.mongoId) === String(job.vehicleId) ||
        String(entry._id) === String(job.vehicleId)
    );
    return vehicle?.mongoId || "";
  };

  const resolveVehicleLinkId = (vehicleId) => {
    if (!vehicleId) return "";
    const vehicle = vehicles.find(
      (entry) =>
        String(entry.id) === String(vehicleId) ||
        String(entry.mongoId) === String(vehicleId) ||
        String(entry._id) === String(vehicleId)
    );
    return vehicle?.id || vehicle?.mongoId || vehicle?._id || vehicleId;
  };

  const statusCounts = useMemo(() => {
    const counts = {
      OPEN: 0,
      IN_PROGRESS: 0,
      PENDING: 0,
      COMPLETED: 0,
    };
    allJobs.forEach((job) => {
      if (job.status === "CLOSED") return;
      const key = job.status || "OPEN";
      if (counts[key] !== undefined) {
        counts[key] += 1;
      }
    });
    return counts;
  }, [allJobs]);

  useEffect(() => {
    let next = allJobs;
    if (activeStatus) {
      next = next.filter((job) => job.status === activeStatus);
    } else {
      next = next.filter(
        (job) => job.status !== "COMPLETED" && job.status !== "CLOSED"
      );
    }

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      next = next.filter((job) => {
        const ownerId = resolveOwnerId(job);
        const customer = lookup.customerMap.get(ownerId);
        const vehicle = lookup.vehicleMap.get(job.vehicleId);
        const customerName = customer?.name?.toLowerCase() || "";
        const vehicleNumber = vehicle?.vehicleNumber?.toLowerCase() || "";
        const jobId = job.id?.toLowerCase() || "";
        return (
          customerName.includes(query) ||
          vehicleNumber.includes(query) ||
          jobId.includes(query)
        );
      });
    }
    setFilteredJobs(next);
  }, [activeStatus, allJobs, lookup, searchQuery]);

  const normalizeJobServices = (services = []) =>
    services
      .map((service) => {
        if (!service) return null;
        if (typeof service === "string") {
          return { serviceType: service, tasks: [] };
        }
        const serviceType =
          service.serviceType || service._id || service.id || "";
        if (!serviceType) return null;
        return {
          serviceType,
          tasks: Array.isArray(service.tasks)
            ? service.tasks
                .map((task) => ({
                  title: task.title,
                  isRequired: Boolean(task.isRequired),
                  completed: Boolean(task.completed),
                  standardLaborHours: Number(task.standardLaborHours) || 0,
                  laborHourRate: Number(task.laborHourRate) || 0,
                  assignedStaffId:
                    task.assignedStaffId || task.staffId || task.workerId || "",
                }))
                .filter((task) => task.title)
            : [],
        };
      })
      .filter(Boolean);

  const resolveServices = (serviceEntries = []) =>
    serviceEntries
      .map((entry) =>
        lookup.serviceMap.get(
          String(typeof entry === "string" ? entry : entry?.serviceType)
        )?.name
      )
      .filter(Boolean)
      .join(", ");

  const isWorkerFallback = Boolean(workerLoadError);
  const noTechnicalStaff = !isWorkerFallback && workers.length === 0;

  const filteredWorkers = useMemo(() => {
    const query = workerSearch.trim().toLowerCase();
    if (!query) return workers;
    return workers.filter((worker) =>
      [worker.fullName, worker.phoneNumber, worker.roleName || worker.role]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query))
    );
  }, [workers, workerSearch]);

  const normalizeAssignedWorkers = (job) => {
    const fromSnapshot =
      Array.isArray(job?.assignedWorkers) && job.assignedWorkers.length
        ? job.assignedWorkers
        : null;
    if (fromSnapshot) {
      return fromSnapshot.map((worker) => ({
        staffId: worker.staffId || worker.workerId || worker._id || worker.id,
        name: worker.name || worker.fullName,
        roleName: worker.roleName || worker.role,
      }));
    }

    const legacy = job?.assignedWorker ? String(job.assignedWorker) : "";
    if (!legacy.trim()) return [];
    return legacy
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => {
        const match = workers.find(
          (worker) => worker.fullName?.toLowerCase() === name.toLowerCase()
        );
        return match
          ? {
              staffId: match._id,
              name: match.fullName,
              roleName: match.roleName || match.role,
            }
          : { name };
      });
  };

  const openModal = async (job) => {
    setActiveJobCard(job);
    setSelectedWorkers(normalizeAssignedWorkers(job));
    setAssignedWorkerText(job.assignedWorker || "");
    setJobStatus(job.status || "OPEN");
    setPaymentStatus(job.paymentStatus || "UNPAID");
    setBillingType(job.billingType || "BILLABLE");
    setWorkNotes(job.workNotes || "");
    setPartsUsed(job.partsUsed || []);
    setJobServices(normalizeJobServices(job.services || []));
    setInventorySearch("");
    setSelectedInventoryId("");
    setPartQuantity("");
    setWorkerSearch("");
    setModalError("");
    setInvoiceData(null);
    setInvoiceError("");
    setIsModalOpen(true);
    try {
      const { data } = await api.get("/inventory");
      setInventoryItems(Array.isArray(data) ? data : []);
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
      }
      setModalError(
        error.response?.data?.message ||
          "Unable to load inventory items right now."
      );
    }

    if (job.mongoId && (job.status === "COMPLETED" || job.status === "CLOSED")) {
      setInvoiceLoading(true);
      try {
        const { data } = await api.get("/invoices", {
          params: { jobCardId: job.mongoId },
        });
        const invoice = Array.isArray(data) ? data[0] : null;
        setInvoiceData(invoice || null);
      } catch (error) {
        setInvoiceError(
          error.response?.data?.message ||
            "Unable to load invoice information."
        );
      } finally {
        setInvoiceLoading(false);
      }
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveJobCard(null);
  };

  const toggleTaskCompletion = (serviceIndex, taskIndex) => {
    setJobServices((prev) =>
      prev.map((service, index) => {
        if (index !== serviceIndex) return service;
        const tasks = (service.tasks || []).map((task, idx) =>
          idx === taskIndex ? { ...task, completed: !task.completed } : task
        );
        return { ...service, tasks };
      })
    );
  };

  const updateTaskAssignment = (serviceIndex, taskIndex, staffId) => {
    setJobServices((prev) =>
      prev.map((service, index) => {
        if (index !== serviceIndex) return service;
        const tasks = (service.tasks || []).map((task, idx) =>
          idx === taskIndex ? { ...task, assignedStaffId: staffId } : task
        );
        return { ...service, tasks };
      })
    );
  };

  const resolveServiceName = (service) =>
    lookup.serviceMap.get(String(service.serviceType))?.name || "Service";

  const filteredInventory = useMemo(() => {
    const query = inventorySearch.trim().toLowerCase();
    if (!query) return inventoryItems;
    return inventoryItems.filter((item) =>
      [
        item.itemName,
        item.name,
        item.brand,
        item.variant,
        item.sku,
      ]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(query))
    );
  }, [inventoryItems, inventorySearch]);

  const selectedInventory = useMemo(
    () =>
      inventoryItems.find(
        (item) => String(item._id || item.id) === selectedInventoryId
      ),
    [inventoryItems, selectedInventoryId]
  );

  const laborChargesTotal = useMemo(() => {
    return jobServices.reduce((sum, service) => {
      const tasks = Array.isArray(service.tasks) ? service.tasks : [];
      return (
        sum +
        tasks.reduce((taskSum, task) => {
          const rate = Number(task.laborHourRate) || 0;
          return taskSum + rate;
        }, 0)
      );
    }, 0);
  }, [jobServices]);

  const laborHoursTotal = useMemo(() => {
    return jobServices.reduce((sum, service) => {
      const tasks = Array.isArray(service.tasks) ? service.tasks : [];
      return (
        sum +
        tasks.reduce((taskSum, task) => {
          const hours = Number(task.standardLaborHours) || 0;
          return taskSum + hours;
        }, 0)
      );
    }, 0);
  }, [jobServices]);

  const materialsTotal = useMemo(() => {
    return partsUsed.reduce((sum, part) => {
      const item = inventoryItems.find(
        (inv) => String(inv._id) === String(part.inventoryId)
      );
      const unitPrice =
        (part.unitPrice ?? Number(item?.sellingPrice)) || 0;
      return sum + (Number(part.quantity) || 0) * unitPrice;
    }, 0);
  }, [inventoryItems, partsUsed]);

  const totalAmount = laborChargesTotal + materialsTotal;

  const addPartUsage = () => {
    if (!selectedInventoryId || !partQuantity) return;
    const qty = Number(partQuantity) || 0;
    if (qty <= 0) return;
    const unitPrice = Number(selectedInventory?.sellingPrice) || 0;
    setPartsUsed((prev) => {
      const existing = prev.find(
        (part) => String(part.inventoryId) === selectedInventoryId
      );
      if (existing) {
        return prev.map((part) =>
          String(part.inventoryId) === selectedInventoryId
            ? {
                ...part,
                quantity: part.quantity + qty,
                unitPrice: part.unitPrice ?? unitPrice,
              }
            : part
        );
      }
      return [
        ...prev,
        {
          inventoryId: selectedInventoryId,
          sku: selectedInventory?.sku,
          quantity: qty,
          unitPrice,
        },
      ];
    });
    setSelectedInventoryId("");
    setInventorySearch("");
    setPartQuantity("");
  };

  const removePartUsage = (identifier) => {
    setPartsUsed((prev) =>
      prev.filter(
        (part) =>
          String(part.inventoryId) !== identifier &&
          String(part.sku) !== identifier
      )
    );
  };

  const toggleWorkerSelection = (worker) => {
    const workerId = worker?._id || worker?.id;
    if (!workerId) return;
    setSelectedWorkers((prev) => {
      const exists = prev.find(
        (entry) => String(entry.staffId) === String(workerId)
      );
      if (exists) {
        return prev.filter(
          (entry) => String(entry.staffId) !== String(workerId)
        );
      }
      return [
        ...prev,
        {
          staffId: workerId,
          name: worker.fullName,
          roleName: worker.roleName || worker.role,
        },
      ];
    });
  };

  const removeSelectedWorker = (workerId, name) => {
    setSelectedWorkers((prev) =>
      prev.filter((worker) => {
        if (workerId) {
          return String(worker.staffId) !== String(workerId);
        }
        return worker.name !== name;
      })
    );
  };

  const handleSave = async () => {
    if (!activeJobCard) return;
    setIsSaving(true);
    setModalError("");
    try {
      let mongoId = activeJobCard.mongoId;
      if (!mongoId) {
        const ownerId = resolveOwnerId(activeJobCard);
        const ownerMongoId = resolveOwnerMongoId(activeJobCard);
        const vehicleMongoId = resolveVehicleMongoId(activeJobCard);
        const { data } = await api.post("/job-cards", {
          jobCardNo: activeJobCard.id,
          ownerId: ownerMongoId || ownerId,
          customerId: ownerMongoId || ownerId,
          vehicleId: vehicleMongoId || activeJobCard.vehicleId,
          services: activeJobCard.services || [],
          status: activeJobCard.status || "OPEN",
          billingType,
          createdAt: activeJobCard.createdAt,
        });
        mongoId = data?._id || data?.id;
      }

      const normalizedAssignments = selectedWorkers
        .map((worker) => ({
          staffId: worker.staffId,
          name: worker.name,
          roleName: worker.roleName,
        }))
        .filter((worker) => worker.staffId || worker.name);
      const assignedWorkerSummary = normalizedAssignments
        .map((worker) => worker.name)
        .filter(Boolean)
        .join(", ");

      const payload = {
        status: jobStatus,
        partsUsed,
        laborCharges: laborChargesTotal,
        workNotes,
        services: jobServices,
        billingType,
      };
      if (isWorkerFallback) {
        payload.assignedWorker = assignedWorkerText.trim();
      } else {
        payload.assignedWorkers = normalizedAssignments;
        payload.assignedWorker = assignedWorkerSummary;
      }
      if (jobStatus === "COMPLETED") {
        payload.paymentStatus = paymentStatus;
      }

      await api.patch(`/job-cards/${mongoId}`, payload);

      const completedAtValue =
        payload.status === "COMPLETED"
          ? activeJobCard.completedAt || new Date().toISOString()
          : activeJobCard.completedAt;
      const updated = allJobs.map((job) =>
        job.id === activeJobCard.id
          ? {
              ...job,
              mongoId,
              assignedWorker: payload.assignedWorker,
              assignedWorkers: payload.assignedWorkers ?? job.assignedWorkers,
              status: payload.status,
              partsUsed: payload.partsUsed,
              laborCharges: payload.laborCharges,
              paymentStatus: payload.paymentStatus ?? job.paymentStatus,
              workNotes: payload.workNotes,
              billingType: payload.billingType ?? job.billingType,
              services: payload.services ?? job.services,
              completedAt: completedAtValue,
            }
          : job
      );
        setAllJobs(updated);
      setActiveJobCard((prev) =>
        prev
          ? {
              ...prev,
              mongoId,
              assignedWorker: payload.assignedWorker,
              assignedWorkers:
                payload.assignedWorkers ?? prev.assignedWorkers,
              status: payload.status,
              partsUsed: payload.partsUsed,
              laborCharges: payload.laborCharges,
              paymentStatus: payload.paymentStatus ?? prev.paymentStatus,
              workNotes: payload.workNotes,
              services: payload.services ?? prev.services,
              completedAt: completedAtValue,
            }
          : prev
      );
      if (!(jobStatus === "COMPLETED" && paymentStatus === "PAID")) {
        closeModal();
      }
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
      }
      setModalError(
        error.response?.data?.message || "Unable to save changes. Try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!activeJobCard?.mongoId) {
      setInvoiceError("Job card sync is required before invoicing.");
      return;
    }
    setInvoiceLoading(true);
    setInvoiceError("");
    try {
      const { data } = await api.post(
        `/invoices/from-job/${activeJobCard.mongoId}`
      );
      setInvoiceData(data);
      navigate(`/invoices/${data._id}`);
    } catch (error) {
      setInvoiceError(
        error.response?.data?.message ||
          "Unable to generate invoice. Please try again."
      );
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleCloseJobCard = async () => {
    if (!activeJobCard?.mongoId) return;
    setIsSaving(true);
    setModalError("");
    try {
      await api.post(`/job-cards/${activeJobCard.mongoId}/close`);
      const updated = allJobs.map((job) =>
        job.id === activeJobCard.id ? { ...job, status: "CLOSED" } : job
      );
        setAllJobs(updated);
      closeModal();
    } catch (error) {
      setModalError(
        error.response?.data?.message ||
          "Unable to close job card. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const statusCards = [
    { key: "OPEN", label: "OPEN" },
    { key: "IN_PROGRESS", label: "IN_PROGRESS" },
    { key: "PENDING", label: "PENDING" },
    { key: "COMPLETED", label: "COMPLETED" },
  ];
  const statusTransitions = {
    OPEN: ["IN_PROGRESS"],
    IN_PROGRESS: ["PENDING", "COMPLETED"],
    PENDING: ["IN_PROGRESS"],
    COMPLETED: [],
    CLOSED: [],
  };
  const currentStatus = activeJobCard?.status || jobStatus;
  const statusOptions = currentStatus
    ? [currentStatus, ...(statusTransitions[currentStatus] || [])].filter(
        (value, index, self) => self.indexOf(value) === index
      )
    : ["OPEN"];
  const isLockedStatus = ["COMPLETED", "CLOSED"].includes(
    activeJobCard?.status
  );
  const isPaidInvoice = invoiceData?.paymentStatus === "PAID";
  const canEditPaymentStatus =
    (activeJobCard?.status === "COMPLETED" || jobStatus === "COMPLETED") &&
    !isPaidInvoice;
  const isReadOnly = isLockedStatus || isPaidInvoice;
  const isBillingLocked = paymentStatus !== "PAID";

  return (
    <div className="job-cards-page">
      <div className="job-cards-header">
        <div>
          <PageHeader title="Job Cards" />
          <p className="job-cards-subtitle">Active and pending jobs</p>
        </div>
        <Link className="job-cards-cta" to="/job-cards/new">
          + New Job Card
        </Link>
      </div>

      <section className="job-cards-status-summary">
        {statusCards.map((status) => (
          <button
            key={status.key}
            type="button"
            className={`status-summary-card status-summary-card--${status.key.toLowerCase()} ${
              activeStatus === status.key
                ? "status-summary-card--active"
                : ""
            }`}
            onClick={() =>
              setActiveStatus((prev) =>
                prev === status.key ? "" : status.key
              )
            }
          >
            <span>{status.label}</span>
            <strong>{statusCounts[status.key]}</strong>
          </button>
        ))}
      </section>

      <div className="job-cards-filters">
        <div className="job-cards-search">
          <label htmlFor="job-card-search">Search</label>
          <input
            id="job-card-search"
            type="search"
            placeholder="Search by job card, vehicle, or owner"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>

      <section className="job-cards-list">
        <div className="job-cards-table">
          <table>
            <thead>
              <tr>
                <th>Job Card No</th>
                <th>Vehicle Number</th>
                <th>Owner Name</th>
                <th>Service Type</th>
                <th>Status</th>
                <th>Created Date</th>
                <th>Completed Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan="8" className="job-cards-empty">
                    No active job cards match your filters.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => {
                  const ownerId = resolveOwnerId(job);
                  const customer =
                    lookup.customerMap.get(String(ownerId)) ||
                    lookup.customerMap.get(String(job.customerId || "")) ||
                    lookup.customerMap.get(String(job.ownerId || ""));
                  const vehicle =
                    lookup.vehicleMap.get(String(job.vehicleId || "")) || null;
                  const jobLabel =
                    job.jobCardNo || job.id || job._id || "—";
                  const vehicleLinkId = resolveVehicleLinkId(job.vehicleId);
                  const status = job.status || "OPEN";
                  const badgeClass =
                    status === "IN_PROGRESS"
                      ? "status-badge status-badge--progress"
                      : status === "COMPLETED"
                      ? "status-badge status-badge--complete"
                      : status === "CLOSED"
                      ? "status-badge status-badge--closed"
                      : "status-badge";
                  return (
                    <tr key={job.id || job._id}>
                      <td>{jobLabel}</td>
                      <td>{vehicle?.vehicleNumber ?? "Unknown"}</td>
                      <td>{customer?.name ?? "Unknown"}</td>
                      <td>{resolveServices(job.services ?? []) || "-"}</td>
                      <td>
                        <span className={badgeClass}>{status}</span>
                      </td>
                      <td>
                        {job.createdAt
                          ? new Date(job.createdAt).toLocaleDateString()
                          : "-"}
                      </td>
                      <td>
                        {job.completedAt
                          ? new Date(job.completedAt).toLocaleDateString()
                          : "-"}
                      </td>
                      <td>
                        <div className="job-cards-actions">
                          <button
                            type="button"
                            className="job-cards-action"
                            onClick={() => openModal(job)}
                          >
                            View
                          </button>
                          <Link
                            className="job-cards-action"
                            to={`/vehicles/${vehicleLinkId}`}
                          >
                            Vehicle Profile
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && activeJobCard ? (
        <div className="job-card-modal__overlay" role="dialog" aria-modal="true">
          <div className="job-card-modal">
            <div className="job-card-modal__header">
              <div>
                <h2>Job Card – {activeJobCard.id}</h2>
                <p>Manage assignment, status, and parts usage.</p>
              </div>
              <button
                type="button"
                className="job-card-modal__close"
                onClick={closeModal}
              >
                Close
              </button>
            </div>

            {modalError ? (
              <p className="job-card-modal__error">{modalError}</p>
            ) : null}

            <div className="job-card-modal__section">
              <h3>Job Information</h3>
              <div className="job-card-modal__grid">
                <div>
                  <span>Owner</span>
                  <strong>
                    {lookup.customerMap.get(resolveOwnerId(activeJobCard))
                      ?.name ??
                      "Unknown"}
                  </strong>
                </div>
                <div>
                  <span>Vehicle</span>
                  <strong>
                    {lookup.vehicleMap.get(activeJobCard.vehicleId)
                      ?.vehicleNumber ?? "Unknown"}
                  </strong>
                </div>
                <div>
                  <span>Service Type</span>
                  <strong>
                    {resolveServices(activeJobCard.services ?? []) || "-"}
                  </strong>
                </div>
                <div>
                  <span>Created Date</span>
                  <strong>
                    {activeJobCard.createdAt
                      ? new Date(activeJobCard.createdAt).toLocaleDateString()
                      : "-"}
                  </strong>
                </div>
                <div>
                  <span>Completed Date</span>
                  <strong>
                    {activeJobCard.completedAt
                      ? new Date(activeJobCard.completedAt).toLocaleDateString()
                      : "-"}
                  </strong>
                </div>
              </div>
            </div>

            <div className="job-card-modal__section">
              <h3>Service Tasks</h3>
              {jobServices.length === 0 ? (
                <p className="job-card-modal__empty">
                  No services were added to this job card.
                </p>
              ) : (
                <div className="job-card-modal__tasks">
                  {jobServices.map((service, serviceIndex) => (
                    <div
                      key={`${service.serviceType}-${serviceIndex}`}
                      className="job-card-modal__service"
                    >
                      <div className="job-card-modal__service-head">
                        <strong>{resolveServiceName(service)}</strong>
                        <span>
                          {service.tasks?.length
                            ? `${service.tasks.length} tasks`
                            : "No tasks"}
                        </span>
                      </div>
                      {service.tasks?.length ? (
                        <div className="job-card-modal__task-table">
                          <div className="job-card-modal__task-row job-card-modal__task-row--head">
                            <span>Task Name</span>
                            <span>Labor Hours</span>
                            <span>Labor Cost</span>
                          </div>
                          {service.tasks.map((task, taskIndex) => (
                            <div
                              key={`${service.serviceType}-${task.title}-${taskIndex}`}
                              className="job-card-modal__task-row"
                            >
                              <span>{task.title}</span>
                              <span>
                                {(Number(task.standardLaborHours) || 0).toFixed(2)}
                              </span>
                              <span>
                                {(Number(task.laborHourRate) || 0).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="job-card-modal__muted">
                          No tasks defined for this service.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="job-card-modal__section job-card-modal__split">
              <div>
                <h3>Work Assignment</h3>
                {isWorkerFallback ? (
                  <>
                    <label htmlFor="job-assignee">
                      Temporary assignment (text)
                    </label>
                    <input
                      id="job-assignee"
                      value={assignedWorkerText}
                      onChange={(event) =>
                        setAssignedWorkerText(event.target.value)
                      }
                      placeholder="Enter assigned staff"
                      disabled={isReadOnly}
                    />
                    <p className="job-card-modal__hint">
                      {workerLoadError ||
                        "Staff module is unavailable. This temporary field is easy to migrate later."}
                    </p>
                  </>
                ) : (
                  <>
                    <label htmlFor="worker-search">Assigned Staff</label>
                    <input
                      id="worker-search"
                      type="search"
                      placeholder="Search by name, phone, or role"
                      value={workerSearch}
                      onChange={(event) =>
                        setWorkerSearch(event.target.value)
                      }
                      disabled={isReadOnly || noTechnicalStaff}
                    />
                    <div className="worker-select">
                      {noTechnicalStaff ? (
                        <p className="job-card-modal__warning">
                          No technical staff available. Please add staff first.
                        </p>
                      ) : filteredWorkers.length === 0 ? (
                        <p className="job-card-modal__muted">
                          No active staff match your search.
                        </p>
                      ) : (
                        filteredWorkers.map((worker) => {
                          const isSelected = selectedWorkers.some(
                            (entry) =>
                              String(entry.staffId) === String(worker._id)
                          );
                          return (
                            <label
                              key={worker._id}
                              className={`worker-select__option ${
                                isSelected ? "is-selected" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleWorkerSelection(worker)}
                                disabled={isReadOnly || noTechnicalStaff}
                              />
                              <span className="worker-select__name">
                                {worker.fullName} {"\u2013"}{" "}
                                {worker.roleName || worker.role || "Role"}
                              </span>
                              <span className="worker-select__meta">
                                {worker.roleType || "TECHNICAL"}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <div className="worker-selected">
                      {selectedWorkers.length === 0 ? (
                        <p className="job-card-modal__muted">
                          No staff assigned yet.
                        </p>
                      ) : (
                        selectedWorkers.map((worker, index) => (
                          <div
                            key={`${worker.staffId || worker.name}-${index}`}
                            className="worker-chip"
                          >
                            <div>
                              <strong>
                                {worker.name || "Staff"} {"\u2013"}{" "}
                                {worker.roleName || worker.role || "Role not set"}
                              </strong>
                            </div>
                            {!isReadOnly ? (
                              <button
                                type="button"
                                onClick={() =>
                                  removeSelectedWorker(
                                    worker.staffId,
                                    worker.name
                                  )
                                }
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div>
                <h3>Job Status</h3>
                <label htmlFor="job-status">Status</label>
                <select
                  id="job-status"
                  value={jobStatus}
                  onChange={(event) => setJobStatus(event.target.value)}
                  disabled={isReadOnly}
                >
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {jobStatus === "COMPLETED" ? (
                  <>
                    <label htmlFor="labor-charges">Labor Charges</label>
                    <input
                      id="labor-charges"
                      type="number"
                      value={laborChargesTotal.toFixed(2)}
                      readOnly
                    />
                    <p className="job-card-modal__hint">
                      Total labor hours: {laborHoursTotal.toFixed(2)}
                    </p>
                  </>
                ) : null}
              </div>
            </div>

            <div className="job-card-modal__section">
              <h3>Materials Used</h3>
              <div className="materials-panel">
                <div className="materials-add">
                  <div className="materials-field materials-field--material">
                    <label htmlFor="inventory-search">Material</label>
                    <input
                      id="inventory-search"
                      type="search"
                      list="inventory-options"
                      placeholder="Search name, brand, variant, or SKU"
                      value={inventorySearch}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setInventorySearch(nextValue);
                        const match = inventoryItems.find(
                          (item) =>
                            (item.itemName || item.name)
                              ?.toLowerCase() ===
                              nextValue.trim().toLowerCase() ||
                            item.sku?.toLowerCase() ===
                              nextValue.trim().toLowerCase()
                        );
                        setSelectedInventoryId(match ? match._id : "");
                      }}
                      disabled={isReadOnly}
                    />
                    <datalist id="inventory-options">
                      {filteredInventory.map((item) => (
                        <option
                          key={item._id}
                          value={item.itemName || item.name}
                        >
                          {item.itemName || item.name} | {item.brand || "-"} |{" "}
                          {item.variant || "-"} | {item.quantity ?? 0} available
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <div className="materials-field materials-field--qty">
                    <label htmlFor="material-qty">Quantity</label>
                    <input
                      id="material-qty"
                      type="number"
                      min="0"
                      value={partQuantity}
                      onChange={(event) => setPartQuantity(event.target.value)}
                      disabled={isReadOnly}
                    />
                  </div>
                  <div className="materials-field materials-field--meta materials-field--stock">
                    <span>Available</span>
                    <strong>
                      {selectedInventory
                        ? `${selectedInventory.quantity} ${selectedInventory.unit}`
                        : "-"}
                    </strong>
                  </div>
                  <div className="materials-field materials-field--meta materials-field--price">
                    <span>Selling Price</span>
                    <strong>
                      {selectedInventory?.sellingPrice ?? "-"}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="job-card-modal__add"
                    onClick={addPartUsage}
                    disabled={!selectedInventoryId || !partQuantity || isReadOnly}
                  >
                    Add
                  </button>
                </div>

                {partsUsed.length === 0 ? (
                  <p className="job-card-modal__empty">
                    No materials added yet. Inventory is deducted only on completion.
                  </p>
                ) : (
                  <>
                    <div className="materials-table">
                      <div className="materials-table__head">
                        <span>Material</span>
                        <span>Brand</span>
                        <span>Variant / SKU</span>
                        <span>Price</span>
                        <span>Qty</span>
                        <span>Total</span>
                        <span>Action</span>
                      </div>
                      {partsUsed.map((part) => {
                        const item = inventoryItems.find(
                          (inv) => String(inv._id) === String(part.inventoryId)
                        );
                        const itemName =
                          item?.itemName || item?.name || "Item";
                        const unitPrice =
                          (part.unitPrice ?? Number(item?.sellingPrice)) || 0;
                        const lineTotal =
                          (Number(part.quantity) || 0) * unitPrice;
                        return (
                          <div
                            key={part.inventoryId || part.sku}
                            className="materials-table__row"
                          >
                            <span>{itemName}</span>
                            <span>{item?.brand || "-"}</span>
                            <span>{item?.variant || part.sku || "-"}</span>
                            <span>{unitPrice}</span>
                            <span>
                              {part.quantity} {item?.unit || ""}
                            </span>
                            <span>{lineTotal}</span>
                            <button
                              type="button"
                              onClick={() =>
                                removePartUsage(
                                  String(part.inventoryId || part.sku)
                                )
                              }
                              disabled={isReadOnly}
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="materials-total">
                      <span>Total Cost</span>
                      <strong>{materialsTotal.toFixed(2)}</strong>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="job-card-modal__section job-card-modal__split job-card-modal__split--three">
              <div>
                <h3>Payment</h3>
                <label htmlFor="total-amount">Total Amount</label>
                <input
                  id="total-amount"
                  type="number"
                  value={totalAmount.toFixed(2)}
                  readOnly
                />
              </div>

              <div>
                <h3>Payment Status</h3>
                <label htmlFor="payment-status">Status</label>
                <select
                  id="payment-status"
                  value={paymentStatus}
                  onChange={(event) => setPaymentStatus(event.target.value)}
                  disabled={!canEditPaymentStatus}
                >
                  <option value="UNPAID">UNPAID</option>
                  <option value="PARTIAL">PARTIAL</option>
                  <option value="PAID">PAID</option>
                </select>
              </div>
              <div>
                <h3>Billing Type</h3>
                <label htmlFor="billing-type">Type</label>
                <select
                  id="billing-type"
                  value={billingType}
                  onChange={(event) => setBillingType(event.target.value)}
                  disabled={isReadOnly}
                >
                  <option value="BILLABLE">BILLABLE</option>
                  <option value="WARRANTY">WARRANTY</option>
                  <option value="REWORK">REWORK</option>
                  <option value="FREE">FREE</option>
                </select>
              </div>
            </div>

            <div className="job-card-modal__section">
              <h3>Work Notes</h3>
              <textarea
                rows="3"
                value={workNotes}
                onChange={(event) => setWorkNotes(event.target.value)}
                placeholder="Optional notes for technicians and supervisors."
                disabled={isReadOnly}
              />
            </div>

            {!isReadOnly ? (
              <div className="job-card-modal__actions">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || noTechnicalStaff}
                >
                  Save Job Card
                </button>
              </div>
            ) : null}

            <div className="job-card-modal__section">
              <h3>Billing</h3>
              {invoiceError ? (
                <p className="job-card-modal__error">{invoiceError}</p>
              ) : null}
              {["COMPLETED", "CLOSED"].includes(activeJobCard.status) ? (
                <div className="job-card-modal__billing">
                  {invoiceLoading ? (
                    <p className="job-card-modal__muted">Loading invoice...</p>
                  ) : invoiceData ? (
                    <>
                      <div>
                        <span>Invoice</span>
                        <strong>{invoiceData.invoiceNumber}</strong>
                      </div>
                      <div>
                        <span>Status</span>
                        <strong>{invoiceData.status}</strong>
                      </div>
                    </>
                  ) : (
                    <p className="job-card-modal__muted">
                      No invoice generated yet.
                    </p>
                  )}
                </div>
              ) : (
                <p className="job-card-modal__muted">
                  Invoice actions are available after completion.
                </p>
              )}
              <div className="job-card-modal__billing-actions">
                {activeJobCard.status === "COMPLETED" && !invoiceData ? (
                  <button
                    type="button"
                    onClick={handleGenerateInvoice}
                    disabled={invoiceLoading || isBillingLocked}
                  >
                    Generate Invoice
                  </button>
                ) : null}
                {invoiceData ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/invoices/${invoiceData._id}`)}
                    disabled={isBillingLocked}
                  >
                    View Invoice
                  </button>
                ) : null}
                {invoiceData?.status === "FINALIZED" &&
                activeJobCard.status === "COMPLETED" ? (
                  <button
                    type="button"
                    onClick={handleCloseJobCard}
                    disabled={isSaving || isBillingLocked}
                  >
                    Close Job Card
                  </button>
                ) : null}
              </div>
            </div>

            <div className="job-card-modal__actions">
              <button type="button" onClick={closeModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default JobCards;




