import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import api from "../../services/api.js";
import "./VehicleMaster.css";

function VehicleBrands() {
  const [brands, setBrands] = useState([]);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  const loadBrands = async () => {
    setError("");
    try {
      const { data } = await api.get("/vehicle-master/brands");
      setBrands(Array.isArray(data) ? data : []);
    } catch (error) {
      if (error.response?.status === 401) {
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

  useEffect(() => {
    loadBrands();
  }, []);

  const isFormValid = useMemo(() => name.trim().length > 0, [name]);

  const resetForm = () => {
    setName("");
    setActive(true);
    setEditingId("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isFormValid) return;
    setIsSaving(true);
    setError("");
    const payload = { name: name.trim(), active };
    try {
      if (editingId) {
        await api.patch(`/vehicle-master/brands/${editingId}`, payload);
      } else {
        await api.post("/vehicle-master/brands", payload);
      }
      await loadBrands();
      resetForm();
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Unable to save brand details."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (brand) => {
    setEditingId(brand._id || brand.id);
    setName(brand.name || "");
    setActive(brand.active !== undefined ? Boolean(brand.active) : true);
  };

  const handleDelete = async (brandId) => {
    if (!window.confirm("Delete this brand?")) return;
    setIsSaving(true);
    setError("");
    try {
      await api.delete(`/vehicle-master/brands/${brandId}`);
      await loadBrands();
      if (editingId === brandId) resetForm();
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Unable to delete brand."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="vehicle-master-page">
      <PageHeader title="Vehicle Brands" />
      {error ? <p className="vehicle-master-error">{error}</p> : null}

      <section className="vehicle-master-card">
        <div className="vehicle-master-card__head">
          <h2>{editingId ? "Edit Brand" : "Add Brand"}</h2>
          <p>Create and manage brand names for vehicles.</p>
        </div>
        <form className="vehicle-master-form" onSubmit={handleSubmit}>
          <div className="vehicle-master-grid">
            <div className="vehicle-master-field">
              <label htmlFor="brand-name">Brand Name</label>
              <input
                id="brand-name"
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
              {editingId ? "Save Changes" : "Create Brand"}
            </button>
          </div>
        </form>
      </section>

      <section className="vehicle-master-card">
        <div className="vehicle-master-card__head">
          <h2>Brand Directory</h2>
          <p>Disable brands to hide them from vehicle forms.</p>
        </div>
        {brands.length === 0 ? (
          <p className="vehicle-master-empty">No brands added yet.</p>
        ) : (
          <div className="vehicle-master-table">
            <table>
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {brands.map((brand) => (
                  <tr key={brand._id || brand.id}>
                    <td>{brand.name}</td>
                    <td>
                      <span
                        className={`vehicle-master-status ${
                          brand.active ? "" : "vehicle-master-status--inactive"
                        }`}
                      >
                        {brand.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="vehicle-master-actions-cell">
                      <button type="button" onClick={() => handleEdit(brand)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="vehicle-master-danger"
                        onClick={() => handleDelete(brand._id || brand.id)}
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

export default VehicleBrands;
