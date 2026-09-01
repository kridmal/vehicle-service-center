import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import StaffSearchInput from "../components/StaffSearchInput.jsx";
import { useLocalStorageState } from "../hooks/useLocalStorageState.js";
import api from "../services/api.js";
import {
  computeDraftPricing,
  formatFreeLaborRewardLabel,
} from "../utils/loyaltyPricing.js";
import { computeItemDiscount } from "../utils/itemDiscount.js";
import {
  computeLaborSubtotalFromServices,
  getTaskInstanceId,
  hasPositiveTaskLaborCharge,
  hasTaskLaborMetadata,
  normalizeServicesSnapshot,
  roundCurrency as roundTaskCurrency,
  toNonNegativeNumber,
} from "../utils/taskLabor.js";
import { getJobCards, saveJobCards } from "../utils/storage.js";
import "./JobCards.css";

function JobCards() {
  const taskStaffSearchTimersRef = useRef({});
  const serviceTypeEditableStatuses = ["OPEN", "IN_PROGRESS", "PENDING"];
  const [allJobs, setAllJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [customers, setCustomers] = useLocalStorageState("ksc_customers", []);
  const [vehicles, setVehicles] = useLocalStorageState("ksc_vehicles", []);
  const [services, setServices] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeJobCard, setActiveJobCard] = useState(null);
  const [jobStatus, setJobStatus] = useState("OPEN");
  const [paymentStatus, setPaymentStatus] = useState("UNPAID");
  const [workNotes, setWorkNotes] = useState("");
  const [partsUsed, setPartsUsed] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  const [partQuantity, setPartQuantity] = useState("");
  const [modalError, setModalError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [jobServices, setJobServices] = useState([]);
  const [taskStaffSearchTerms, setTaskStaffSearchTerms] = useState({});
  const [taskStaffSearchResults, setTaskStaffSearchResults] = useState({});
  const [serviceTypeToAdd, setServiceTypeToAdd] = useState("");
  const [serviceTypeAddError, setServiceTypeAddError] = useState("");
  const [isAddingServiceType, setIsAddingServiceType] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoiceError, setInvoiceError] = useState("");
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [appliedRewards, setAppliedRewards] = useState([]);
  const [availableRewards, setAvailableRewards] = useState([]);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [legacyLaborFallback, setLegacyLaborFallback] = useState(0);
  const [activeJobHasTaskLaborMeta, setActiveJobHasTaskLaborMeta] = useState(false);
  const [taskLaborTouched, setTaskLaborTouched] = useState(false);
  const [customTasks, setCustomTasks] = useState([]);
  const [customTaskStaffSearchTerms, setCustomTaskStaffSearchTerms] = useState({});
  const [customTaskStaffSearchResults, setCustomTaskStaffSearchResults] = useState({});
  const navigate = useNavigate();

  const buildRewardSelectionKey = (reward) =>
    `${String(reward?.ruleId || "")}:${String(
      reward?.milestoneNumber ?? "legacy"
    )}`;

  const formatMoney = (value) =>
    new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);

  const formatRewardSummary = (reward) => {
    const rewardType = String(reward?.rewardType || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (rewardType === "free_labor") {
      return formatFreeLaborRewardLabel(reward);
    }
    return reward?.rewardType || "reward";
  };

  useEffect(() => {
    const loadJobCards = async () => {
      try {
        const { data } = await api.get("/job-cards");
        const mapped = (Array.isArray(data) ? data : []).map((doc) => ({
          id: doc.jobCardNo,
          mongoId: String(doc._id),
          ownerId: doc.ownerId || doc.customerId,
          customerId: doc.customerId,
          vehicleId: doc.vehicleId,
          status: doc.status || "OPEN",
          paymentStatus: doc.paymentStatus || "UNPAID",
          services: doc.services || [],
          serviceTypeIds: doc.serviceTypeIds || [],
          partsUsed: doc.partsUsed || [],
          laborCharges: doc.laborChargesOriginal ?? doc.laborCharges ?? 0,
          laborChargesOriginal: doc.laborChargesOriginal ?? doc.laborCharges ?? 0,
          laborChargesNet: doc.laborChargesNet ?? 0,
          loyaltyLaborDiscount: doc.loyaltyLaborDiscount ?? 0,
          subtotalPartsOriginal: doc.subtotalPartsOriginal ?? 0,
          partsDiscountTotal: doc.partsDiscountTotal ?? 0,
          subtotalParts: doc.subtotalParts ?? 0,
          grandTotal: doc.grandTotal ?? 0,
          workNotes: doc.workNotes || "",
          customTasks: Array.isArray(doc.customTasks) ? doc.customTasks : [],
          appliedRewards: Array.isArray(doc.appliedRewards)
            ? doc.appliedRewards.slice(0, 1)
            : [],
          createdAt: doc.createdAt,
          assignedWorker: doc.assignedWorker || "",
          assignedWorkers: doc.assignedWorkers || [],
        }));
        setAllJobs(mapped);
        saveJobCards(mapped);
      } catch (error) {
        if (error.response?.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        setAllJobs(getJobCards());
      }
    };
    loadJobCards();
  }, [navigate]);

  useEffect(() => {
    return () => {
      Object.values(taskStaffSearchTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
    };
  }, []);

  useEffect(() => {
    const loadServices = async () => {
      try {
        const { data } = await api.get("/services");
        setServices(Array.isArray(data) ? data : []);
      } catch (error) {
        if (error.response?.status === 401) {
          navigate("/login", { replace: true });
        }
      }
    };
    loadServices();
  }, [navigate]);

  useEffect(() => {
    const syncCustomers = async () => {
      try {
        const { data } = await api.get("/customers");
        if (!Array.isArray(data)) return;
        setCustomers((prev) => {
          const result = [];
          const seenMongoIds = new Set();
          for (const c of data) {
            const mongoId = String(c._id);
            seenMongoIds.add(mongoId);
            const existing = prev.find((e) => e.mongoId === mongoId);
            if (existing) {
              result.push({ ...existing, name: c.name, phone: c.phone || "", email: c.email || "" });
            } else {
              result.push({ _id: c._id, id: mongoId, mongoId, name: c.name, phone: c.phone || "", email: c.email || "", notes: c.notes || "" });
            }
          }
          for (const e of prev) {
            if (!e.mongoId && !seenMongoIds.has(e.id)) result.push(e);
          }
          return result;
        });
      } catch {
        // silently keep existing ksc_customers data
      }
    };
    syncCustomers();
  }, []);

  useEffect(() => {
    const syncVehicles = async () => {
      try {
        const { data } = await api.get("/vehicles");
        if (!Array.isArray(data)) return;
        setVehicles((prev) => {
          const result = [];
          const matchedLocalIds = new Set();
          for (const v of data) {
            const mongoId = String(v._id);
            const local = prev.find(
              (e) => e.mongoId === mongoId || e.vehicleNumber?.toLowerCase() === v.vehicleNumber?.toLowerCase()
            );
            if (local) {
              matchedLocalIds.add(local.id);
              result.push({ ...local, mongoId, vehicleNumber: v.vehicleNumber });
            } else {
              result.push({ id: mongoId, mongoId, customerId: v.customerId || v.currentOwnerId, currentOwnerId: v.currentOwnerId, vehicleNumber: v.vehicleNumber, brandId: v.brandId, brandName: v.brandName, modelId: v.modelId, modelName: v.modelName, year: v.year || "" });
            }
          }
          for (const e of prev) {
            if (!matchedLocalIds.has(e.id) && !e.mongoId) result.push(e);
          }
          return result;
        });
      } catch {
        // silently keep existing ksc_vehicles data
      }
    };
    syncVehicles();
  }, []);

  const lookup = useMemo(() => {
    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
    const serviceMap = new Map(
      services.map((s) => [String(s._id || s.id), s])
    );
    return { customerMap, vehicleMap, serviceMap };
  }, [customers, vehicles, services]);

  const resolveOwnerId = (job) => job?.ownerId || job?.customerId;
  const resolveOwnerMongoId = (job) => {
    const ownerId = resolveOwnerId(job);
    if (!ownerId) return "";
    const customer = customers.find((entry) => entry.id === ownerId);
    return customer?.mongoId || "";
  };
  const resolveVehicleMongoId = (job) => {
    if (!job?.vehicleId) return "";
    const vehicle = vehicles.find((entry) => entry.id === job.vehicleId);
    return vehicle?.mongoId || "";
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
    normalizeServicesSnapshot(services, false);

  const stripTaskLaborFromServices = (services = []) =>
    (Array.isArray(services) ? services : [])
      .map((service) => {
        if (!service) return null;
        return {
          serviceType: service.serviceType,
          serviceName: service.serviceName || "",
          tasks: Array.isArray(service.tasks)
            ? service.tasks
                .map((task) => {
                  const title = String(task?.title || task?.taskName || "").trim();
                  if (!title) return null;
                  return {
                    title,
                    isRequired: Boolean(task?.isRequired),
                    completed: Boolean(task?.completed),
                  };
                })
                .filter(Boolean)
            : [],
        };
      })
      .filter(Boolean);

  const shouldUseTaskLaborMode = (services = [], fallbackLabor = 0) => {
    const hasMetadata = hasTaskLaborMetadata(services);
    if (!hasMetadata) return false;
    if (hasPositiveTaskLaborCharge(services)) return true;
    return toNonNegativeNumber(fallbackLabor) === 0;
  };

  const resolveServices = (serviceEntries = []) =>
    serviceEntries
      .map((entry) =>
        lookup.serviceMap.get(
          String(typeof entry === "string" ? entry : entry?.serviceType)
        )?.name
      )
      .filter(Boolean)
      .join(", ");

  const openModal = async (job) => {
    setActiveJobCard(job);
    setJobStatus(job.status || "OPEN");
    setPaymentStatus(job.paymentStatus || "UNPAID");
    setWorkNotes(job.workNotes || "");
    setPartsUsed(job.partsUsed || []);
    const fallbackLabor = Number(job.laborChargesOriginal ?? job.laborCharges) || 0;
    setActiveJobHasTaskLaborMeta(
      shouldUseTaskLaborMode(job.services || [], fallbackLabor)
    );
    setTaskLaborTouched(false);
    setLegacyLaborFallback(fallbackLabor);
    setJobServices(normalizeJobServices(job.services || []));
    setCustomTasks(Array.isArray(job.customTasks) ? job.customTasks : []);
    setCustomTaskStaffSearchTerms({});
    setCustomTaskStaffSearchResults({});
    setAppliedRewards(
      Array.isArray(job.appliedRewards) && job.appliedRewards.length > 0
        ? [job.appliedRewards[0]]
        : []
    );
    setAvailableRewards([]);
    setLoyaltyLoading(false);
    setInventorySearch("");
    setSelectedInventoryId("");
    setPartQuantity("");
    setTaskStaffSearchTerms({});
    setTaskStaffSearchResults({});
    setModalError("");
    setServiceTypeToAdd("");
    setServiceTypeAddError("");
    setIsAddingServiceType(false);
    setInvoiceData(null);
    setInvoiceError("");

    const customerMongoId = resolveOwnerMongoId(job);
    const vehicleMongoId = resolveVehicleMongoId(job);
    if (customerMongoId) {
      setLoyaltyLoading(true);
      api
        .get(`/loyalty/customer/${customerMongoId}/eligible`, {
          params: { vehicleId: vehicleMongoId },
        })
        .then(({ data }) => {
          setAvailableRewards(
            Array.isArray(data.availableRewards) ? data.availableRewards : []
          );
        })
        .catch(() => {
          setAvailableRewards([]);
        })
        .finally(() => setLoyaltyLoading(false));
    }

    setIsModalOpen(true);
    try {
      const { data } = await api.get("/inventory");
      setInventoryItems(Array.isArray(data) ? data : []);
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        navigate("/login", { replace: true });
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
    setServiceTypeToAdd("");
    setServiceTypeAddError("");
    setIsAddingServiceType(false);
    setTaskStaffSearchTerms({});
    setTaskStaffSearchResults({});
    setCustomTasks([]);
    setCustomTaskStaffSearchTerms({});
    setCustomTaskStaffSearchResults({});
  };

  const toggleTaskCompletion = (serviceIndex, taskIndex) => {
    setJobServices((prev) =>
      prev.map((service, index) => {
        if (index !== serviceIndex) return service;
        const tasks = (service.tasks || []).map((task, idx) =>
          idx === taskIndex
            ? {
                ...task,
                completed: !task.completed,
                selected: !task.completed,
              }
            : task
        );
        return { ...service, tasks };
      })
    );
  };

  const updateTaskLaborField = (serviceIndex, taskIndex, field, value) => {
    setTaskLaborTouched(true);
    setJobServices((prev) =>
      prev.map((service, index) => {
        if (index !== serviceIndex) return service;
        const tasks = (service.tasks || []).map((task, idx) => {
          if (idx !== taskIndex) return task;
          if (field === "isBillable") {
            return { ...task, isBillable: Boolean(value) };
          }
          const normalizedValue = roundTaskCurrency(toNonNegativeNumber(value));
          return { ...task, [field]: normalizedValue };
        });
        return { ...service, tasks };
      })
    );
  };

  const handleAddServiceType = async () => {
    if (!activeJobCard || !serviceTypeToAdd) return;

    const activeStatus = String(activeJobCard.status || "OPEN").toUpperCase();
    if (!serviceTypeEditableStatuses.includes(activeStatus)) {
      setServiceTypeAddError(
        "Service types can only be modified while status is OPEN, IN_PROGRESS, or PENDING."
      );
      return;
    }

    if (!activeJobCard.mongoId) {
      setServiceTypeAddError("Job card sync is required before adding service types.");
      return;
    }

    if (currentServiceTypeIds.includes(String(serviceTypeToAdd))) {
      setServiceTypeAddError("This service type is already added.");
      return;
    }

    setIsAddingServiceType(true);
    setServiceTypeAddError("");

    try {
      const { data: updatedJobCard } = await api.put(
        `/job-cards/${activeJobCard.mongoId}/service-types`,
        {
          addServiceTypeIds: [serviceTypeToAdd],
        }
      );

      const mergedJobState = {
        mongoId: updatedJobCard?._id || activeJobCard.mongoId,
        serviceTypeIds:
          updatedJobCard?.serviceTypeIds ?? activeJobCard.serviceTypeIds ?? [],
        services: updatedJobCard?.services ?? activeJobCard.services ?? [],
        laborCharges:
          updatedJobCard?.laborChargesOriginal ??
          updatedJobCard?.laborCharges ??
          activeJobCard.laborCharges,
        laborChargesOriginal:
          updatedJobCard?.laborChargesOriginal ?? activeJobCard.laborChargesOriginal,
        loyaltyLaborDiscount:
          updatedJobCard?.loyaltyLaborDiscount ?? activeJobCard.loyaltyLaborDiscount ?? 0,
        laborChargesNet:
          updatedJobCard?.laborChargesNet ?? activeJobCard.laborChargesNet,
        subtotalPartsOriginal:
          updatedJobCard?.subtotalPartsOriginal ?? activeJobCard.subtotalPartsOriginal,
        partsDiscountTotal:
          updatedJobCard?.partsDiscountTotal ?? activeJobCard.partsDiscountTotal,
        subtotalParts: updatedJobCard?.subtotalParts ?? activeJobCard.subtotalParts,
        grandTotal: updatedJobCard?.grandTotal ?? activeJobCard.grandTotal,
        paymentStatus: updatedJobCard?.paymentStatus ?? activeJobCard.paymentStatus,
        workNotes: updatedJobCard?.workNotes ?? activeJobCard.workNotes,
        status: updatedJobCard?.status ?? activeJobCard.status,
        appliedRewards:
          Array.isArray(updatedJobCard?.appliedRewards) &&
          updatedJobCard.appliedRewards.length > 0
            ? [updatedJobCard.appliedRewards[0]]
            : [],
      };

      const normalizedServices = normalizeJobServices(mergedJobState.services || []);
      setJobServices(normalizedServices);
      setAppliedRewards(mergedJobState.appliedRewards);
      setActiveJobHasTaskLaborMeta(
        shouldUseTaskLaborMode(
          mergedJobState.services || [],
          Number(mergedJobState.laborChargesOriginal ?? mergedJobState.laborCharges) || 0
        )
      );
      setTaskLaborTouched(false);
      setLegacyLaborFallback(
        Number(mergedJobState.laborChargesOriginal ?? mergedJobState.laborCharges) || 0
      );

      const updatedJobs = allJobs.map((job) =>
        job.id === activeJobCard.id
          ? {
              ...job,
              ...mergedJobState,
            }
          : job
      );
      setAllJobs(updatedJobs);
      saveJobCards(updatedJobs);
      setActiveJobCard((prev) =>
        prev
          ? {
              ...prev,
              ...mergedJobState,
            }
          : prev
      );
      setJobStatus(mergedJobState.status || "OPEN");
      setServiceTypeToAdd("");
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        navigate("/login", { replace: true });
        return;
      }
      setServiceTypeAddError(
        error.response?.data?.message ||
          "Unable to add service type right now. Please try again."
      );
    } finally {
      setIsAddingServiceType(false);
    }
  };

  const handleRemoveServiceType = (serviceType) => {
    if (!canAddServiceTypes) return;

    const normalizedServiceType = String(serviceType || "").trim();
    if (!normalizedServiceType) return;

    if (jobServices.length <= 1) {
      setServiceTypeAddError("At least one service type is required.");
      return;
    }

    const serviceNameToRemove =
      lookup.serviceMap.get(normalizedServiceType)?.name || "this service type";
    const shouldRemove = window.confirm(
      `Remove "${serviceNameToRemove}" from this job card? Save Job Card to persist the change.`
    );
    if (!shouldRemove) return;

    setServiceTypeAddError("");
    setJobServices((prev) =>
      prev.filter(
        (service) => String(service?.serviceType || "").trim() !== normalizedServiceType
      )
    );
    setTaskLaborTouched(true);
  };

  const resolveServiceName = (service) =>
    lookup.serviceMap.get(String(service.serviceType))?.name || "Service";

  const getTaskRowKey = (serviceType, task, taskIndex) =>
    getTaskInstanceId(String(serviceType || ""), task, taskIndex);

  const formatStaffOptionLabel = (staff) =>
    `${String(staff?.employeeNo || "").trim()} - ${String(staff?.name || "").trim()}`;

  const getAssignedStaffLabel = (task) => {
    const employeeNo = String(task?.assignedStaffSnapshot?.employeeNo || "").trim();
    const name = String(task?.assignedStaffSnapshot?.name || "").trim();
    if (!employeeNo && !name) return "";
    return `${employeeNo} - ${name}`.trim();
  };

  const updateTaskAssignedStaff = (serviceIndex, taskIndex, staff) => {
    setTaskLaborTouched(true);
    setJobServices((prev) =>
      prev.map((service, index) => {
        if (index !== serviceIndex) return service;
        const tasks = (service.tasks || []).map((task, idx) => {
          if (idx !== taskIndex) return task;
          if (!staff) {
            return {
              ...task,
              assignedStaffId: null,
              assignedStaffSnapshot: { employeeNo: "", name: "" },
            };
          }
          return {
            ...task,
            assignedStaffId: staff._id,
            assignedStaffSnapshot: {
              employeeNo: staff.employeeNo || "",
              name: staff.name || "",
            },
          };
        });
        return { ...service, tasks };
      })
    );
  };

  const queueTaskStaffSearch = (serviceIndex, taskIndex, rowKey, nextValue) => {
    setTaskStaffSearchTerms((prev) => ({ ...prev, [rowKey]: nextValue }));
    const query = String(nextValue || "").trim();
    const currentOptions = taskStaffSearchResults[rowKey] || [];
    const matchedFromCurrent = currentOptions.find(
      (staff) => formatStaffOptionLabel(staff).toLowerCase() === query.toLowerCase()
    );
    if (matchedFromCurrent) {
      updateTaskAssignedStaff(serviceIndex, taskIndex, matchedFromCurrent);
    } else if (!query) {
      updateTaskAssignedStaff(serviceIndex, taskIndex, null);
    }

    if (taskStaffSearchTimersRef.current[rowKey]) {
      clearTimeout(taskStaffSearchTimersRef.current[rowKey]);
    }
    if (!query) {
      setTaskStaffSearchResults((prev) => ({ ...prev, [rowKey]: [] }));
      return;
    }

    taskStaffSearchTimersRef.current[rowKey] = setTimeout(async () => {
      try {
        const { data } = await api.get("/staff/search", { params: { q: query } });
        const rows = Array.isArray(data) ? data : [];
        setTaskStaffSearchResults((prev) => ({ ...prev, [rowKey]: rows }));
        const matched = rows.find(
          (staff) => formatStaffOptionLabel(staff).toLowerCase() === query.toLowerCase()
        );
        if (matched) {
          updateTaskAssignedStaff(serviceIndex, taskIndex, matched);
        }
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          navigate("/login", { replace: true });
          return;
        }
        setTaskStaffSearchResults((prev) => ({ ...prev, [rowKey]: [] }));
      }
    }, 300);
  };

  const currentServiceTypeIds = useMemo(
    () =>
      [
        ...new Set(
          jobServices
            .map((service) => String(service?.serviceType || "").trim())
            .filter(Boolean)
        ),
      ],
    [jobServices]
  );

  const availableServiceTypesToAdd = useMemo(
    () =>
      services.filter((service) => {
        const serviceTypeId = String(service?._id || service?.id || "").trim();
        if (!serviceTypeId) return false;
        if (service.active === false) return false;
        return !currentServiceTypeIds.includes(serviceTypeId);
      }),
    [currentServiceTypeIds, services]
  );

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

  const partPricingRows = useMemo(
    () =>
      partsUsed.map((part) => {
        const item = inventoryItems.find(
          (inv) => String(inv._id) === String(part.inventoryId)
        );
        const quantity = Number(part.quantity) || 0;
        const unitPriceOriginal =
          Number(part.unitPriceOriginal ?? part.unitPrice ?? item?.sellingPrice) || 0;
        const hasSnapshot =
          part.discountPerUnit !== undefined ||
          part.unitPriceNet !== undefined ||
          part.lineDiscountTotal !== undefined ||
          part.lineTotal !== undefined;

        const discountResult = computeItemDiscount({
          unitPriceOriginal,
          qty: quantity,
          discountEnabled: item?.discountEnabled,
          discountType: item?.discountType,
          discountValue: item?.discountValue,
          startAt: item?.discountStartAt,
          endAt: item?.discountEndAt,
          minQty: item?.minQtyForDiscount,
          cap: item?.maxDiscountCap,
        });

        const discountPerUnit = hasSnapshot
          ? Number(part.discountPerUnit) || 0
          : discountResult.discountPerUnit;
        const unitPriceNet = hasSnapshot
          ? Number(part.unitPriceNet) || 0
          : discountResult.unitPriceNet;
        const lineDiscountTotal = hasSnapshot
          ? Number(part.lineDiscountTotal) || 0
          : discountResult.lineDiscountTotal;
        const lineTotalNet = hasSnapshot
          ? Number(part.lineTotal) || 0
          : discountResult.lineTotalNet;

        return {
          key: part.inventoryId || part.sku,
          itemName: item?.itemName || item?.name || "Item",
          brand: item?.brand || "-",
          variant: item?.variant || part.sku || "-",
          unit: item?.unit || "",
          quantity,
          unitPriceOriginal,
          discountPerUnit,
          unitPriceNet,
          lineDiscountTotal,
          lineTotalOriginal: unitPriceOriginal * quantity,
          lineTotalNet,
        };
      }),
    [inventoryItems, partsUsed]
  );

  const partsSubtotalOriginal = useMemo(
    () =>
      partPricingRows.reduce(
        (sum, row) => sum + (Number(row.lineTotalOriginal) || 0),
        0
      ),
    [partPricingRows]
  );

  const partsDiscountTotal = useMemo(
    () =>
      partPricingRows.reduce(
        (sum, row) => sum + (Number(row.lineDiscountTotal) || 0),
        0
      ),
    [partPricingRows]
  );

  const partsSubtotalNet = useMemo(
    () =>
      partPricingRows.reduce(
        (sum, row) => sum + (Number(row.lineTotalNet) || 0),
        0
      ),
    [partPricingRows]
  );

  const computedTaskLaborSubtotal = useMemo(() => {
    const serviceLabor = computeLaborSubtotalFromServices(jobServices);
    const customLabor = customTasks.reduce((sum, t) => {
      if (!t.billable) return sum;
      return sum + toNonNegativeNumber(t.laborCharge);
    }, 0);
    return roundTaskCurrency(serviceLabor + customLabor);
  }, [jobServices, customTasks]);

  const laborChargesOriginalForPricing = useMemo(() => {
    const shouldUseTaskLabor =
      activeJobHasTaskLaborMeta ||
      taskLaborTouched ||
      hasPositiveTaskLaborCharge(jobServices) ||
      toNonNegativeNumber(legacyLaborFallback) === 0;

    if (shouldUseTaskLabor) {
      return computedTaskLaborSubtotal;
    }

    return roundTaskCurrency(toNonNegativeNumber(legacyLaborFallback));
  }, [
    activeJobHasTaskLaborMeta,
    computedTaskLaborSubtotal,
    jobServices,
    legacyLaborFallback,
    taskLaborTouched,
  ]);

  const pricingPreview = useMemo(
    () =>
      computeDraftPricing({
        partsSubtotal: partsSubtotalNet,
        laborChargesOriginal: laborChargesOriginalForPricing,
        appliedRewards,
      }),
    [appliedRewards, laborChargesOriginalForPricing, partsSubtotalNet]
  );

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

  const selectSingleReward = (reward) => {
    if (!reward?.ruleId) return;
    setAppliedRewards([
      {
        rewardId: reward._id || reward.rewardId || null,
        ruleId: reward.ruleId,
        ruleName: reward.ruleName,
        rewardType: reward.rewardType,
        rewardValue: reward.rewardValue,
        rewardDiscountMode: reward.rewardDiscountMode ?? null,
        rewardDiscountValue: reward.rewardDiscountValue ?? null,
        rewardDiscountCap: reward.rewardDiscountCap ?? null,
        milestoneNumber:
          reward.milestoneNumber !== undefined ? reward.milestoneNumber : null,
      },
    ]);
  };

  const clearSelectedReward = () => {
    setAppliedRewards([]);
  };

  const addCustomTask = () => {
    setCustomTasks((prev) => [
      ...prev,
      { taskName: "", laborHours: 0, laborCharge: 0, billable: true, assignedStaffId: null, assignedStaffSnapshot: { employeeNo: "", name: "" } },
    ]);
  };

  const removeCustomTask = (index) => {
    setCustomTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCustomTaskField = (index, field, value) => {
    setCustomTasks((prev) =>
      prev.map((task, i) => {
        if (i !== index) return task;
        if (field === "laborHours" || field === "laborCharge") {
          return { ...task, [field]: roundTaskCurrency(toNonNegativeNumber(value)) };
        }
        return { ...task, [field]: value };
      })
    );
  };

  const queueCustomTaskStaffSearch = (index, nextValue) => {
    const rowKey = `custom-${index}`;
    setCustomTaskStaffSearchTerms((prev) => ({ ...prev, [rowKey]: nextValue }));
    const query = String(nextValue || "").trim();
    const currentOptions = customTaskStaffSearchResults[rowKey] || [];
    const matchedFromCurrent = currentOptions.find(
      (staff) => formatStaffOptionLabel(staff).toLowerCase() === query.toLowerCase()
    );
    if (matchedFromCurrent) {
      setCustomTasks((prev) =>
        prev.map((task, i) =>
          i !== index
            ? task
            : { ...task, assignedStaffId: matchedFromCurrent._id, assignedStaffSnapshot: { employeeNo: matchedFromCurrent.employeeNo || "", name: matchedFromCurrent.name || "" } }
        )
      );
    } else if (!query) {
      setCustomTasks((prev) =>
        prev.map((task, i) =>
          i !== index ? task : { ...task, assignedStaffId: null, assignedStaffSnapshot: { employeeNo: "", name: "" } }
        )
      );
    }
    if (taskStaffSearchTimersRef.current[rowKey]) {
      clearTimeout(taskStaffSearchTimersRef.current[rowKey]);
    }
    if (!query) {
      setCustomTaskStaffSearchResults((prev) => ({ ...prev, [rowKey]: [] }));
      return;
    }
    taskStaffSearchTimersRef.current[rowKey] = setTimeout(async () => {
      try {
        const { data } = await api.get("/staff/search", { params: { q: query } });
        const rows = Array.isArray(data) ? data : [];
        setCustomTaskStaffSearchResults((prev) => ({ ...prev, [rowKey]: rows }));
        const matched = rows.find(
          (staff) => formatStaffOptionLabel(staff).toLowerCase() === query.toLowerCase()
        );
        if (matched) {
          setCustomTasks((prev) =>
            prev.map((task, i) =>
              i !== index
                ? task
                : { ...task, assignedStaffId: matched._id, assignedStaffSnapshot: { employeeNo: matched.employeeNo || "", name: matched.name || "" } }
            )
          );
        }
      } catch {
        setCustomTaskStaffSearchResults((prev) => ({ ...prev, [rowKey]: [] }));
      }
    }, 300);
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
          createdAt: activeJobCard.createdAt,
        });
        mongoId = data?._id || data?.id;
      }

      const hasTaskAssignments = jobServices.some((service) =>
        (service.tasks || []).some((task) => Boolean(task.assignedStaffId))
      );
      const shouldPersistTaskLabor =
        activeJobHasTaskLaborMeta ||
        taskLaborTouched ||
        hasPositiveTaskLaborCharge(jobServices) ||
        hasTaskAssignments;
      const servicesPayload = shouldPersistTaskLabor
        ? jobServices
        : stripTaskLaborFromServices(jobServices);

      const payload = {
        status: jobStatus,
        partsUsed,
        laborCharges: pricingPreview.laborChargesOriginal,
        workNotes,
        services: servicesPayload,
        customTasks,
        appliedRewards: appliedRewards.slice(0, 1),
      };
      if (jobStatus === "COMPLETED") {
        payload.paymentStatus = paymentStatus;
      }

      const { data: savedJobCard } = await api.patch(`/job-cards/${mongoId}`, payload);
      const persistedServiceTypeIds = Array.isArray(savedJobCard?.serviceTypeIds)
        ? savedJobCard.serviceTypeIds.map((serviceTypeId) => String(serviceTypeId))
        : (savedJobCard?.services ?? payload.services ?? activeJobCard.services ?? [])
            .map((service) => String(service?.serviceType || "").trim())
            .filter(Boolean);

      const mergedJobState = {
        mongoId: savedJobCard?._id || mongoId,
        serviceTypeIds: persistedServiceTypeIds,
        status: savedJobCard?.status ?? payload.status,
        partsUsed: savedJobCard?.partsUsed ?? payload.partsUsed,
        laborCharges:
          savedJobCard?.laborChargesOriginal ??
          savedJobCard?.laborCharges ??
          payload.laborCharges,
        laborChargesOriginal:
          savedJobCard?.laborChargesOriginal ?? payload.laborCharges,
        loyaltyLaborDiscount: savedJobCard?.loyaltyLaborDiscount ?? 0,
        laborChargesNet:
          savedJobCard?.laborChargesNet ??
          (savedJobCard?.laborChargesOriginal ?? payload.laborCharges),
        subtotalPartsOriginal:
          savedJobCard?.subtotalPartsOriginal ?? partsSubtotalOriginal,
        partsDiscountTotal:
          savedJobCard?.partsDiscountTotal ?? partsDiscountTotal,
        subtotalParts: savedJobCard?.subtotalParts ?? pricingPreview.subtotalParts,
        grandTotal:
          savedJobCard?.grandTotal ??
          (savedJobCard?.subtotalParts ?? pricingPreview.subtotalParts) +
            (savedJobCard?.laborChargesNet ??
              (savedJobCard?.laborChargesOriginal ?? payload.laborCharges)),
        paymentStatus: savedJobCard?.paymentStatus ?? payload.paymentStatus,
        workNotes: savedJobCard?.workNotes ?? payload.workNotes,
        services: savedJobCard?.services ?? payload.services ?? activeJobCard.services,
        customTasks: savedJobCard?.customTasks ?? payload.customTasks ?? [],
        appliedRewards:
          Array.isArray(savedJobCard?.appliedRewards) &&
          savedJobCard.appliedRewards.length > 0
            ? [savedJobCard.appliedRewards[0]]
            : [],
      };

      const updated = allJobs.map((job) =>
        job.id === activeJobCard.id
          ? {
              ...job,
              ...mergedJobState,
            }
          : job
      );
      setAllJobs(updated);
      saveJobCards(updated);
      setActiveJobCard((prev) =>
        prev
          ? {
              ...prev,
              ...mergedJobState,
            }
          : prev
      );
      setAppliedRewards(mergedJobState.appliedRewards);
      setActiveJobHasTaskLaborMeta(
        shouldUseTaskLaborMode(
          mergedJobState.services || [],
          Number(mergedJobState.laborChargesOriginal ?? mergedJobState.laborCharges) || 0
        )
      );
      setTaskLaborTouched(false);
      setLegacyLaborFallback(
        Number(mergedJobState.laborChargesOriginal ?? mergedJobState.laborCharges) || 0
      );
      if (!(jobStatus === "COMPLETED" && paymentStatus === "PAID")) {
        closeModal();
      }
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        navigate("/login", { replace: true });
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
      saveJobCards(updated);
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
  const canAddServiceTypes =
    serviceTypeEditableStatuses.includes(
      String(activeJobCard?.status || "OPEN").toUpperCase()
    ) && !isReadOnly;
  const isServiceTypeSelectionDisabled =
    !canAddServiceTypes ||
    !activeJobCard?.mongoId ||
    availableServiceTypesToAdd.length === 0 ||
    isAddingServiceType;
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="job-cards-empty">
                    No active job cards match your filters.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => {
                  const ownerId = resolveOwnerId(job);
                  const customer = lookup.customerMap.get(ownerId);
                  const vehicle = lookup.vehicleMap.get(job.vehicleId);
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
                    <tr key={job.id}>
                      <td>{job.id}</td>
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
                            to={`/vehicles/${job.vehicleId}`}
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
              </div>
            </div>

            <div className="job-card-modal__section">
              <h3>Service Tasks</h3>
              {canAddServiceTypes ? (
                <div className="job-card-service-type-add">
                  <label htmlFor="add-service-type">Add Service Type</label>
                  <div className="job-card-service-type-add__controls">
                    <select
                      id="add-service-type"
                      value={serviceTypeToAdd}
                      onChange={(event) => {
                        setServiceTypeToAdd(event.target.value);
                        setServiceTypeAddError("");
                      }}
                      disabled={isServiceTypeSelectionDisabled}
                    >
                      <option value="">Select service type</option>
                      {availableServiceTypesToAdd.map((service) => {
                        const value = String(service._id || service.id);
                        return (
                          <option key={value} value={value}>
                            {service.name}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      className="job-card-modal__add"
                      onClick={handleAddServiceType}
                      disabled={
                        isServiceTypeSelectionDisabled || !serviceTypeToAdd
                      }
                    >
                      {isAddingServiceType ? "Adding..." : "Add"}
                    </button>
                  </div>
                  {!activeJobCard?.mongoId ? (
                    <p className="job-card-modal__muted">
                      Sync this job card first, then add more service types.
                    </p>
                  ) : availableServiceTypesToAdd.length === 0 ? (
                    <p className="job-card-modal__muted">
                      All active service types are already added.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="job-card-modal__muted">
                  Additional service types are disabled once the job is COMPLETED or CLOSED.
                </p>
              )}
              {serviceTypeAddError ? (
                <p className="job-card-modal__error">{serviceTypeAddError}</p>
              ) : null}
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
                        <div className="job-card-modal__service-meta">
                          <span>
                            {service.tasks?.length
                              ? `${service.tasks.length} tasks`
                              : "No tasks"}
                          </span>
                          {canAddServiceTypes ? (
                            <button
                              type="button"
                              className="job-card-modal__service-remove"
                              onClick={() => handleRemoveServiceType(service.serviceType)}
                            >
                              Remove service
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {service.tasks?.length ? (
                        <div className="job-card-task-table">
                          <div className="job-card-task-table__head">
                            <span>Task</span>
                            <span>Labor Hours</span>
                            <span>Labor Charge (LKR)</span>
                            <span>Assigned Staff</span>
                            <span>Billable</span>
                          </div>
                          {service.tasks.map((task, taskIndex) => {
                            const rowKey = getTaskRowKey(
                              service.serviceType,
                              task,
                              taskIndex
                            );
                            const options = taskStaffSearchResults[rowKey] || [];
                            const staffValue =
                              taskStaffSearchTerms[rowKey] ?? getAssignedStaffLabel(task);
                            return (
                              <div key={rowKey} className="job-card-task-table__row">
                                <label className="job-card-task-table__task">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(task.completed)}
                                    disabled={isReadOnly}
                                    onChange={() =>
                                      toggleTaskCompletion(serviceIndex, taskIndex)
                                    }
                                  />
                                  <span>
                                    {task.title}
                                    {task.isRequired ? " (Required)" : ""}
                                  </span>
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.25"
                                  value={task.laborHours ?? 0}
                                  disabled={isReadOnly}
                                  onChange={(event) =>
                                    updateTaskLaborField(
                                      serviceIndex,
                                      taskIndex,
                                      "laborHours",
                                      event.target.value
                                    )
                                  }
                                />
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={task.laborCharge ?? 0}
                                  disabled={isReadOnly}
                                  onChange={(event) =>
                                    updateTaskLaborField(
                                      serviceIndex,
                                      taskIndex,
                                      "laborCharge",
                                      event.target.value
                                    )
                                  }
                                />
                                <StaffSearchInput
                                  value={staffValue}
                                  options={options}
                                  disabled={isReadOnly}
                                  placeholder="8071302 - Staff Name"
                                  onChange={(value) =>
                                    queueTaskStaffSearch(
                                      serviceIndex,
                                      taskIndex,
                                      rowKey,
                                      value
                                    )
                                  }
                                  onSelect={(staff) => {
                                    setTaskStaffSearchTerms((prev) => ({
                                      ...prev,
                                      [rowKey]: formatStaffOptionLabel(staff),
                                    }));
                                    updateTaskAssignedStaff(serviceIndex, taskIndex, staff);
                                    setTaskStaffSearchResults((prev) => ({
                                      ...prev,
                                      [rowKey]: [],
                                    }));
                                  }}
                                />
                                <label className="job-card-task-table__billable">
                                  <input
                                    type="checkbox"
                                    checked={task.isBillable !== false}
                                    disabled={isReadOnly}
                                    onChange={(event) =>
                                      updateTaskLaborField(
                                        serviceIndex,
                                        taskIndex,
                                        "isBillable",
                                        event.target.checked
                                      )
                                    }
                                  />
                                  <span>Yes</span>
                                </label>
                              </div>
                            );
                          })}
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

            <div className="job-card-modal__section">
              <h3>Custom Tasks</h3>
              <p className="job-card-modal__muted">
                Manually add tasks not linked to any service type.
              </p>
              {customTasks.length > 0 ? (
                <div className="job-card-modal__tasks">
                  <div className="job-card-task-table">
                    <div className="job-card-task-table__head job-card-task-table__head--custom">
                      <span>Task Name</span>
                      <span>Labor Hours</span>
                      <span>Labor Charge (LKR)</span>
                      <span>Assigned Staff</span>
                      <span>Billable</span>
                      <span></span>
                    </div>
                    {customTasks.map((task, index) => {
                      const rowKey = `custom-${index}`;
                      const options = customTaskStaffSearchResults[rowKey] || [];
                      const staffValue =
                        customTaskStaffSearchTerms[rowKey] ??
                        getAssignedStaffLabel(task);
                      return (
                        <div key={index} className="job-card-task-table__row job-card-task-table__row--custom">
                          <input
                            type="text"
                            placeholder="Task description"
                            value={task.taskName}
                            disabled={isReadOnly}
                            onChange={(e) => updateCustomTaskField(index, "taskName", e.target.value)}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.25"
                            value={task.laborHours ?? 0}
                            disabled={isReadOnly}
                            onChange={(e) => updateCustomTaskField(index, "laborHours", e.target.value)}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={task.laborCharge ?? 0}
                            disabled={isReadOnly}
                            onChange={(e) => updateCustomTaskField(index, "laborCharge", e.target.value)}
                          />
                          <StaffSearchInput
                            value={staffValue}
                            options={options}
                            disabled={isReadOnly}
                            placeholder="8071302 - Staff Name"
                            onChange={(value) => queueCustomTaskStaffSearch(index, value)}
                            onSelect={(staff) => {
                              setCustomTaskStaffSearchTerms((prev) => ({
                                ...prev,
                                [rowKey]: formatStaffOptionLabel(staff),
                              }));
                              setCustomTasks((prev) =>
                                prev.map((t, i) =>
                                  i !== index
                                    ? t
                                    : {
                                        ...t,
                                        assignedStaffId: staff._id,
                                        assignedStaffSnapshot: {
                                          employeeNo: staff.employeeNo || "",
                                          name: staff.name || "",
                                        },
                                      }
                                )
                              );
                              setCustomTaskStaffSearchResults((prev) => ({
                                ...prev,
                                [rowKey]: [],
                              }));
                            }}
                          />
                          <label className="job-card-task-table__billable">
                            <input
                              type="checkbox"
                              checked={task.billable !== false}
                              disabled={isReadOnly}
                              onChange={(e) => updateCustomTaskField(index, "billable", e.target.checked)}
                            />
                            <span>Yes</span>
                          </label>
                          {!isReadOnly ? (
                            <button
                              type="button"
                              className="job-card-modal__service-remove"
                              onClick={() => removeCustomTask(index)}
                            >
                              Remove
                            </button>
                          ) : <span />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="job-card-modal__empty">No custom tasks added.</p>
              )}
              {!isReadOnly ? (
                <div className="job-card-modal__actions">
                  <button type="button" onClick={addCustomTask}>
                    + Add Custom Task
                  </button>
                </div>
              ) : null}
            </div>

            <div className="job-card-modal__section">
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
                        <span>Unit (Original)</span>
                        <span>Discount</span>
                        <span>Unit (Net)</span>
                        <span>Qty</span>
                        <span>Line Total (Net)</span>
                        <span>Action</span>
                      </div>
                      {partPricingRows.map((part) => {
                        return (
                          <div
                            key={part.key}
                            className="materials-table__row"
                          >
                            <span>{part.itemName}</span>
                            <span>{part.brand}</span>
                            <span>{part.variant}</span>
                            <span>{formatMoney(part.unitPriceOriginal)}</span>
                            <span>-{formatMoney(part.lineDiscountTotal)}</span>
                            <span>{formatMoney(part.unitPriceNet)}</span>
                            <span>
                              {part.quantity} {part.unit || ""}
                            </span>
                            <span>{formatMoney(part.lineTotalNet)}</span>
                            <button
                              type="button"
                              onClick={() =>
                                removePartUsage(
                                  String(part.key)
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
                      <span>Materials Subtotal (Original)</span>
                      <strong>{formatMoney(partsSubtotalOriginal)}</strong>
                    </div>
                    <div className="materials-total materials-total--discount">
                      <span>Items Discount</span>
                      <strong>-{formatMoney(partsDiscountTotal)}</strong>
                    </div>
                    <div className="materials-total">
                      <span>Materials Subtotal (After item discounts)</span>
                      <strong>{formatMoney(pricingPreview.subtotalParts)}</strong>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="job-card-modal__section job-card-modal__split">
              <div>
                <h3>Task Labor Charges</h3>
                <p className="job-card-modal__muted">
                  Labor is calculated from the service task rows.
                </p>
                <div className="job-card-labor-mini">
                  <span>Labor Charges (Original)</span>
                  <strong>{formatMoney(pricingPreview.laborChargesOriginal)}</strong>
                </div>
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
            </div>

            <div className="job-card-modal__section">
              <h3>Loyalty Rewards</h3>
              {loyaltyLoading ? (
                <p className="job-card-modal__muted">Checking rewards...</p>
              ) : availableRewards.length === 0 && appliedRewards.length === 0 ? (
                <p className="job-card-modal__muted">
                  No rewards available for this customer.
                </p>
              ) : (
                <div className="worker-select">
                  {availableRewards.map((reward) => {
                    const rewardKey = buildRewardSelectionKey(reward);
                    const isApplied = appliedRewards.some(
                      (appliedReward) =>
                        buildRewardSelectionKey(appliedReward) === rewardKey
                    );
                    return (
                      <label
                        key={rewardKey}
                        className={`worker-select__option ${
                          isApplied ? "is-selected" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="job-card-loyalty-reward"
                          checked={isApplied}
                          onChange={() => selectSingleReward(reward)}
                          disabled={isReadOnly}
                        />
                        <span className="worker-select__name">
                          {reward.ruleName}
                        </span>
                        <span className="worker-select__meta">
                          {formatRewardSummary(reward)}
                          {reward.milestoneNumber
                            ? ` • Milestone ${reward.milestoneNumber}`
                            : ""}
                        </span>
                      </label>
                    );
                  })}
                  {appliedRewards
                    .filter(
                      (applied) =>
                        !availableRewards.some(
                          (avail) =>
                            buildRewardSelectionKey(avail) ===
                            buildRewardSelectionKey(applied)
                        )
                    )
                    .map((reward) => (
                      <label
                        key={buildRewardSelectionKey(reward)}
                        className="worker-select__option is-selected"
                      >
                        <input
                          type="radio"
                          name="job-card-loyalty-reward"
                          checked={true}
                          onChange={() => selectSingleReward(reward)}
                          disabled={isReadOnly}
                        />
                        <span className="worker-select__name">
                          {reward.ruleName}
                        </span>
                        <span className="worker-select__meta">
                          Applied {formatRewardSummary(reward)}
                        </span>
                      </label>
                    ))}
                </div>
              )}
              {appliedRewards.length > 0 && !isReadOnly ? (
                <div className="job-card-modal__actions">
                  <button type="button" onClick={clearSelectedReward}>
                    Remove Selected Reward
                  </button>
                </div>
              ) : null}
            </div>

            <div className="job-card-modal__section">
              <h3>Totals</h3>
              <div className="job-card-pricing">
                <div className="job-card-pricing__row">
                  <span>Materials Subtotal (Original)</span>
                  <strong>{formatMoney(partsSubtotalOriginal)}</strong>
                </div>
                <div className="job-card-pricing__row is-discount">
                  <span>Items Discount</span>
                  <strong>-{formatMoney(partsDiscountTotal)}</strong>
                </div>
                <div className="job-card-pricing__row">
                  <span>Materials Subtotal (After item discounts)</span>
                  <strong>{formatMoney(pricingPreview.subtotalParts)}</strong>
                </div>
                <div className="job-card-pricing__row">
                  <span>Labor Charges (Original)</span>
                  <strong>{formatMoney(pricingPreview.laborChargesOriginal)}</strong>
                </div>
                {pricingPreview.selectedReward?.rewardType === "free_labor" ||
                pricingPreview.loyaltyLaborDiscount > 0 ? (
                  <div className="job-card-pricing__row is-discount">
                    <span>Loyalty Discount (Free Labor)</span>
                    <strong>-{formatMoney(pricingPreview.loyaltyLaborDiscount)}</strong>
                  </div>
                ) : null}
                <div className="job-card-pricing__row">
                  <span>Labor Charges (Net)</span>
                  <strong>{formatMoney(pricingPreview.laborChargesNet)}</strong>
                </div>
                <div className="job-card-pricing__row is-grand">
                  <span>Grand Total</span>
                  <strong>{formatMoney(pricingPreview.grandTotal)}</strong>
                </div>
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
                  disabled={isSaving}
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
                    disabled={invoiceLoading}
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
