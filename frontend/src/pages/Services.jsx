import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Services.css";

function Services() {
  const [services, setServices] = useState([]);
  const [name, setName] = useState("");
  const [tasks, setTasks] = useState([{ title: "", isRequired: false }]);
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const isFormValid = useMemo(() => {
    if (!name.trim()) return false;
    return tasks.every((task) => task.title.trim());
  }, [name, tasks]);

  const loadServices = async () => {
    setError("");
    try {
      const { data } = await api.get("/services");
      setServices(Array.isArray(data) ? data : []);
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
          "Unable to load services right now. Please try again."
      );
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const resetForm = () => {
    setName("");
    setTasks([{ title: "", isRequired: false }]);
    setActive(true);
    setEditingId("");
  };

  const handleTaskChange = (index, field, value) => {
    setTasks((prev) =>
      prev.map((task, idx) =>
        idx === index ? { ...task, [field]: value } : task
      )
    );
  };

  const addTaskRow = () => {
    setTasks((prev) => [...prev, { title: "", isRequired: false }]);
  };

  const removeTaskRow = (index) => {
    setTasks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isFormValid) return;
    setIsSaving(true);
    setError("");
    const payload = {
      name: name.trim(),
      tasks: tasks.map((task) => ({
        title: task.title.trim(),
        isRequired: Boolean(task.isRequired),
      })),
      active,
    };
    try {
      if (editingId) {
        await api.put(`/services/${editingId}`, payload);
      } else {
        await api.post("/services", payload);
      }
      await loadServices();
      resetForm();
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
          "Unable to save service type. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (service) => {
    setEditingId(service._id || service.id);
    setName(service.name || "");
    setTasks(
      service.tasks?.length
        ? service.tasks.map((task) => ({
            title: task.title || "",
            isRequired: Boolean(task.isRequired),
          }))
        : [{ title: "", isRequired: false }]
    );
    setActive(service.active !== undefined ? Boolean(service.active) : true);
  };

  const handleDelete = async (serviceId) => {
    if (!window.confirm("Delete this service type?")) return;
    setIsSaving(true);
    setError("");
    try {
      await api.delete(`/services/${serviceId}`);
      await loadServices();
      if (editingId === serviceId) {
        resetForm();
      }
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
          "Unable to delete service type. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="services-page">
      <div className="services-header">
        <div>
          <PageHeader title="Services" />
          <p className="services-subtitle">Define service types and tasks.</p>
        </div>
      </div>

      {error ? <p className="services-error">{error}</p> : null}

      <section className="services-card">
        <div className="services-card__head">
          <h2>{editingId ? "Edit Service Type" : "Add Service Type"}</h2>
          <p>Build a standard checklist for every service.</p>
        </div>
        <form className="services-form" onSubmit={handleSubmit}>
          <div className="services-grid">
            <div className="services-field">
              <label htmlFor="service-name">Service Name</label>
              <input
                id="service-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <label className="services-toggle">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              Active
            </label>
          </div>

          <div className="services-tasks">
            <div className="services-tasks__head">
              <h3>Tasks</h3>
              <button type="button" onClick={addTaskRow}>
                + Add Task
              </button>
            </div>
            {tasks.map((task, index) => (
              <div key={`task-${index}`} className="services-task-row">
                <div className="services-field">
                  <label htmlFor={`task-title-${index}`}>Task Title</label>
                  <input
                    id={`task-title-${index}`}
                    value={task.title}
                    onChange={(event) =>
                      handleTaskChange(index, "title", event.target.value)
                    }
                    required
                  />
                </div>
                <label className="services-toggle">
                  <input
                    type="checkbox"
                    checked={task.isRequired}
                    onChange={(event) =>
                      handleTaskChange(index, "isRequired", event.target.checked)
                    }
                  />
                  Required
                </label>
                <button
                  type="button"
                  className="services-remove"
                  onClick={() => removeTaskRow(index)}
                  disabled={tasks.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="services-actions">
            {editingId ? (
              <button type="button" onClick={resetForm}>
                Cancel
              </button>
            ) : null}
            <button type="submit" disabled={!isFormValid || isSaving}>
              {editingId ? "Save Changes" : "Create Service"}
            </button>
          </div>
        </form>
      </section>

      <section className="services-card">
        <div className="services-card__head">
          <h2>Service Types</h2>
          <p>Manage availability and tasks across the workshop.</p>
        </div>
        {services.length === 0 ? (
          <p className="services-empty">No service types yet.</p>
        ) : (
          <div className="services-table">
            <table>
              <thead>
                <tr>
                  <th>Service Name</th>
                  <th>Task Count</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service._id || service.id}>
                    <td>{service.name}</td>
                    <td>{service.tasks?.length || 0}</td>
                    <td>
                      <span
                        className={`services-status ${
                          service.active ? "" : "services-status--inactive"
                        }`}
                      >
                        {service.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="services-actions-cell">
                      <button
                        type="button"
                        onClick={() => handleEdit(service)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="services-danger"
                        onClick={() =>
                          handleDelete(service._id || service.id)
                        }
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

export default Services;
