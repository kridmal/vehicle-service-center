import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import api from "../../services/api.js";
import "./VehicleMaster.css";

function VehicleModels() {
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [brandId, setBrandId] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  const loadBrands = async () => {
    try {
      const { data } = await api.get("/vehicle-master/brands");
      setBrands(Array.isArray(data) ? data : []);
    } catch (error) {
      setBrands([]);
    }
  };

  const loadModels = async () => {
    setError("");
    try {
      const { data } = await api.get("/vehicle-master/models");
      setModels(Array.isArray(data) ? data : []);
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
          "Unable to load models right now."
      );
    }
  };

  useEffect(() => {
    loadBrands();
    loadModels();
  }, []);

  const isFormValid = useMemo(
    () => brandId && name.trim().length > 0,
    [brandId, name]
  );

  const resetForm = () => {
    setBrandId("");
    setName("");
    setActive(true);
    setEditingId("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isFormValid) return;
    setIsSaving(true);
    setError("");
    const payload = {
      brandId,
      name: name.trim(),
      active,
    };
    try {
      if (editingId) {
        await api.patch(`/vehicle-master/models/${editingId}`, payload);
      } else {
        await api.post("/vehicle-master/models", payload);
      }
      await loadModels();
      resetForm();
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Unable to save model details."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (model) => {
    setEditingId(model._id || model.id);
    setBrandId(model.brandId || "");
    setName(model.name || "");
    setActive(model.active !== undefined ? Boolean(model.active) : true);
  };

  const handleDelete = async (modelId) => {
    if (!window.confirm("Delete this model?")) return;
    setIsSaving(true);
    setError("");
    try {
      await api.delete(`/vehicle-master/models/${modelId}`);
      await loadModels();
      if (editingId === modelId) resetForm();
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Unable to delete model."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const brandMap = useMemo(
    () => new Map(brands.map((brand) => [brand._id, brand])),
    [brands]
  );

  return (
    <div className="vehicle-master-page">
      <PageHeader title="Vehicle Models" />
      {error ? <p className="vehicle-master-error">{error}</p> : null}

      <section className="vehicle-master-card">
        <div className="vehicle-master-card__head">
          <h2>{editingId ? "Edit Model" : "Add Model"}</h2>
          <p>Attach models under an existing brand.</p>
        </div>
        <form className="vehicle-master-form" onSubmit={handleSubmit}>
          <div className="vehicle-master-grid">
            <div className="vehicle-master-field">
              <label htmlFor="model-brand">Brand</label>
              <select
                id="model-brand"
                value={brandId}
                onChange={(event) => setBrandId(event.target.value)}
                required
              >
                <option value="">Select brand</option>
                {brands.map((brand) => (
                  <option key={brand._id || brand.id} value={brand._id || brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="vehicle-master-field">
              <label htmlFor="model-name">Model Name</label>
              <input
                id="model-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <label className="vehicle-master-toggle">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              Active
            </label>
          </div>
          <div className="vehicle-master-actions">
            {editingId ? (
              <button type="button" onClick={resetForm}>
                Cancel
              </button>
            ) : null}
            <button type="submit" disabled={!isFormValid || isSaving}>
              {editingId ? "Save Changes" : "Create Model"}
            </button>
          </div>
        </form>
      </section>

      <section className="vehicle-master-card">
        <div className="vehicle-master-card__head">
          <h2>Model Directory</h2>
          <p>Disable models to hide them from vehicle forms.</p>
        </div>
        {models.length === 0 ? (
          <p className="vehicle-master-empty">No models added yet.</p>
        ) : (
          <div className="vehicle-master-table">
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
                {models.map((model) => (
                  <tr key={model._id || model.id}>
                    <td>{model.name}</td>
                    <td>{brandMap.get(model.brandId)?.name || "-"}</td>
                    <td>
                      <span
                        className={`vehicle-master-status ${
                          model.active ? "" : "vehicle-master-status--inactive"
                        }`}
                      >
                        {model.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="vehicle-master-actions-cell">
                      <button type="button" onClick={() => handleEdit(model)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="vehicle-master-danger"
                        onClick={() => handleDelete(model._id || model.id)}
                      >
                        Delete
                      </button>
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

export default VehicleModels;
