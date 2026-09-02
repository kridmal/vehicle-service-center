import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Workers.css";

const PERMISSION_KEYS = [
  "markAttendance",
  "approveLeave",
  "runPayroll",
  "viewReports",
  "manageEmployees",
  "manageRoles",
  "manageInventory",
  "manageJobCards",
  "manageCustomers",
  "manageInvoices",
  "manageVehicles",
  "manageServices",
  "viewDashboard",
  "manageSalaryConfig",
  "approvePayroll",
];

const EMPTY_FORM = {
  roleName: "",
  category: "office",
  permissions: {},
};

function Roles() {
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [departments, setDepartments] = useState([]);
  const [deptForm, setDeptForm] = useState({ name: "", description: "" });
  const [editingDeptId, setEditingDeptId] = useState("");

  const [shifts, setShifts] = useState([]);
  const [shiftForm, setShiftForm] = useState({ name: "", startTime: "", endTime: "" });
  const [editingShiftId, setEditingShiftId] = useState("");

  const loadRoles = async () => {
    try {
      const { data } = await api.get("/roles");
      setRoles(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load roles.");
    }
  };

  const loadDepartments = async () => {
    try {
      const { data } = await api.get("/departments");
      setDepartments(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  };

  const loadShifts = async () => {
    try {
      const { data } = await api.get("/shifts");
      setShifts(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadRoles();
    loadDepartments();
    loadShifts();
  }, []);

  const togglePermission = (key) => {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions?.[key],
      },
    }));
  };

  const handleSeed = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.post("/roles/seed");
      await loadRoles();
      setMessage("Roles seeded.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to seed roles.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.roleName.trim()) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (editingId) {
        await api.put(`/roles/${editingId}`, form);
        setMessage("Role updated.");
      } else {
        await api.post("/roles", form);
        setMessage("Role created.");
      }
      setForm(EMPTY_FORM);
      setEditingId("");
      await loadRoles();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save role.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeptSubmit = async (event) => {
    event.preventDefault();
    if (!deptForm.name.trim()) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (editingDeptId) {
        await api.put(`/departments/${editingDeptId}`, deptForm);
        setMessage("Department updated.");
      } else {
        await api.post("/departments", deptForm);
        setMessage("Department created.");
      }
      setDeptForm({ name: "", description: "" });
      setEditingDeptId("");
      await loadDepartments();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save department.");
    } finally {
      setSaving(false);
    }
  };

  const deleteDept = async (id) => {
    setError("");
    setMessage("");
    try {
      await api.delete(`/departments/${id}`);
      setMessage("Department deleted.");
      await loadDepartments();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete department.");
    }
  };

  const seedDepartments = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.post("/organization/departments/seed");
      await loadDepartments();
      setMessage("Departments seeded.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to seed departments.");
    } finally {
      setSaving(false);
    }
  };

  const handleShiftSubmit = async (event) => {
    event.preventDefault();
    if (!shiftForm.name.trim() || !shiftForm.startTime || !shiftForm.endTime) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (editingShiftId) {
        await api.put(`/shifts/${editingShiftId}`, shiftForm);
        setMessage("Shift updated.");
      } else {
        await api.post("/shifts", shiftForm);
        setMessage("Shift created.");
      }
      setShiftForm({ name: "", startTime: "", endTime: "" });
      setEditingShiftId("");
      await loadShifts();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save shift.");
    } finally {
      setSaving(false);
    }
  };

  const deleteShift = async (id) => {
    setError("");
    setMessage("");
    try {
      await api.delete(`/shifts/${id}`);
      setMessage("Shift deleted.");
      await loadShifts();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete shift.");
    }
  };

  const seedShifts = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.post("/organization/shifts/seed");
      await loadShifts();
      setMessage("Shifts seeded.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to seed shifts.");
    } finally {
      setSaving(false);
    }
  };

  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => String(a.roleName).localeCompare(String(b.roleName))),
    [roles]
  );

  return (
    <div className="workers-page">
      <div className="workers-header">
        <div>
          <PageHeader title="Roles & Setup" />
          <p className="workers-subtitle">Roles, departments, shifts, and permissions.</p>
        </div>
      </div>

      {error ? <p className="workers-error">{error}</p> : null}
      {message ? <p className="workers-success">{message}</p> : null}

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>{editingId ? "Edit Role" : "Add Role"}</h2>
          <p>Define role category and permission matrix.</p>
        </div>
        <form className="workers-form" onSubmit={handleSubmit}>
          <div className="workers-grid">
            <div className="workers-field">
              <label htmlFor="role-name">Role Name</label>
              <input
                id="role-name"
                value={form.roleName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, roleName: event.target.value }))
                }
                required
              />
            </div>
            <div className="workers-field">
              <label htmlFor="role-category">Category</label>
              <select
                id="role-category"
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, category: event.target.value }))
                }
              >
                <option value="office">Office</option>
                <option value="technical">Technical</option>
              </select>
            </div>
            <div className="workers-field workers-field--notes">
              <label>Permissions</label>
              <div className="workers-actions-cell" style={{ flexWrap: "wrap" }}>
                {PERMISSION_KEYS.map((key) => (
                  <label className="workers-toggle" key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(form.permissions?.[key])}
                      onChange={() => togglePermission(key)}
                    />
                    {key}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="workers-actions">
            <button type="button" onClick={handleSeed} disabled={saving}>
              Seed Defaults
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId("");
                  setForm(EMPTY_FORM);
                }}
              >
                Cancel
              </button>
            ) : null}
            <button type="submit" disabled={saving}>
              {editingId ? "Save Changes" : "Create Role"}
            </button>
          </div>
        </form>
      </section>

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>Roles List</h2>
          <p>Employee count is based on assigned role.</p>
        </div>
        <div className="workers-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Employees</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRoles.map((role) => (
                <tr key={role._id}>
                  <td>{role.roleName}</td>
                  <td>{role.category}</td>
                  <td>{role.employeeCount || 0}</td>
                  <td className="workers-actions-cell">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(role._id);
                        setForm({
                          roleName: role.roleName || "",
                          category: role.category || "office",
                          permissions: role.permissions || {},
                        });
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {sortedRoles.length === 0 ? (
                <tr>
                  <td colSpan={4}>No roles configured.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>Departments</h2>
          <p>Manage departments for employee assignment.</p>
        </div>
        <form className="workers-form" onSubmit={handleDeptSubmit}>
          <div className="workers-grid">
            <div className="workers-field">
              <label>Department Name</label>
              <input
                value={deptForm.name}
                onChange={(e) => setDeptForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="workers-field">
              <label>Description</label>
              <input
                value={deptForm.description}
                onChange={(e) => setDeptForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <div className="workers-actions">
            <button type="button" onClick={seedDepartments} disabled={saving}>
              Seed Defaults
            </button>
            {editingDeptId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingDeptId("");
                  setDeptForm({ name: "", description: "" });
                }}
              >
                Cancel
              </button>
            ) : null}
            <button type="submit" disabled={saving}>
              {editingDeptId ? "Save Changes" : "Add Department"}
            </button>
          </div>
        </form>
        <div className="workers-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Employees</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => (
                <tr key={dept._id}>
                  <td>{dept.name}</td>
                  <td>{dept.description || "-"}</td>
                  <td>{dept.employeeCount || 0}</td>
                  <td className="workers-actions-cell">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDeptId(dept._id);
                        setDeptForm({
                          name: dept.name || "",
                          description: dept.description || "",
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteDept(dept._id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={4}>No departments configured.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>Shifts</h2>
          <p>Manage work shifts for employee scheduling.</p>
        </div>
        <form className="workers-form" onSubmit={handleShiftSubmit}>
          <div className="workers-grid">
            <div className="workers-field">
              <label>Shift Name</label>
              <input
                value={shiftForm.name}
                onChange={(e) => setShiftForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="workers-field">
              <label>Start Time</label>
              <input
                type="time"
                value={shiftForm.startTime}
                onChange={(e) => setShiftForm((p) => ({ ...p, startTime: e.target.value }))}
                required
              />
            </div>
            <div className="workers-field">
              <label>End Time</label>
              <input
                type="time"
                value={shiftForm.endTime}
                onChange={(e) => setShiftForm((p) => ({ ...p, endTime: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="workers-actions">
            <button type="button" onClick={seedShifts} disabled={saving}>
              Seed Defaults
            </button>
            {editingShiftId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingShiftId("");
                  setShiftForm({ name: "", startTime: "", endTime: "" });
                }}
              >
                Cancel
              </button>
            ) : null}
            <button type="submit" disabled={saving}>
              {editingShiftId ? "Save Changes" : "Add Shift"}
            </button>
          </div>
        </form>
        <div className="workers-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Employees</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift._id}>
                  <td>{shift.name}</td>
                  <td>{shift.startTime}</td>
                  <td>{shift.endTime}</td>
                  <td>{shift.employeeCount || 0}</td>
                  <td className="workers-actions-cell">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingShiftId(shift._id);
                        setShiftForm({
                          name: shift.name || "",
                          startTime: shift.startTime || "",
                          endTime: shift.endTime || "",
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteShift(shift._id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {shifts.length === 0 ? (
                <tr>
                  <td colSpan={5}>No shifts configured.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Roles;
