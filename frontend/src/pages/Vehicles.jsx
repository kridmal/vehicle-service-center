import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { useLocalStorageState } from "../hooks/useLocalStorageState.js";
import { createId } from "../utils/id.js";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import "./Vehicles.css";

function Vehicles() {
  const [customers] = useLocalStorageState("ksc_customers", []);
  const [vehicles, setVehicles] = useLocalStorageState("ksc_vehicles", []);
  const [customerId, setCustomerId] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [brandSearch, setBrandSearch] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";

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
      setError("");
      try {
        const { data } = await api.get("/vehicle-master/brands", {
          params: { active: true },
        });
        setBrands(Array.isArray(data) ? data : []);
      } catch (error) {
        if (error.response?.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        setError(
          error.response?.data?.message ||
            "Unable to load vehicle brands."
        );
      }
    };
    loadBrands();
  }, [navigate]);

  useEffect(() => {
    const loadModels = async () => {
      if (!selectedBrandId) {
        setModels([]);
        return;
      }
      setError("");
      try {
        const { data } = await api.get("/vehicle-master/models", {
          params: { active: true, brandId: selectedBrandId },
        });
        setModels(Array.isArray(data) ? data : []);
      } catch (error) {
        setError(
          error.response?.data?.message ||
            "Unable to load vehicle models."
        );
      }
    };
    loadModels();
  }, [selectedBrandId]);

  const matchedBrand = useMemo(
    () =>
      brands.find(
        (brand) =>
          brand.name?.toLowerCase() === brandSearch.trim().toLowerCase()
      ) || null,
    [brands, brandSearch]
  );

  const matchedModel = useMemo(
    () =>
      models.find(
        (model) =>
          model.name?.toLowerCase() === modelSearch.trim().toLowerCase()
      ) || null,
    [models, modelSearch]
  );

  useEffect(() => {
    if (matchedBrand) {
      setSelectedBrandId(matchedBrand._id || matchedBrand.id);
    } else {
      setSelectedBrandId("");
      setModels([]);
      setSelectedModelId("");
      setModelSearch("");
    }
  }, [matchedBrand]);

  useEffect(() => {
    if (matchedModel) {
      setSelectedModelId(matchedModel._id || matchedModel.id);
    } else {
      setSelectedModelId("");
    }
  }, [matchedModel]);

  const filteredVehicles = useMemo(() => {
    const query = vehicleSearch.trim().toLowerCase();
    return vehicles.filter((vehicle) => {
      if (!query) return true;
      return vehicle.vehicleNumber?.toLowerCase().includes(query);
    });
  }, [vehicleSearch, vehicles]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!selectedBrandId || !selectedModelId) {
      setError("Select a valid brand and model.");
      return;
    }
    const brand = matchedBrand;
    const model = matchedModel;
    if (!brand || !model) {
      setError("Select a valid brand and model.");
      return;
    }
    const payload = {
      customerId,
      vehicleNumber: vehicleNumber.trim(),
      brandId: brand._id || brand.id,
      brandName: brand.name,
      modelId: model._id || model.id,
      modelName: model.name,
      year: year.trim(),
    };
    setIsSaving(true);
    setError("");
    if (editingId) {
      const existing = vehicles.find((entry) => entry.id === editingId);
      if (existing?.mongoId) {
        api
          .patch(`/vehicles/${existing.mongoId}`, {
            customerId: payload.customerId,
            vehicleNumber: payload.vehicleNumber,
            brandId: payload.brandId,
            modelId: payload.modelId,
          })
          .catch(() => {
            setError("Unable to sync vehicle changes right now.");
          });
      }
      setVehicles((prev) =>
        prev.map((entry) =>
          entry.id === editingId ? { ...entry, ...payload } : entry
        )
      );
    } else {
      const newVehicle = {
        id: createId("veh"),
        ...payload,
      };
      setVehicles((prev) => [newVehicle, ...prev]);
    }
    setVehicleNumber("");
    setBrandSearch("");
    setModelSearch("");
    setSelectedBrandId("");
    setSelectedModelId("");
    setYear("");
    setCustomerId("");
    setEditingId("");
    setIsSaving(false);
  };

  const handleEdit = (vehicle) => {
    setEditingId(vehicle.id);
    setCustomerId(vehicle.customerId || "");
    setVehicleNumber(vehicle.vehicleNumber || "");
    setBrandSearch(vehicle.brandName || vehicle.brand || "");
    setModelSearch(vehicle.modelName || vehicle.model || "");
    setYear(vehicle.year || "");
  };

  const handleCancelEdit = () => {
    setEditingId("");
    setCustomerId("");
    setVehicleNumber("");
    setBrandSearch("");
    setModelSearch("");
    setSelectedBrandId("");
    setSelectedModelId("");
    setYear("");
  };

  const handleDelete = async (vehicle) => {
    if (!window.confirm("Delete this vehicle?")) return;
    setIsSaving(true);
    setError("");
    try {
      if (vehicle.mongoId) {
        await api.delete(`/vehicles/${vehicle.mongoId}`);
      }
      setVehicles((prev) => prev.filter((entry) => entry.id !== vehicle.id));
      if (editingId === vehicle.id) {
        handleCancelEdit();
      }
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Unable to delete vehicle right now."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const canSubmit =
    customerId &&
    vehicleNumber.trim() &&
    selectedBrandId &&
    selectedModelId &&
    year.trim();

  return (
    <div className="vehicles-page">
      <div className="vehicles-header">
        <PageHeader title="Vehicles" />
        {isOwner ? (
          <Link className="vehicle-config-link" to="/vehicles/configuration">
            ⚙ Vehicle Configuration
          </Link>
        ) : null}
      </div>
      {error ? <p className="vehicle-master-error">{error}</p> : null}

      <section className="vehicles-card">
        <div className="card-head">
          <h2>{editingId ? "Edit Vehicle" : "Add Vehicle"}</h2>
          <p>Attach a vehicle to an existing customer profile.</p>
        </div>
        <form className="vehicle-form" onSubmit={handleSubmit}>
          <div className="form-grid form-grid--two">
            <div className="field">
              <label htmlFor="vehicle-customer">Customer</label>
              <select
                id="vehicle-customer"
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                required
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="vehicle-number">Vehicle Number</label>
              <input
                id="vehicle-number"
                value={vehicleNumber}
                onChange={(event) => setVehicleNumber(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-grid form-grid--three">
            <div className="field">
              <label htmlFor="vehicle-brand">Brand</label>
              <input
                id="vehicle-brand"
                value={brandSearch}
                onChange={(event) => setBrandSearch(event.target.value)}
                placeholder="Select brand"
                list="vehicle-brand-options"
                required
              />
              <datalist id="vehicle-brand-options">
                {brands.map((brand) => (
                  <option key={brand._id || brand.id} value={brand.name} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="vehicle-model">Model</label>
              <input
                id="vehicle-model"
                value={modelSearch}
                onChange={(event) => setModelSearch(event.target.value)}
                placeholder={selectedBrandId ? "Select model" : "Select brand first"}
                list="vehicle-model-options"
                disabled={!selectedBrandId}
                required
              />
              <datalist id="vehicle-model-options">
                {models.map((model) => (
                  <option key={model._id || model.id} value={model.name} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="vehicle-year">Year</label>
              <select
                id="vehicle-year"
                value={year}
                onChange={(event) => setYear(event.target.value)}
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

          <div className="form-actions">
            {editingId ? (
              <button type="button" onClick={handleCancelEdit}>
                Cancel
              </button>
            ) : null}
            <button
              className="primary-button"
              type="submit"
              disabled={!canSubmit || isSaving}
            >
              {editingId ? "Save Changes" : "Save Vehicle"}
            </button>
          </div>
        </form>
      </section>

      <section className="vehicles-card">
        <div className="card-head">
          <h2>Vehicles</h2>
        </div>
        <div className="vehicle-search">
          <label htmlFor="vehicle-search">Search by registration number</label>
          <input
            id="vehicle-search"
            type="search"
            value={vehicleSearch}
            onChange={(event) => setVehicleSearch(event.target.value)}
            placeholder="Type registration number"
          />
        </div>
        {filteredVehicles.length === 0 ? (
          <p className="empty-state">No vehicles found.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Vehicle No</th>
                  <th>Brand</th>
                  <th>Model</th>
                  <th>Year</th>
                  <th>Profile</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td>{vehicle.vehicleNumber}</td>
                    <td>{vehicle.brandName || vehicle.brand || "-"}</td>
                    <td>{vehicle.modelName || vehicle.model || "-"}</td>
                    <td>{vehicle.year || "-"}</td>
                    <td>
                      <Link
                        className="vehicles-link"
                        to={`/vehicles/${vehicle.id}`}
                      >
                        View Profile
                      </Link>
                    </td>
                    <td>
                      <div className="vehicle-actions">
                        <button
                          type="button"
                          onClick={() => handleEdit(vehicle)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="vehicle-action-danger"
                          onClick={() => handleDelete(vehicle)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default Vehicles;
