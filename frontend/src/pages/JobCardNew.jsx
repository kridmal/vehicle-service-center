import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { useLocalStorageState } from "../hooks/useLocalStorageState.js";
import { createId } from "../utils/id.js";
import api from "../services/api.js";
import { getJobCards, saveJobCards } from "../utils/storage.js";
import "./JobCardNew.css";

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
  const navigate = useNavigate();

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

  useEffect(() => {
    if (!selectedVehicle) {
      setChangeOwner(false);
      setOwnerId("");
      setOwnerSearch("");
      setShowOwnerForm(false);
      setCurrentOwnerLocalId("");
      return;
    }
    setChangeOwner(!currentOwnerId);
    setOwnerId("");
    setOwnerSearch("");
    setShowOwnerForm(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerEmail("");
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
    const tasks = Array.isArray(selectedService.tasks)
      ? selectedService.tasks
          .map((task) => ({
            title: task.title,
            isRequired: Boolean(task.isRequired),
            completed: false,
          }))
          .filter((task) => task.title)
      : [];
    setServiceTasksDraft(tasks);
  }, [selectedService]);

  const toggleDraftTask = (taskIndex) => {
    setServiceTasksDraft((prev) =>
      prev.map((task, index) =>
        index === taskIndex ? { ...task, completed: !task.completed } : task
      )
    );
  };

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
      .map((task) => ({
        title: task.title,
        isRequired: Boolean(task.isRequired),
        completed: Boolean(task.completed),
      }))
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
          index === taskIndex ? { ...task, completed: !task.completed } : task
        );
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
          })),
        };
      })
    );
  };

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
      await ensureVehicleSynced(selectedVehicle, ownerMongoId);
      if (changeOwner && resolvedOwnerId !== vehicleOwnerId) {
        await assignOwnerToVehicle(resolvedOwnerId, ownerMongoId);
      }
      const newJobCard = {
        id: `jc_${Date.now()}`,
        ownerId: resolvedOwnerId,
        customerId: resolvedOwnerId,
        vehicleId,
        services: selectedServices,
        notes: notes.trim(),
        status: "OPEN",
        createdAt: new Date().toISOString(),
      };
      const existing = getJobCards();
      saveJobCards([newJobCard, ...existing]);
      navigate("/job-cards");
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
            <div>
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
                        <div className="job-card-checklist job-card-checklist--tasks">
                          {service.tasks.map((task, index) => (
                            <label
                              key={`${service.serviceType}-${task.title}-${index}`}
                              className="job-card-checklist__item"
                            >
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
                          ))}
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
            </div>

            <div className="job-card-field">
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
      </form>
    </div>
  );
}

export default JobCardNew;
