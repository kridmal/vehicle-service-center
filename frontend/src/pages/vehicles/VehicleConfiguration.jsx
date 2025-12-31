import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import api from "../../services/api.js";
import "./VehicleConfiguration.css";

const TABS = [
  { id: "brands", label: "Brands" },
  { id: "models", label: "Models" },
];

function VehicleConfiguration() {
  const [activeTab, setActiveTab] = useState("brands");
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [brandName, setBrandName] = useState("");
  const [brandActive, setBrandActive] = useState(true);
  const [editingBrandId, setEditingBrandId] = useState("");
  const [modelName, setModelName] = useState("");
  const [modelActive, setModelActive] = useState(true);
  const [editingModelId, setEditingModelId] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  const loadBrands = async () => {
    try {
      const { data } = await api.get("/vehicle-master/brands");
      setBrands(Array.isArray(data) ? data : []);
    } catch (error) {
      if (error.response?.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      if (error.response?.status === 403) {
        navigate("/unauthorized", { replace: true });
        return;
      }
      setError(
        error.response?.data?.message ||
          "Unable to load brands right now."
      );
    }
  };

  const loadModels = async (brandId) => {
    try {
      const { data } = await api.get("/vehicle-master/models", {
        params: brandId ? { brandId } : undefined,
      });
      setModels(Array.isArray(data) ? data : []);
    } catch (error) {
      setModels([]);
    }
  };

  useEffect(() => {
    setError("");
    loadBrands();
  }, []);

  useEffect(() => {
    if (!selectedBrandId) {
      setModels([]);
      return;
    }
    loadModels(selectedBrandId);
  }, [selectedBrandId]);

  const brandMap = useMemo(
    () => new Map(brands.map((brand) => [brand._id, brand])),
    [brands]
  );

  const brandFormValid = useMemo(
    () => brandName.trim().length > 0,
    [brandName]
  );
  const modelFormValid = useMemo(
    () => selectedBrandId && modelName.trim().length > 0,
    [selectedBrandId, modelName]
  );

  const resetBrandForm = () => {
    setBrandName("");
    setBrandActive(true);
    setEditingBrandId("");
  };

  const resetModelForm = () => {
    setModelName("");
    setModelActive(true);
    setEditingModelId("");
  };

  const handleBrandSubmit = async (event) => {
    event.preventDefault();
    if (!brandFormValid) return;
    setIsSaving(true);
    setError("");
    const payload = { name: brandName.trim(), active: brandActive };
    try {
      if (editingBrandId) {
        await api.patch(`/vehicle-master/brands/${editingBrandId}`, payload);
      } else {
        await api.post("/vehicle-master/brands", payload);
      }
      await loadBrands();
      resetBrandForm();
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Unable to save brand details."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleModelSubmit = async (event) => {
    event.preventDefault();
    if (!modelFormValid) return;
    setIsSaving(true);
    setError("");
    const payload = {
      name: modelName.trim(),
      brandId: selectedBrandId,
      active: modelActive,
    };
    try {
      if (editingModelId) {
        await api.patch(`/vehicle-master/models/${editingModelId}`, payload);
      } else {
        await api.post("/vehicle-master/models", payload);
      }
      await loadModels(selectedBrandId);
      resetModelForm();
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Unable to save model details."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditBrand = (brand) => {
    setEditingBrandId(brand._id || brand.id);
    setBrandName(brand.name || "");
    setBrandActive(brand.active !== undefined ? Boolean(brand.active) : true);
  };

  const handleEditModel = (model) => {
    setEditingModelId(model._id || model.id);
    setModelName(model.name || "");
    setModelActive(model.active !== undefined ? Boolean(model.active) : true);
    setSelectedBrandId(model.brandId || "");
  };

  const handleDeleteBrand = async (brandId) => {
    if (!window.confirm("Delete this brand?")) return;
    setIsSaving(true);
    setError("");
    try {
      await api.delete(`/vehicle-master/brands/${brandId}`);
      await loadBrands();
      if (editingBrandId === brandId) resetBrandForm();
      if (selectedBrandId === brandId) setSelectedBrandId("");
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Unable to delete brand."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteModel = async (modelId) => {
    if (!window.confirm("Delete this model?")) return;
    setIsSaving(true);
    setError("");
    try {
      await api.delete(`/vehicle-master/models/${modelId}`);
      await loadModels(selectedBrandId);
      if (editingModelId === modelId) resetModelForm();
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Unable to delete model."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="vehicle-config-page">
      <div className="vehicle-config-header">
        <PageHeader title="Vehicle Configuration" />
        <p className="vehicle-config-subtitle">
          Manage vehicle brands and models for standardized data entry.
        </p>
      </div>

      <div className="vehicle-config-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`vehicle-config-tab ${
              activeTab === tab.id ? "active" : ""
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <p className="vehicle-config-error">{error}</p> : null}

      {activeTab === "brands" ? (
        <section className="vehicle-config-card">
          <div className="vehicle-config-card__head">
            <h2>Brands</h2>
            <p>Create, rename, and toggle vehicle brands.</p>
          </div>
          <form className="vehicle-config-form" onSubmit={handleBrandSubmit}>
            <div className="vehicle-config-grid">
              <div className="vehicle-config-field">
                <label htmlFor="brand-name">Brand Name</label>
                <input
                  id="brand-name"
                  value={brandName}
                  onChange={(event) => setBrandName(event.target.value)}
                  required
                />
              </div>
              <label className="vehicle-config-toggle">
                <input
                  type="checkbox"
                  checked={brandActive}
                  onChange={(event) => setBrandActive(event.target.checked)}
                />
                Active
              </label>
            </div>
            <div className="vehicle-config-actions">
              {editingBrandId ? (
                <button type="button" onClick={resetBrandForm}>
                  Cancel
                </button>
              ) : null}
              <button type="submit" disabled={!brandFormValid || isSaving}>
                {editingBrandId ? "Save Changes" : "Create Brand"}
              </button>
            </div>
          </form>

          <div className="vehicle-config-table">
            <table>
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {brands.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="vehicle-config-empty">
                      No brands added yet.
                    </td>
                  </tr>
                ) : (
                  brands.map((brand) => (
                    <tr key={brand._id || brand.id}>
                      <td>{brand.name}</td>
                      <td>
                        <span
                          className={`vehicle-config-status ${
                            brand.active ? "" : "vehicle-config-status--inactive"
                          }`}
                        >
                          {brand.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="vehicle-config-actions-cell">
                        <button type="button" onClick={() => handleEditBrand(brand)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="vehicle-config-danger"
                          onClick={() => handleDeleteBrand(brand._id || brand.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="vehicle-config-card">
          <div className="vehicle-config-card__head">
            <h2>Models</h2>
            <p>Manage models under a selected brand.</p>
          </div>
          <div className="vehicle-config-toolbar">
            <div className="vehicle-config-field">
              <label htmlFor="model-brand-select">Brand</label>
              <select
                id="model-brand-select"
                value={selectedBrandId}
                onChange={(event) => setSelectedBrandId(event.target.value)}
              >
                <option value="">Select brand</option>
                {brands.map((brand) => (
                  <option key={brand._id || brand.id} value={brand._id || brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <form className="vehicle-config-form" onSubmit={handleModelSubmit}>
            <div className="vehicle-config-grid">
              <div className="vehicle-config-field">
                <label htmlFor="model-name">Model Name</label>
                <input
                  id="model-name"
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                  disabled={!selectedBrandId}
                  required
                />
              </div>
              <label className="vehicle-config-toggle">
                <input
                  type="checkbox"
                  checked={modelActive}
                  onChange={(event) => setModelActive(event.target.checked)}
                />
                Active
              </label>
            </div>
            <div className="vehicle-config-actions">
              {editingModelId ? (
                <button type="button" onClick={resetModelForm}>
                  Cancel
                </button>
              ) : null}
              <button type="submit" disabled={!modelFormValid || isSaving}>
                {editingModelId ? "Save Changes" : "Create Model"}
              </button>
            </div>
          </form>

          <div className="vehicle-config-table">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Brand</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {models.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="vehicle-config-empty">
                      Select a brand to view models.
                    </td>
                  </tr>
                ) : (
                  models.map((model) => (
                    <tr key={model._id || model.id}>
                      <td>{model.name}</td>
                      <td>{brandMap.get(model.brandId)?.name || "-"}</td>
                      <td>
                        <span
                          className={`vehicle-config-status ${
                            model.active ? "" : "vehicle-config-status--inactive"
                          }`}
                        >
                          {model.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="vehicle-config-actions-cell">
                        <button type="button" onClick={() => handleEditModel(model)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="vehicle-config-danger"
                          onClick={() => handleDeleteModel(model._id || model.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default VehicleConfiguration;
