import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { useLocalStorageState } from "../hooks/useLocalStorageState.js";
import { createId } from "../utils/id.js";
import api from "../services/api.js";
import {
  computeDraftPricing,
  formatFreeLaborRewardLabel,
} from "../utils/loyaltyPricing.js";
import {
  computeLaborSubtotalFromTasks,
  flattenServiceTasks,
  getTaskInstanceId,
  roundCurrency as roundTaskCurrency,
  toNonNegativeNumber,
} from "../utils/taskLabor.js";
import { getJobCards, saveJobCards } from "../utils/storage.js";
import "./JobCardNew.css";

const buildRewardKey = (reward) =>
  `${String(reward.ruleId)}:${String(reward.milestoneNumber ?? "legacy")}`;

function JobCardNew() {
  const [customers, setCustomers] = useLocalStorageState("ksc_customers", []);
  const [vehicles, setVehicles] = useLocalStorageState("ksc_vehicles", []);
  const [services, setServices] = useState([]);
  const [servicesError, setServicesError] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [selectedServices, setSelectedServices] = useState([]);
  const [serviceAddError, setServiceAddError] = useState("");
  const [serviceTasksDraft, setServiceTasksDraft] = useState([]);
  const staffSearchTimersRef = useRef({});
  const [taskStaffSearchTerms, setTaskStaffSearchTerms] = useState({});
  const [taskStaffSearchResults, setTaskStaffSearchResults] = useState({});
  const [notes, setNotes] = useState("");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [showOwnerForm, setShowOwnerForm] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newVehicleNumber, setNewVehicleNumber] = useState("");
  const [newVehicleBrand, setNewVehicleBrand] = useState("");
  const [newVehicleModel, setNewVehicleModel] = useState("");
  const [newVehicleYear, setNewVehicleYear] = useState("");
  const [brandOptions, setBrandOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [changeOwner, setChangeOwner] = useState(false);
  const [currentOwnerLocalId, setCurrentOwnerLocalId] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [vehicleLookupError, setVehicleLookupError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [loyaltyPreviewLoading, setLoyaltyPreviewLoading] = useState(false);
  const [loyaltyPopupOpen, setLoyaltyPopupOpen] = useState(false);
  const [loyaltyPopupRewards, setLoyaltyPopupRewards] = useState([]);
  const [selectedPopupRewardKey, setSelectedPopupRewardKey] = useState("");
  const [draftSuppressedMilestones, setDraftSuppressedMilestones] = useState([]);
  const [appliedRewards, setAppliedRewards] = useState([]);
  const navigate = useNavigate();

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

  const filteredOwners = useMemo(() => {
    const query = ownerSearch.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => {
      const nameMatch = customer.name?.toLowerCase().includes(query);
      const phoneMatch = customer.phone?.toLowerCase().includes(query);
      const emailMatch = customer.email?.toLowerCase().includes(query);
      return nameMatch || phoneMatch || emailMatch;
    });
  }, [ownerSearch, customers]);

  const ownerMatch = useMemo(() => {
    const query = ownerSearch.trim().toLowerCase();
    if (!query) return null;
    return (
      customers.find(
        (customer) =>
          customer.name?.toLowerCase() === query ||
          customer.phone?.toLowerCase() === query ||
          customer.email?.toLowerCase() === query
      ) || null
    );
  }, [ownerSearch, customers]);


  const filteredVehicles = useMemo(() => {
    const query = vehicleSearch.trim().toLowerCase();
    if (!query) return vehicles;
    return vehicles.filter((vehicle) =>
      vehicle.vehicleNumber?.toLowerCase().includes(query)
    );
  }, [vehicles, vehicleSearch]);

  const vehicleMatch = useMemo(() => {
    const query = vehicleSearch.trim().toLowerCase();
    if (!query) return null;
    return (
      vehicles.find(
        (vehicle) => vehicle.vehicleNumber?.toLowerCase() === query
      ) || null
    );
  }, [vehicles, vehicleSearch]);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear() + 1;
    const options = [];
    for (let value = current; value >= 1980; value -= 1) {
      options.push(String(value));
    }
    return options;
  }, []);

  useEffect(() => {
    return () => {
      Object.values(staffSearchTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
    };
  }, []);

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
    const loadBrands = async () => {
      try {
        const { data } = await api.get("/vehicle-master/brands", {
          params: { active: true },
        });
        setBrandOptions(Array.isArray(data) ? data : []);
      } catch (error) {
        setBrandOptions([]);
      }
    };
    loadBrands();
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      if (!selectedBrandId) {
        setModelOptions([]);
        return;
      }
      try {
        const { data } = await api.get("/vehicle-master/models", {
          params: { active: true, brandId: selectedBrandId },
        });
        setModelOptions(Array.isArray(data) ? data : []);
      } catch (error) {
        setModelOptions([]);
      }
    };
    loadModels();
  }, [selectedBrandId]);

  const matchedBrand = useMemo(
    () =>
      brandOptions.find(
        (brand) =>
          brand.name?.toLowerCase() ===
          newVehicleBrand.trim().toLowerCase()
      ) || null,
    [brandOptions, newVehicleBrand]
  );

  const matchedModel = useMemo(
    () =>
      modelOptions.find(
        (model) =>
          model.name?.toLowerCase() ===
          newVehicleModel.trim().toLowerCase()
      ) || null,
    [modelOptions, newVehicleModel]
  );

  useEffect(() => {
    if (matchedBrand) {
      setSelectedBrandId(matchedBrand._id || matchedBrand.id);
    } else {
      setSelectedBrandId("");
      setSelectedModelId("");
      setModelOptions([]);
      setNewVehicleModel("");
    }
  }, [matchedBrand]);

  useEffect(() => {
    if (matchedModel) {
      setSelectedModelId(matchedModel._id || matchedModel.id);
    } else {
      setSelectedModelId("");
    }
  }, [matchedModel]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === vehicleId) || null,
    [vehicleId, vehicles]
  );

  const currentOwnerId = useMemo(() => {
    if (currentOwnerLocalId) return currentOwnerLocalId;
    if (!selectedVehicle) return "";
    return selectedVehicle.currentOwnerId || selectedVehicle.customerId || "";
  }, [currentOwnerLocalId, selectedVehicle]);

  const currentOwner = useMemo(
    () =>
      customers.find((customer) => customer.id === currentOwnerId) || null,
    [customers, currentOwnerId]
  );

  const selectedServiceTypeIds = useMemo(
    () =>
      [
        ...new Set(
          selectedServices
            .map((service) => String(service.serviceType || "").trim())
            .filter(Boolean)
        ),
      ],
    [selectedServices]
  );

  const selectedServiceSignature = useMemo(
    () => selectedServiceTypeIds.join(","),
    [selectedServiceTypeIds]
  );

  const activeOwnerLocalIdForPreview = useMemo(() => {
    if (changeOwner && ownerId) {
      return ownerId;
    }
    return currentOwnerId || "";
  }, [changeOwner, ownerId, currentOwnerId]);

  const previewOwner = useMemo(
    () =>
      customers.find((customer) => customer.id === activeOwnerLocalIdForPreview) ||
      null,
    [customers, activeOwnerLocalIdForPreview]
  );

  const previewCustomerMongoId = previewOwner?.mongoId || "";

  const jobCardTasks = useMemo(
    () =>
      flattenServiceTasks(selectedServices).map((task) => ({
        ...task,
        id: task.taskInstanceId || task.id,
        selected:
          task.selected !== undefined
            ? Boolean(task.selected)
            : Boolean(task.completed),
        billable:
          task.billable !== undefined
            ? Boolean(task.billable)
            : task.isBillable !== false,
        laborHours: roundTaskCurrency(toNonNegativeNumber(task.laborHours)),
        laborCharge: roundTaskCurrency(toNonNegativeNumber(task.laborCharge)),
      })),
    [selectedServices]
  );

  const laborChargesOriginal = useMemo(
    () => computeLaborSubtotalFromTasks(jobCardTasks),
    [jobCardTasks]
  );

  const pricingPreview = useMemo(
    () =>
      computeDraftPricing({
        partsSubtotal: 0,
        laborChargesOriginal,
        appliedRewards,
      }),
    [appliedRewards, laborChargesOriginal]
  );

  useEffect(() => {
    setAppliedRewards([]);
    setDraftSuppressedMilestones([]);
    setLoyaltyPopupRewards([]);
    setSelectedPopupRewardKey("");
    setLoyaltyPopupOpen(false);
  }, [previewCustomerMongoId]);

  useEffect(() => {
    if (!selectedVehicle) {
      setChangeOwner(false);
      setOwnerId("");
      setOwnerSearch("");
      setShowOwnerForm(false);
      setCurrentOwnerLocalId("");
      setAppliedRewards([]);
      setDraftSuppressedMilestones([]);
      setLoyaltyPopupRewards([]);
      setSelectedPopupRewardKey("");
      setLoyaltyPopupOpen(false);
      return;
    }
    setChangeOwner(!currentOwnerId);
    setOwnerId("");
    setOwnerSearch("");
    setShowOwnerForm(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerEmail("");
    setAppliedRewards([]);
    setDraftSuppressedMilestones([]);
    setLoyaltyPopupRewards([]);
    setSelectedPopupRewardKey("");
    setLoyaltyPopupOpen(false);
  }, [currentOwnerId, selectedVehicle]);

  useEffect(() => {
    const loadServices = async () => {
      try {
        const { data } = await api.get("/services");
        setServices(Array.isArray(data) ? data : []);
      } catch (error) {
        setServicesError(
          error.response?.data?.message ||
            "Unable to load service types right now."
        );
      }
    };
    loadServices();
  }, []);

  const activeServices = useMemo(
    () => services.filter((service) => service.active !== false),
    [services]
  );

  const selectedService = useMemo(
    () =>
      activeServices.find(
        (service) => String(service._id || service.id) === String(serviceId)
      ),
    [activeServices, serviceId]
  );

  const selectedServiceNames = useMemo(() => {
    const map = new Map(
      activeServices.map((service) => [
        String(service._id || service.id),
        service.name,
      ])
    );
    return map;
  }, [activeServices]);

  const isServiceAlreadyAdded = useMemo(
    () =>
      selectedServices.some(
        (service) =>
          String(service.serviceType) === String(serviceId)
      ),
    [selectedServices, serviceId]
  );

  useEffect(() => {
    if (!selectedService) {
      setServiceTasksDraft([]);
      return;
    }
    const serviceKey = String(selectedService._id || selectedService.id || "");
    const tasks = Array.isArray(selectedService.tasks)
      ? selectedService.tasks
          .map((task, taskIndex) => {
            const taskId = task._id || task.id || null;
            return {
              taskInstanceId: getTaskInstanceId(
                serviceKey,
                {
                  taskId,
                  title: task.title,
                  taskName: task.title,
                },
                taskIndex
              ),
              taskId,
              taskName: task.title,
              title: task.title,
              isRequired: Boolean(task.isRequired),
              selected: false,
              completed: false,
              laborHours: roundTaskCurrency(
                toNonNegativeNumber(task.laborHoursDefault)
              ),
              laborCharge: roundTaskCurrency(
                toNonNegativeNumber(task.laborChargeDefault)
              ),
              isBillable:
                task.isBillable !== undefined ? Boolean(task.isBillable) : true,
              assignedStaffId: null,
              assignedStaffSnapshot: { employeeNo: "", name: "" },
            };
          })
          .filter((task) => task.title)
      : [];
    setServiceTasksDraft(tasks);
  }, [selectedService]);

  const handleAddService = () => {
    if (!selectedService) return;
    const serviceKey = String(selectedService._id || selectedService.id);
    const exists = selectedServices.some(
      (service) => String(service.serviceType) === serviceKey
    );
    if (exists) {
      setServiceAddError("Service type already added.");
      return;
    }
    const tasks = serviceTasksDraft
      .map((task, taskIndex) => {
        const taskId = task.taskId ? String(task.taskId) : null;
        return {
          taskInstanceId: getTaskInstanceId(
            serviceKey,
            {
              taskInstanceId: task.taskInstanceId,
              taskId,
              title: task.title,
              taskName: task.taskName || task.title,
            },
            taskIndex
          ),
          taskId,
          taskName: task.taskName || task.title,
          title: task.title,
          isRequired: Boolean(task.isRequired),
          selected: Boolean(task.completed ?? task.selected),
          completed: Boolean(task.completed),
          laborHours: roundTaskCurrency(toNonNegativeNumber(task.laborHours)),
          laborCharge: roundTaskCurrency(toNonNegativeNumber(task.laborCharge)),
          isBillable:
            task.isBillable !== undefined ? Boolean(task.isBillable) : true,
          assignedStaffId: task.assignedStaffId || null,
          assignedStaffSnapshot: {
            employeeNo: String(task?.assignedStaffSnapshot?.employeeNo || "").trim(),
            name: String(task?.assignedStaffSnapshot?.name || "").trim(),
          },
        };
      })
      .filter((task) => task.title);
    setSelectedServices((prev) => [
      ...prev,
      {
        serviceType: serviceKey,
        tasks,
      },
    ]);
    setServiceId("");
    setServiceTasksDraft([]);
    setServiceAddError("");
  };

  const handleRemoveService = (serviceType) => {
    setSelectedServices((prev) =>
      prev.filter(
        (service) => String(service.serviceType) !== String(serviceType)
      )
    );
  };

  const toggleSelectedTask = (serviceType, taskIndex) => {
    setSelectedServices((prev) =>
      prev.map((service) => {
        if (String(service.serviceType) !== String(serviceType)) return service;
        const tasks = (service.tasks || []).map((task, index) =>
          index === taskIndex
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

  const updateSelectedTaskLabor = (serviceType, taskIndex, field, value) => {
    setSelectedServices((prev) =>
      prev.map((service) => {
        if (String(service.serviceType) !== String(serviceType)) return service;
        const tasks = (service.tasks || []).map((task, index) => {
          if (index !== taskIndex) return task;
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

  const toggleSelectAllTasks = (serviceType) => {
    setSelectedServices((prev) =>
      prev.map((service) => {
        if (String(service.serviceType) !== String(serviceType)) return service;
        const tasks = service.tasks || [];
        const shouldSelectAll = tasks.some((task) => !task.completed);
        return {
          ...service,
          tasks: tasks.map((task) => ({
            ...task,
            completed: shouldSelectAll,
            selected: shouldSelectAll,
          })),
        };
      })
    );
  };

  const getTaskRowKey = (serviceType, task, taskIndex) =>
    getTaskInstanceId(String(serviceType || ""), task, taskIndex);

  const formatStaffOptionLabel = (staff) =>
    `${String(staff?.employeeNo || "").trim()} - ${String(staff?.name || "").trim()}`;

  const getTaskAssignedLabel = (task) => {
    const employeeNo = String(task?.assignedStaffSnapshot?.employeeNo || "").trim();
    const name = String(task?.assignedStaffSnapshot?.name || "").trim();
    if (!employeeNo && !name) return "";
    return `${employeeNo} - ${name}`.trim();
  };

  const updateTaskAssignedStaff = (serviceType, taskIndex, staff) => {
    setSelectedServices((prev) =>
      prev.map((service) => {
        if (String(service.serviceType) !== String(serviceType)) return service;
        const tasks = (service.tasks || []).map((task, index) => {
          if (index !== taskIndex) return task;
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

  const queueTaskStaffSearch = (serviceType, taskIndex, rowKey, nextValue) => {
    setTaskStaffSearchTerms((prev) => ({ ...prev, [rowKey]: nextValue }));
    const query = String(nextValue || "").trim();
    const currentOptions = taskStaffSearchResults[rowKey] || [];
    const exactMatch = currentOptions.find(
      (staff) => formatStaffOptionLabel(staff).toLowerCase() === query.toLowerCase()
    );
    if (exactMatch) {
      updateTaskAssignedStaff(serviceType, taskIndex, exactMatch);
    } else if (!query) {
      updateTaskAssignedStaff(serviceType, taskIndex, null);
    }

    if (staffSearchTimersRef.current[rowKey]) {
      clearTimeout(staffSearchTimersRef.current[rowKey]);
    }
    if (!query) {
      setTaskStaffSearchResults((prev) => ({ ...prev, [rowKey]: [] }));
      return;
    }

    staffSearchTimersRef.current[rowKey] = setTimeout(async () => {
      try {
        const { data } = await api.get("/staff/search", { params: { q: query } });
        const rows = Array.isArray(data) ? data : [];
        setTaskStaffSearchResults((prev) => ({ ...prev, [rowKey]: rows }));
        const matched = rows.find(
          (staff) => formatStaffOptionLabel(staff).toLowerCase() === query.toLowerCase()
        );
        if (matched) {
          updateTaskAssignedStaff(serviceType, taskIndex, matched);
        }
      } catch (error) {
        handleAuthRedirect(error.response?.status);
        setTaskStaffSearchResults((prev) => ({ ...prev, [rowKey]: [] }));
      }
    }, 300);
  };

  const normalizePreviewReward = (reward) => {
    if (!reward || !reward.ruleId) return null;
    const milestoneNumber =
      reward.milestoneNumber === null ||
      reward.milestoneNumber === undefined ||
      reward.milestoneNumber === ""
        ? null
        : Number(reward.milestoneNumber);

    const normalized = {
      rewardId: reward.rewardId || reward._id || null,
      ruleId: String(reward.ruleId),
      ruleName: reward.ruleName || "Loyalty Reward",
      rewardType: reward.rewardType || "",
      rewardValue: Number(reward.rewardValue) || 0,
      rewardDiscountMode: reward.rewardDiscountMode || null,
      rewardDiscountValue:
        reward.rewardDiscountValue !== undefined &&
        reward.rewardDiscountValue !== null
          ? Number(reward.rewardDiscountValue)
          : null,
      rewardDiscountCap:
        reward.rewardDiscountCap !== undefined && reward.rewardDiscountCap !== null
          ? Number(reward.rewardDiscountCap)
          : null,
      milestoneNumber:
        Number.isFinite(milestoneNumber) && milestoneNumber > 0
          ? milestoneNumber
          : null,
      suppressionKey:
        reward.suppressionKey ||
        `${String(reward.ruleId)}:${String(
          Number.isFinite(milestoneNumber) && milestoneNumber > 0
            ? milestoneNumber
            : "legacy"
        )}`,
    };

    return normalized;
  };

  const removeAppliedReward = (rewardKey) => {
    setAppliedRewards((prev) =>
      prev.filter((reward) => buildRewardKey(reward) !== rewardKey)
    );
  };

  const handleApplyLoyaltyRewards = () => {
    const selectedReward = loyaltyPopupRewards.find(
      (reward) => reward.suppressionKey === selectedPopupRewardKey
    );
    if (!selectedReward) {
      setLoyaltyPopupOpen(false);
      setLoyaltyPopupRewards([]);
      setSelectedPopupRewardKey("");
      return;
    }

    setAppliedRewards([
      {
        rewardId: selectedReward.rewardId || null,
        ruleId: selectedReward.ruleId,
        ruleName: selectedReward.ruleName,
        rewardType: selectedReward.rewardType,
        rewardValue: selectedReward.rewardValue,
        rewardDiscountMode: selectedReward.rewardDiscountMode ?? null,
        rewardDiscountValue: selectedReward.rewardDiscountValue ?? null,
        rewardDiscountCap: selectedReward.rewardDiscountCap ?? null,
        milestoneNumber: selectedReward.milestoneNumber,
      },
    ]);

    setDraftSuppressedMilestones((prev) => [
      ...new Set([
        ...prev,
        selectedReward.suppressionKey,
      ]),
    ]);
    setLoyaltyPopupOpen(false);
    setLoyaltyPopupRewards([]);
    setSelectedPopupRewardKey("");
  };

  const handleSkipLoyaltyPopup = () => {
    setDraftSuppressedMilestones((prev) => [
      ...new Set([
        ...prev,
        ...loyaltyPopupRewards.map((reward) => reward.suppressionKey),
      ]),
    ]);
    setLoyaltyPopupOpen(false);
    setLoyaltyPopupRewards([]);
    setSelectedPopupRewardKey("");
  };

  useEffect(() => {
    if (!previewCustomerMongoId || !selectedServiceSignature) {
      setLoyaltyPopupOpen(false);
      setLoyaltyPopupRewards([]);
      setSelectedPopupRewardKey("");
      setLoyaltyPreviewLoading(false);
      return;
    }

    let cancelled = false;
    const loadLoyaltyPreview = async () => {
      setLoyaltyPreviewLoading(true);
      try {
        const { data } = await api.get(
          `/loyalty/customer/${previewCustomerMongoId}/job-card-preview`,
          {
            params: { serviceTypeIds: selectedServiceSignature },
          }
        );

        if (cancelled) return;

        const normalizedRewards = (data?.rewardsAvailable || [])
          .map(normalizePreviewReward)
          .filter(Boolean);

        const unappliedRewards = normalizedRewards.filter((reward) => {
          const key = buildRewardKey(reward);
          return !appliedRewards.some(
            (appliedReward) => buildRewardKey(appliedReward) === key
          );
        });

        const unsuppressedRewards = unappliedRewards.filter(
          (reward) => !draftSuppressedMilestones.includes(reward.suppressionKey)
        );

        if ((data?.shouldShowPopup || false) && unsuppressedRewards.length > 0) {
          setLoyaltyPopupRewards(unsuppressedRewards);
          setSelectedPopupRewardKey(unsuppressedRewards[0].suppressionKey);
          setLoyaltyPopupOpen(true);
        }
      } catch (error) {
        handleAuthRedirect(error.response?.status);
      } finally {
        if (!cancelled) {
          setLoyaltyPreviewLoading(false);
        }
      }
    };

    loadLoyaltyPreview();
    return () => {
      cancelled = true;
    };
  }, [
    previewCustomerMongoId,
    selectedServiceSignature,
    appliedRewards,
    draftSuppressedMilestones,
  ]);

  const handleAuthRedirect = (status) => {
    if (status === 401 || status === 403) {
      navigate("/login", { replace: true });
    }
  };

  const upsertCustomerFromServer = (serverCustomer) => {
    if (!serverCustomer) return "";
    const mongoId = serverCustomer._id || serverCustomer.id;
    let resolvedLocalId = "";
    setCustomers((prev) => {
      const next = [...prev];
      const existingIndex = next.findIndex(
        (entry) =>
          entry.mongoId === mongoId ||
          (entry.phone && serverCustomer.phone && entry.phone === serverCustomer.phone)
      );
      if (existingIndex >= 0) {
        const existing = next[existingIndex];
        resolvedLocalId = existing.id;
        next[existingIndex] = {
          ...existing,
          name: serverCustomer.name || existing.name,
          phone: serverCustomer.phone || existing.phone,
          email: serverCustomer.email || existing.email,
          mongoId,
        };
      } else {
        resolvedLocalId = createId("cust");
        next.push({
          id: resolvedLocalId,
          mongoId,
          name: serverCustomer.name || "",
          phone: serverCustomer.phone || "",
          email: serverCustomer.email || "",
        });
      }
      return next;
    });
    return resolvedLocalId;
  };

  const upsertVehicleFromServer = (serverVehicle) => {
    if (!serverVehicle) return "";
    const mongoId = serverVehicle._id || serverVehicle.id;
    let resolvedLocalId = "";
    setVehicles((prev) => {
      const next = [...prev];
      const existingIndex = next.findIndex(
        (entry) =>
          entry.mongoId === mongoId ||
          entry.vehicleNumber?.toLowerCase() ===
            serverVehicle.vehicleNumber?.toLowerCase()
      );
      if (existingIndex >= 0) {
        const existing = next[existingIndex];
        resolvedLocalId = existing.id;
        next[existingIndex] = {
          ...existing,
          mongoId,
          vehicleNumber: serverVehicle.vehicleNumber,
          brandId: serverVehicle.brandId,
          brandName: serverVehicle.brandName,
          modelId: serverVehicle.modelId,
          modelName: serverVehicle.modelName,
          mongoCustomerId: serverVehicle.currentOwnerId || serverVehicle.customerId,
        };
      } else {
        resolvedLocalId = createId("veh");
        next.push({
          id: resolvedLocalId,
          mongoId,
          vehicleNumber: serverVehicle.vehicleNumber,
          brandId: serverVehicle.brandId,
          brandName: serverVehicle.brandName,
          modelId: serverVehicle.modelId,
          modelName: serverVehicle.modelName,
          mongoCustomerId: serverVehicle.currentOwnerId || serverVehicle.customerId,
        });
      }
      return next;
    });
    return resolvedLocalId;
  };

  useEffect(() => {
    const query = vehicleSearch.trim().toLowerCase();
    if (!query || query.length < 3) {
      setVehicleLookupError("");
      return;
    }
    const timeout = setTimeout(async () => {
      setVehicleLookupError("");
      try {
        const { data: vehicleData } = await api.get("/vehicles");
        const match =
          (vehicleData || []).find(
            (vehicle) =>
              vehicle.vehicleNumber?.toLowerCase() === query
          ) || null;
        if (!match) return;

        const localVehicleId = upsertVehicleFromServer(match);
        if (localVehicleId) {
          setVehicleId(localVehicleId);
        }

        const { data: customerData } = await api.get("/customers");
        const ownerMongoId = match.currentOwnerId || match.customerId;
        const ownerMatch =
          (customerData || []).find(
            (customer) => String(customer._id) === String(ownerMongoId)
          ) || null;
        const localOwnerId = upsertCustomerFromServer(ownerMatch);
        if (localOwnerId) {
          setCurrentOwnerLocalId(localOwnerId);
        }
      } catch (error) {
        handleAuthRedirect(error.response?.status);
        setVehicleLookupError(
          error.response?.data?.message ||
            "Unable to load vehicle details right now."
        );
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [vehicleSearch]);

  const ensureCustomerSynced = async (customer) => {
    if (!customer) return null;
    if (customer.mongoId) return customer.mongoId;
    const { data } = await api.post("/customers", {
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
    });
    const mongoId = data?._id || data?.id;
    if (mongoId) {
      setCustomers((prev) =>
        prev.map((entry) =>
          entry.id === customer.id ? { ...entry, mongoId } : entry
        )
      );
    }
    return mongoId;
  };

  const resolveVehicleMasterIds = async (vehicle) => {
    const existingBrandId = vehicle.brandId;
    const existingModelId = vehicle.modelId;
    if (existingBrandId && existingModelId) {
      return { brandId: existingBrandId, modelId: existingModelId };
    }
    const brandName = vehicle.brandName || vehicle.brand || "";
    const modelName = vehicle.modelName || vehicle.model || "";
    if (!brandName || !modelName) return null;

    let brand =
      brandOptions.find(
        (entry) =>
          entry.name?.toLowerCase() === brandName.toLowerCase()
      ) || null;
    if (!brand) {
      try {
        const { data } = await api.get("/vehicle-master/brands", {
          params: { active: true },
        });
        brand =
          (data || []).find(
            (entry) =>
              entry.name?.toLowerCase() === brandName.toLowerCase()
          ) || null;
      } catch (error) {
        return null;
      }
    }
    if (!brand) return null;

    try {
      const { data } = await api.get("/vehicle-master/models", {
        params: { active: true, brandId: brand._id || brand.id },
      });
      const model =
        (data || []).find(
          (entry) =>
            entry.name?.toLowerCase() === modelName.toLowerCase()
        ) || null;
      if (!model) return null;
      return {
        brandId: brand._id || brand.id,
        modelId: model._id || model.id,
      };
    } catch (error) {
      return null;
    }
  };

  const ensureVehicleSynced = async (vehicle, ownerMongoId) => {
    if (!vehicle) return null;
    if (vehicle.mongoId) return vehicle.mongoId;
    if (!ownerMongoId) {
      throw new Error("Owner sync required before vehicle sync");
    }
    const resolvedMaster = await resolveVehicleMasterIds(vehicle);
    if (!resolvedMaster) {
      throw new Error(
        "Assign a valid brand and model from Vehicle Master before syncing"
      );
    }
    if (!vehicle.brandId || !vehicle.modelId) {
      setVehicles((prev) =>
        prev.map((entry) =>
          entry.id === vehicle.id
            ? {
                ...entry,
                brandId: resolvedMaster.brandId,
                modelId: resolvedMaster.modelId,
              }
            : entry
        )
      );
    }
    const { data } = await api.post("/vehicles", {
      customerId: ownerMongoId,
      currentOwnerId: ownerMongoId,
      vehicleNumber: vehicle.vehicleNumber,
      brandId: resolvedMaster.brandId,
      modelId: resolvedMaster.modelId,
      year: vehicle.year,
    });
    const mongoId = data?._id || data?.id;
    if (mongoId) {
      setVehicles((prev) =>
        prev.map((entry) =>
          entry.id === vehicle.id
            ? {
                ...entry,
                mongoId,
                mongoCustomerId: ownerMongoId,
                currentOwnerId:
                  entry.currentOwnerId || entry.customerId || ownerId,
              }
            : entry
        )
      );
    }
    return mongoId;
  };

  const assignOwnerToVehicle = async (ownerLocalId, ownerMongoId) => {
    if (!ownerLocalId) return;
    if (!selectedVehicle) {
      setOwnerId(ownerLocalId);
      return;
    }
    let resolvedMongoId = ownerMongoId;
    if (!resolvedMongoId) {
      const owner = customers.find((customer) => customer.id === ownerLocalId);
      resolvedMongoId = await ensureCustomerSynced(owner);
    }
    if (selectedVehicle.mongoId && resolvedMongoId) {
      await api.patch(`/vehicles/${selectedVehicle.mongoId}`, {
        currentOwnerId: resolvedMongoId,
        customerId: resolvedMongoId,
      });
    }
    setVehicles((prev) =>
      prev.map((entry) =>
        entry.id === selectedVehicle.id
          ? {
              ...entry,
              customerId: ownerLocalId,
              currentOwnerId: ownerLocalId,
              mongoCustomerId: resolvedMongoId ?? entry.mongoCustomerId,
            }
          : entry
      )
    );
    setOwnerId(ownerLocalId);
  };

  const handleVehicleSave = async () => {
    const trimmedNumber = newVehicleNumber.trim();
    const trimmedBrand = newVehicleBrand.trim();
    const trimmedModel = newVehicleModel.trim();
    const trimmedYear = newVehicleYear.trim();
    const brand = matchedBrand;
    const model = matchedModel;
    if (!trimmedNumber || !trimmedBrand || !trimmedModel || !trimmedYear) {
      return;
    }
    if (!brand || !model) {
      setSyncError("Select a valid brand and model from the master list.");
      return;
    }
    const resolvedOwnerId = ownerId || currentOwnerId;
    const existingVehicle = vehicles.find(
      (vehicle) =>
        vehicle.vehicleNumber?.toLowerCase() === trimmedNumber.toLowerCase()
    );
    if (existingVehicle) {
      setVehicleId(existingVehicle.id);
      setVehicleSearch(existingVehicle.vehicleNumber);
      setShowVehicleForm(false);
      setSyncError("Vehicle already exists. Selecting the existing record.");
      return;
    }
    const newVehicle = {
      id: createId("veh"),
      customerId: resolvedOwnerId,
      currentOwnerId: resolvedOwnerId,
      vehicleNumber: trimmedNumber,
      brandId: brand._id || brand.id,
      brandName: brand.name,
      modelId: model._id || model.id,
      modelName: model.name,
      year: trimmedYear,
    };
    if (!resolvedOwnerId) {
      setVehicles((prev) => [newVehicle, ...prev]);
      setVehicleId(newVehicle.id);
      setVehicleSearch(trimmedNumber);
      setShowVehicleForm(false);
      setNewVehicleNumber("");
      setNewVehicleBrand("");
      setNewVehicleModel("");
      setNewVehicleYear("");
      setSelectedBrandId("");
      setSelectedModelId("");
      setSyncError("Vehicle saved locally. Assign an owner to sync.");
      return;
    }
    setIsSyncing(true);
    setSyncError("");
    try {
      const selectedOwner = customers.find(
        (customer) => customer.id === resolvedOwnerId
      );
      const ownerMongoId = await ensureCustomerSynced(selectedOwner);
      if (!ownerMongoId) {
        throw new Error("Owner sync failed");
      }
      const { data } = await api.post("/vehicles", {
        customerId: ownerMongoId,
        currentOwnerId: ownerMongoId,
        vehicleNumber: newVehicle.vehicleNumber,
        brandId: newVehicle.brandId,
        modelId: newVehicle.modelId,
        year: newVehicle.year,
      });
      const mongoId = data?._id || data?.id;
      setVehicles((prev) => [
        { ...newVehicle, mongoId, mongoCustomerId: ownerMongoId },
        ...prev,
      ]);
      setVehicleId(newVehicle.id);
      setVehicleSearch(trimmedNumber);
      setShowVehicleForm(false);
      setNewVehicleNumber("");
      setNewVehicleBrand("");
      setNewVehicleModel("");
      setNewVehicleYear("");
      setSelectedBrandId("");
      setSelectedModelId("");
    } catch (error) {
      handleAuthRedirect(error.response?.status);
      setSyncError(
        error.response?.data?.message ||
          "Unable to save vehicle right now. Please try again."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOwnerSave = async () => {
    if (!selectedVehicle) {
      setSyncError("Select a vehicle before updating the owner.");
      return;
    }
    setIsSyncing(true);
    setSyncError("");
    try {
      let resolvedOwnerId = changeOwner ? ownerId : currentOwnerId;
      let ownerMongoId = null;
      if (resolvedOwnerId) {
        const selectedOwner = customers.find(
          (customer) => customer.id === resolvedOwnerId
        );
        ownerMongoId = await ensureCustomerSynced(selectedOwner);
      } else if (changeOwner) {
        const trimmedName = newCustomerName.trim();
        const trimmedPhone = newCustomerPhone.trim();
        if (!trimmedName || !trimmedPhone) {
          setSyncError("Enter the new owner details before saving.");
          return;
        }
        const normalizedName = trimmedName.toLowerCase();
        const normalizedPhone = trimmedPhone.toLowerCase();
        const normalizedEmail = newCustomerEmail.trim().toLowerCase();
        const existingCustomer = customers.find(
          (customer) =>
            customer.phone?.toLowerCase() === normalizedPhone ||
            (normalizedEmail &&
              customer.email?.toLowerCase() === normalizedEmail) ||
            customer.name?.toLowerCase() === normalizedName
        );
        if (existingCustomer) {
          resolvedOwnerId = existingCustomer.id;
          ownerMongoId = await ensureCustomerSynced(existingCustomer);
        } else {
          const newCustomer = {
            id: createId("cust"),
            name: trimmedName,
            phone: trimmedPhone,
            email: newCustomerEmail.trim(),
          };
          const { data } = await api.post("/customers", {
            name: newCustomer.name,
            phone: newCustomer.phone,
            email: newCustomer.email,
          });
          const mongoId = data?._id || data?.id;
          ownerMongoId = mongoId || null;
          setCustomers((prev) => [{ ...newCustomer, mongoId }, ...prev]);
          resolvedOwnerId = newCustomer.id;
        }
      } else {
        setSyncError("No owner on record. Enable change owner to assign one.");
        return;
      }

      if (!ownerMongoId) {
        throw new Error("Owner sync failed");
      }

      await ensureVehicleSynced(selectedVehicle, ownerMongoId);
      if (changeOwner && resolvedOwnerId !== currentOwnerId) {
        await assignOwnerToVehicle(resolvedOwnerId, ownerMongoId);
        setCurrentOwnerLocalId(resolvedOwnerId);
      }
      setChangeOwner(false);
      setOwnerId("");
      setOwnerSearch("");
      setShowOwnerForm(false);
      setConfirmText("");
    } catch (error) {
      handleAuthRedirect(error.response?.status);
      setSyncError(
        error.response?.data?.message ||
          "Unable to update owner right now. Please try again."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!vehicleId || selectedServices.length === 0) return;
    const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
    const vehicleOwnerId = currentOwnerId;
    let resolvedOwnerId = vehicleOwnerId;
    let ownerMongoId = null;
    if (changeOwner) {
      if (ownerId) {
        resolvedOwnerId = ownerId;
        const selectedOwner = customers.find(
          (customer) => customer.id === resolvedOwnerId
        );
        ownerMongoId = await ensureCustomerSynced(selectedOwner);
      } else {
        const trimmedName = newCustomerName.trim();
        const trimmedPhone = newCustomerPhone.trim();
        if (!trimmedName || !trimmedPhone) {
          setSyncError("Select or add a new owner before submitting.");
          return;
        }
        const normalizedName = trimmedName.toLowerCase();
        const normalizedPhone = trimmedPhone.toLowerCase();
        const normalizedEmail = newCustomerEmail.trim().toLowerCase();
        const existingCustomer = customers.find(
          (customer) =>
            customer.phone?.toLowerCase() === normalizedPhone ||
            (normalizedEmail &&
              customer.email?.toLowerCase() === normalizedEmail) ||
            customer.name?.toLowerCase() === normalizedName
        );
        if (existingCustomer) {
          resolvedOwnerId = existingCustomer.id;
          ownerMongoId = await ensureCustomerSynced(existingCustomer);
        } else {
          const newCustomer = {
            id: createId("cust"),
            name: trimmedName,
            phone: trimmedPhone,
            email: newCustomerEmail.trim(),
          };
          const { data } = await api.post("/customers", {
            name: newCustomer.name,
            phone: newCustomer.phone,
            email: newCustomer.email,
          });
          const mongoId = data?._id || data?.id;
          ownerMongoId = mongoId || null;
          setCustomers((prev) => [{ ...newCustomer, mongoId }, ...prev]);
          resolvedOwnerId = newCustomer.id;
        }
      }
    } else {
      if (!resolvedOwnerId) {
        setSyncError("No owner on record. Enable change owner to assign.");
        return;
      }
      const selectedOwner = customers.find(
        (customer) => customer.id === resolvedOwnerId
      );
      ownerMongoId = await ensureCustomerSynced(selectedOwner);
    }
    setIsSyncing(true);
    setSyncError("");
    try {
      if (!ownerMongoId) {
        throw new Error("Owner sync failed");
      }
      const vehicleMongoId = await ensureVehicleSynced(selectedVehicle, ownerMongoId);
      if (changeOwner && resolvedOwnerId !== vehicleOwnerId) {
        await assignOwnerToVehicle(resolvedOwnerId, ownerMongoId);
      }
      const localJobCardNo = `jc_${Date.now()}`;
      const createdAtIso = new Date().toISOString();
      const { data: createdJobCard } = await api.post("/job-cards", {
        jobCardNo: localJobCardNo,
        ownerId: ownerMongoId || resolvedOwnerId,
        customerId: ownerMongoId || resolvedOwnerId,
        vehicleId: vehicleMongoId || selectedVehicle?.mongoId || vehicleId,
        services: selectedServices,
        appliedRewards: appliedRewards.slice(0, 1),
        laborCharges: pricingPreview.laborChargesOriginal,
        workNotes: notes.trim(),
        status: "OPEN",
        createdAt: createdAtIso,
      });
      const mongoId = createdJobCard?._id || createdJobCard?.id;
      const persistedJobCardNo = createdJobCard?.jobCardNo || localJobCardNo;
      const newJobCard = {
        id: persistedJobCardNo,
        mongoId: mongoId || null,
        ownerId: resolvedOwnerId,
        customerId: resolvedOwnerId,
        vehicleId,
        serviceTypeIds:
          createdJobCard?.serviceTypeIds ||
          selectedServices.map((service) => String(service?.serviceType || "")).filter(Boolean),
        services: createdJobCard?.services || selectedServices,
        appliedRewards:
          Array.isArray(createdJobCard?.appliedRewards) &&
          createdJobCard.appliedRewards.length > 0
            ? [createdJobCard.appliedRewards[0]]
            : appliedRewards.slice(0, 1),
        laborCharges:
          createdJobCard?.laborChargesOriginal ??
          createdJobCard?.laborCharges ??
          pricingPreview.laborChargesOriginal,
        laborChargesOriginal:
          createdJobCard?.laborChargesOriginal ?? pricingPreview.laborChargesOriginal,
        loyaltyLaborDiscount:
          createdJobCard?.loyaltyLaborDiscount ?? pricingPreview.loyaltyLaborDiscount,
        laborChargesNet:
          createdJobCard?.laborChargesNet ?? pricingPreview.laborChargesNet,
        subtotalParts: createdJobCard?.subtotalParts ?? pricingPreview.subtotalParts,
        grandTotal: createdJobCard?.grandTotal ?? pricingPreview.grandTotal,
        notes: notes.trim(),
        workNotes: createdJobCard?.workNotes ?? notes.trim(),
        status: createdJobCard?.status || "OPEN",
        paymentStatus: createdJobCard?.paymentStatus || "UNPAID",
        createdAt: createdJobCard?.createdAt || createdAtIso,
      };
      const existing = getJobCards();
      saveJobCards([newJobCard, ...existing]);
      if (mongoId) {
        navigate(`/job-cards/${mongoId}/print?autoprint=1`);
      } else {
        navigate("/job-cards");
      }
    } catch (error) {
      handleAuthRedirect(error.response?.status);
      setSyncError(
        error.response?.data?.message ||
          "Unable to sync customer and vehicle data. Please try again."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const ownerResolved = changeOwner
    ? Boolean(ownerId || (newCustomerName.trim() && newCustomerPhone.trim()))
    : Boolean(currentOwnerId);
  const confirmReady = changeOwner ? confirmText === "CONFIRM" : true;
  const canSubmit =
    Boolean(
      vehicleId &&
        selectedServices.length > 0 &&
        ownerResolved &&
        confirmReady
    ) && !isSyncing;

  return (
    <div className="job-card-new">
      <div className="job-card-hero">
        <div>
          <PageHeader title="New Job Card" />
          <p className="job-card-subtitle">
            Capture vehicle, owner, and service details in one flow.
          </p>
        </div>
        <div className="job-card-hero__tag">Primary Workflow</div>
      </div>

      <form className="job-card-form" onSubmit={handleSubmit}>
        {syncError ? (
          <p
            className={
              syncError === "Vehicle saved locally. Assign an owner to sync."
                ? "job-card-success"
                : "job-card-error"
            }
          >
            {syncError}
          </p>
        ) : null}
        <div className="job-card-grid">
          <section className="job-card-card">
            <div className="job-card-card__head">
              <div>
                <h2>Vehicle</h2>
                <p>Start with the registration number to find a vehicle.</p>
              </div>
              <button
                type="button"
                className="job-card-button job-card-button--ghost"
                onClick={() => setShowVehicleForm((prev) => !prev)}
              >
                {showVehicleForm ? "Close" : "+ Add New Vehicle"}
              </button>
            </div>

            <div className="job-card-field">
              <label htmlFor="job-vehicle-search">Vehicle registration</label>
              <input
                id="job-vehicle-search"
                type="search"
                placeholder="Type registration number"
                value={vehicleSearch}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setVehicleSearch(nextValue);
                  setCurrentOwnerLocalId("");
                  const match = vehicles.find(
                    (vehicle) =>
                      vehicle.vehicleNumber?.toLowerCase() ===
                      nextValue.trim().toLowerCase()
                  );
                  setVehicleId(match ? match.id : "");
                }}
                list="vehicle-options"
              />
              <datalist id="vehicle-options">
                {filteredVehicles.map((vehicle) => (
                  <option
                    key={vehicle.id}
                    value={vehicle.vehicleNumber}
                  >{`${vehicle.vehicleNumber} - ${
                    vehicle.brandName || vehicle.brand || "-"
                  } ${vehicle.modelName || vehicle.model || "-"}`}</option>
                ))}
              </datalist>
            </div>
            {vehicleMatch ? (
              <p className="job-card-helper">
                Selected: {vehicleMatch.vehicleNumber} -{" "}
                {vehicleMatch.brandName || vehicleMatch.brand}{" "}
                {vehicleMatch.modelName || vehicleMatch.model}
              </p>
            ) : null}

            {selectedVehicle ? (
              <div className="job-card-summary">
                <div>
                  <span>Vehicle</span>
                  <strong>{selectedVehicle.vehicleNumber}</strong>
                </div>
                <div>
                  <span>Make</span>
                  <strong>
                    {selectedVehicle.brandName || selectedVehicle.brand}{" "}
                    {selectedVehicle.modelName || selectedVehicle.model}
                  </strong>
                </div>
                <div>
                  <span>Year</span>
                  <strong>{selectedVehicle.year || "-"}</strong>
                </div>
              </div>
            ) : null}

            {showVehicleForm ? (
              <div className="inline-panel">
                <div className="inline-panel__grid inline-panel__grid--four">
                  <div className="job-card-field">
                    <label htmlFor="new-vehicle-number">Vehicle Number</label>
                    <input
                      id="new-vehicle-number"
                      value={newVehicleNumber}
                      onChange={(event) => setNewVehicleNumber(event.target.value)}
                      required
                    />
                  </div>
                  <div className="job-card-field">
                    <label htmlFor="new-vehicle-brand">Brand</label>
                    <input
                      id="new-vehicle-brand"
                      value={newVehicleBrand}
                      onChange={(event) => setNewVehicleBrand(event.target.value)}
                      list="vehicle-brand-options"
                      placeholder="Select brand"
                      required
                    />
                    <datalist id="vehicle-brand-options">
                      {brandOptions.map((brand) => (
                        <option
                          key={brand._id || brand.id}
                          value={brand.name}
                        />
                      ))}
                    </datalist>
                  </div>
                  <div className="job-card-field">
                    <label htmlFor="new-vehicle-model">Model</label>
                    <input
                      id="new-vehicle-model"
                      value={newVehicleModel}
                      onChange={(event) => setNewVehicleModel(event.target.value)}
                      list="vehicle-model-options"
                      placeholder={
                        selectedBrandId ? "Select model" : "Select brand first"
                      }
                      disabled={!selectedBrandId}
                      required
                    />
                    <datalist id="vehicle-model-options">
                      {modelOptions.map((model) => (
                        <option
                          key={model._id || model.id}
                          value={model.name}
                        />
                      ))}
                    </datalist>
                  </div>
                  <div className="job-card-field">
                    <label htmlFor="new-vehicle-year">Year</label>
                    <select
                      id="new-vehicle-year"
                      value={newVehicleYear}
                      onChange={(event) => setNewVehicleYear(event.target.value)}
                      required
                    >
                      <option value="">Select year</option>
                      {yearOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="inline-panel__actions">
                  <button
                    type="button"
                    className="job-card-button job-card-button--primary"
                    onClick={handleVehicleSave}
                    disabled={
                      !newVehicleNumber.trim() ||
                      !newVehicleBrand.trim() ||
                      !newVehicleModel.trim() ||
                      !newVehicleYear.trim() ||
                      !selectedBrandId ||
                      !selectedModelId ||
                      isSyncing
                    }
                  >
                    Save Vehicle
                  </button>
                  <button
                    type="button"
                    className="job-card-button job-card-button--ghost"
                    onClick={() => setShowVehicleForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="job-card-card">
            <div className="job-card-card__head">
              <div>
                <h2>Owner Confirmation</h2>
                <p>Confirm or update the vehicle owner before creating the job.</p>
              </div>
            </div>
            <div className="job-card-owner-confirm">
              <div className="job-card-owner-fields">
                <div className="job-card-field">
                  <label htmlFor="owner-name">Owner Name</label>
                  <input
                    id="owner-name"
                    value={currentOwner?.name || ""}
                    readOnly
                    disabled={!currentOwner}
                  />
                </div>
                <div className="job-card-field">
                  <label htmlFor="owner-phone">Phone Number</label>
                  <input
                    id="owner-phone"
                    value={currentOwner?.phone || ""}
                    readOnly
                    disabled={!currentOwner}
                  />
                </div>
              </div>
              <label className="job-card-toggle">
                <input
                  type="checkbox"
                  checked={changeOwner}
                  onChange={(event) => {
                    const nextValue = event.target.checked;
                    setChangeOwner(nextValue);
                    if (!nextValue) {
                      setOwnerId("");
                      setOwnerSearch("");
                      setShowOwnerForm(false);
                      setNewCustomerName("");
                      setNewCustomerPhone("");
                      setNewCustomerEmail("");
                    }
                  }}
                />
                <span>Change Owner</span>
              </label>
              
            </div>
            {vehicleLookupError ? (
              <p className="job-card-error">{vehicleLookupError}</p>
            ) : null}
            {!currentOwner ? (
              <p className="job-card-muted">
                No owner on record. Enable change owner to assign one before
                creating the job card.
              </p>
            ) : null}

            {changeOwner ? (
              <div className="job-card-owner-change">
                <div className="job-card-warning">
                  Changing the owner updates the vehicle record for future job
                  cards only. Past job cards stay linked to the previous owner.
                </div>
                <div className="job-card-owner-grid">
                  <div className="job-card-owner-panel">
                    <h3>Current Owner</h3>
                    <p>
                      {currentOwner
                        ? `${currentOwner.name} (${currentOwner.phone})`
                        : "No owner on record"}
                    </p>
                  </div>
                  <div className="job-card-owner-panel">
                    <h3>Change Vehicle Owner</h3>
                    <div className="job-card-owner-search">
                      <div className="job-card-field">
                        <label htmlFor="job-owner-search">
                          Search existing customer
                        </label>
                        <input
                          id="job-owner-search"
                          type="search"
                          placeholder="Type name, phone, or email"
                          value={ownerSearch}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            const query = nextValue.trim().toLowerCase();
                            setOwnerSearch(nextValue);
                            const match = customers.find(
                              (customer) =>
                                customer.name?.toLowerCase() === query ||
                                customer.phone?.toLowerCase() === query ||
                                customer.email?.toLowerCase() === query
                            );
                            setOwnerId(match ? match.id : "");
                            setShowOwnerForm(Boolean(match));
                            if (match) {
                              setNewCustomerName(match.name || "");
                              setNewCustomerPhone(match.phone || "");
                              setNewCustomerEmail(match.email || "");
                            } else {
                              setNewCustomerName("");
                              setNewCustomerPhone("");
                              setNewCustomerEmail("");
                            }
                          }}
                          list="owner-options"
                        />
                        <datalist id="owner-options">
                          {filteredOwners.map((customer) => (
                            <option
                              key={`${customer.id}-name`}
                              value={`${customer.name}`}
                            >{`${customer.name} (${customer.phone})`}</option>
                          ))}
                          {filteredOwners.map((customer) =>
                            customer.phone ? (
                              <option
                                key={`${customer.id}-phone`}
                                value={`${customer.phone}`}
                              >{`${customer.name} (${customer.phone})`}</option>
                            ) : null
                          )}
                          {filteredOwners.map((customer) =>
                            customer.email ? (
                              <option
                                key={`${customer.id}-email`}
                                value={`${customer.email}`}
                              >{`${customer.name} (${customer.email})`}</option>
                            ) : null
                          )}
                        </datalist>
                      </div>
                      <button
                        type="button"
                        className="job-card-button job-card-button--ghost"
                        onClick={() => {
                          setShowOwnerForm(true);
                          setOwnerId("");
                          setNewCustomerName(ownerSearch.trim());
                          setNewCustomerPhone("");
                          setNewCustomerEmail("");
                        }}
                      >
                        + Add New Customer
                      </button>
                    </div>
                    {ownerMatch ? (
                      <p className="job-card-helper">
                        Selected: {ownerMatch.name} ({ownerMatch.phone})
                      </p>
                    ) : null}

                    {showOwnerForm ? (
                      <div className="inline-panel">
                        <div className="inline-panel__grid">
                          <div className="job-card-field">
                            <label htmlFor="new-customer-name">Name</label>
                            <input
                              id="new-customer-name"
                              value={newCustomerName}
                              onChange={(event) =>
                                setNewCustomerName(event.target.value)
                              }
                              readOnly={Boolean(ownerId)}
                              required={!ownerId}
                            />
                          </div>
                          <div className="job-card-field">
                            <label htmlFor="new-customer-phone">Phone</label>
                            <input
                              id="new-customer-phone"
                              value={newCustomerPhone}
                              onChange={(event) =>
                                setNewCustomerPhone(event.target.value)
                              }
                              readOnly={Boolean(ownerId)}
                              required={!ownerId}
                            />
                          </div>
                          <div className="job-card-field">
                            <label htmlFor="new-customer-email">
                              Email (optional)
                            </label>
                            <input
                              id="new-customer-email"
                              type="email"
                              value={newCustomerEmail}
                              onChange={(event) =>
                                setNewCustomerEmail(event.target.value)
                              }
                              readOnly={Boolean(ownerId)}
                            />
                          </div>
                        </div>
                        <p className="job-card-muted">
                          Save the owner update before creating the job card.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="job-card-confirm">
                  <div className="job-card-field">
                    <label htmlFor="job-confirm">Type CONFIRM to proceed</label>
                    <input
                      id="job-confirm"
                      value={confirmText}
                      onChange={(event) => setConfirmText(event.target.value)}
                      placeholder="CONFIRM"
                    />
                    <p className="job-card-helper">
                      Case-sensitive: enter exactly <strong>CONFIRM</strong>.
                    </p>
                  </div>
                  <div className="job-card-owner-actions">
                    <button
                      type="button"
                      className="job-card-button job-card-button--primary"
                      onClick={handleOwnerSave}
                      disabled={confirmText.trim() !== "CONFIRM"}
                    >
                      OK - Save Owner
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <section className="job-card-card">
          <div className="job-card-card__head">
            <div>
              <h2>Service Details</h2>
              <p>Select services to include in this job card.</p>
            </div>
          </div>

          <div className="job-card-service-grid">
            <div className="job-card-service-grid__services">
              <div className="job-card-service-select">
                <div className="job-card-field">
                  <label htmlFor="job-service">Service Type</label>
                  {servicesError ? (
                    <p className="job-card-muted">{servicesError}</p>
                  ) : (
                    <select
                      id="job-service"
                      value={serviceId}
                      onChange={(event) => {
                        setServiceId(event.target.value);
                        setServiceAddError("");
                      }}
                    >
                      <option value="">Select service type</option>
                      {activeServices.length === 0 ? (
                        <option value="" disabled>
                          No active services available
                        </option>
                      ) : (
                        activeServices.map((service) => (
                          <option
                            key={service._id || service.id}
                            value={service._id || service.id}
                          >
                            {service.name}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>
                <button
                  type="button"
                  className="job-card-button job-card-button--ghost"
                  onClick={handleAddService}
                  disabled={!selectedService || isServiceAlreadyAdded}
                >
                  + Add Service
                </button>
              </div>
              {serviceAddError ? (
                <p className="job-card-error">{serviceAddError}</p>
              ) : null}
              {selectedServices.length === 0 ? (
                <p className="job-card-muted">
                  No services added yet. Select a service and click add.
                </p>
              ) : (
                <div className="job-card-service-list">
                  {selectedServices.map((service) => (
                    <div
                      key={service.serviceType}
                      className="job-card-service-section"
                    >
                      <div className="job-card-service-section__head">
                        <div>
                          <h3>
                            {selectedServiceNames.get(
                              String(service.serviceType)
                            ) || "Service"}
                          </h3>
                          <p>
                            {service.tasks?.length
                              ? `${service.tasks.length} tasks`
                              : "No tasks defined"}
                          </p>
                        </div>
                        <div className="job-card-service-actions">
                          {service.tasks?.length ? (
                            <button
                              type="button"
                              className="job-card-button job-card-button--ghost"
                              onClick={() =>
                                toggleSelectAllTasks(service.serviceType)
                              }
                            >
                              {service.tasks.every((task) => task.completed)
                                ? "Clear all"
                                : "Select all"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="job-card-button job-card-button--ghost"
                            onClick={() =>
                              handleRemoveService(service.serviceType)
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      {service.tasks?.length ? (
                        <div className="job-card-task-table job-card-task-table--new">
                          <div className="job-card-task-table__head">
                            <span>Task</span>
                            <span>Labor Hours</span>
                            <span>Labor Charge (LKR)</span>
                            <span>Assigned Staff</span>
                            <span>Billable</span>
                          </div>
                          {service.tasks.map((task, index) => {
                            const rowKey = getTaskRowKey(service.serviceType, task, index);
                            const datalistId = `job-task-staff-${rowKey}`;
                            const options = taskStaffSearchResults[rowKey] || [];
                            const staffValue =
                              taskStaffSearchTerms[rowKey] ?? getTaskAssignedLabel(task);
                            return (
                              <div key={rowKey} className="job-card-task-table__row">
                                <label className="job-card-task-table__task">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(task.completed)}
                                    onChange={() =>
                                      toggleSelectedTask(service.serviceType, index)
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
                                  onChange={(event) =>
                                    updateSelectedTaskLabor(
                                      service.serviceType,
                                      index,
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
                                  onChange={(event) =>
                                    updateSelectedTaskLabor(
                                      service.serviceType,
                                      index,
                                      "laborCharge",
                                      event.target.value
                                    )
                                  }
                                />
                                <input
                                  type="search"
                                  list={datalistId}
                                  value={staffValue}
                                  placeholder="8071302 - Staff Name"
                                  onChange={(event) =>
                                    queueTaskStaffSearch(
                                      service.serviceType,
                                      index,
                                      rowKey,
                                      event.target.value
                                    )
                                  }
                                />
                                <datalist id={datalistId}>
                                  {options.map((staff) => (
                                    <option
                                      key={staff._id}
                                      value={formatStaffOptionLabel(staff)}
                                    />
                                  ))}
                                </datalist>
                                <label className="job-card-task-table__billable">
                                  <input
                                    type="checkbox"
                                    checked={task.isBillable !== false}
                                    onChange={(event) =>
                                      updateSelectedTaskLabor(
                                        service.serviceType,
                                        index,
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
                        <p className="job-card-muted">
                          No tasks listed for this service.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {selectedServices.length > 0 ? (
                <div className="job-card-labor-summary">
                  <span>Labor Charges (Original)</span>
                  <strong>{formatMoney(laborChargesOriginal)}</strong>
                </div>
              ) : null}
            </div>

            <div className="job-card-field job-card-service-grid__notes">
              <label htmlFor="job-notes">Complaints / Notes</label>
              <textarea
                id="job-notes"
                rows="4"
                placeholder="Capture customer complaints, special requests, or technician notes."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

          </div>

          <div className="job-card-loyalty">
            <div className="job-card-card__head">
              <div>
                <h2>Loyalty Rewards</h2>
                <p>Milestone rewards eligible for this draft visit.</p>
              </div>
            </div>

            {loyaltyPreviewLoading ? (
              <p className="job-card-muted">Checking loyalty milestones...</p>
            ) : null}
            {!previewCustomerMongoId ? (
              <p className="job-card-muted">
                Select a synced customer to check loyalty rewards.
              </p>
            ) : null}
            {appliedRewards.length === 0 ? (
              <p className="job-card-muted">No loyalty rewards selected yet.</p>
            ) : (
              <div className="job-card-loyalty__list">
                {appliedRewards.map((reward) => {
                  const rewardKey = buildRewardKey(reward);
                  return (
                    <div key={rewardKey} className="job-card-loyalty__item">
                      <div>
                        <strong>{reward.ruleName || "Loyalty Reward"}</strong>
                        <p>
                          {formatRewardSummary(reward)}{" "}
                          {reward.milestoneNumber
                            ? `(Milestone ${reward.milestoneNumber})`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="job-card-button job-card-button--ghost"
                        onClick={() => removeAppliedReward(rewardKey)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </section>

        <div className="job-card-actions">
          <button
            type="button"
            className="job-card-button job-card-button--ghost"
            onClick={() => navigate("/job-cards")}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="job-card-button job-card-button--primary"
            disabled={!canSubmit}
          >
            Create Job Card
          </button>
        </div>

        {loyaltyPopupOpen ? (
          <div className="loyalty-popup">
            <div className="loyalty-popup__backdrop" />
            <div className="loyalty-popup__panel" role="dialog" aria-modal="true">
              <div className="loyalty-popup__head">
                <h3>Loyalty Reward Available</h3>
                <p>
                  This visit hits a loyalty milestone. Select one reward to apply to
                  this job card.
                </p>
              </div>
              <div className="loyalty-popup__list">
                {loyaltyPopupRewards.map((reward) => {
                  const isSelected = selectedPopupRewardKey === reward.suppressionKey;
                  return (
                    <label
                      key={reward.suppressionKey}
                      className={`loyalty-popup__item ${
                        isSelected ? "is-selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="new-jobcard-loyalty-reward"
                        checked={isSelected}
                        onChange={() =>
                          setSelectedPopupRewardKey(reward.suppressionKey)
                        }
                      />
                      <div>
                        <strong>{reward.ruleName}</strong>
                        <p>
                          {formatRewardSummary(reward)}{" "}
                          {reward.milestoneNumber
                            ? `(Milestone ${reward.milestoneNumber})`
                            : ""}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="loyalty-popup__actions">
                <button
                  type="button"
                  className="job-card-button job-card-button--ghost"
                  onClick={handleSkipLoyaltyPopup}
                >
                  Skip for Now
                </button>
                <button
                  type="button"
                  className="job-card-button job-card-button--primary"
                  onClick={handleApplyLoyaltyRewards}
                  disabled={!selectedPopupRewardKey}
                >
                  Apply Reward
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}

export default JobCardNew;
