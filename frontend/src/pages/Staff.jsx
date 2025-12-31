import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Workers.css";

const ROLE_TYPES = [
  { value: "OFFICE", label: "Office" },
  { value: "TECHNICAL", label: "Technical" },
];

const ROLE_NAMES = {
  OFFICE: ["Owner", "Manager", "Cashier", "Receptionist"],
  TECHNICAL: ["Mechanic", "Technician", "Electrician", "Helper"],
};

const SALARY_TYPES = [
  { value: "FIXED", label: "Fixed" },
  { value: "PER_DAY", label: "Per Day" },
  { value: "COMMISSION", label: "Commission" },
  { value: "HYBRID", label: "Hybrid (Basic + Commission)" },
];

function Staff() {
  const [staff, setStaff] = useState([]);
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [roleType, setRoleType] = useState("TECHNICAL");
  const [roleName, setRoleName] = useState("Technician");
  const [salaryType, setSalaryType] = useState("FIXED");
  const [basicSalary, setBasicSalary] = useState("");
  const [commissionPercentage, setCommissionPercentage] = useState("");
  const [perDayRate, setPerDayRate] = useState("");
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [editingId, setEditingId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const isFormValid = useMemo(() => {
    return (
      fullName.trim() &&
      phoneNumber.trim() &&
      roleType &&
      roleName
    );
  }, [fullName, phoneNumber, roleType, roleName]);

  const loadStaff = async () => {
    setError("");
    setSuccessMessage("");
    try {
      const { data } = await api.get("/staff");
      setStaff(Array.isArray(data) ? data : []);
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
          "Unable to load staff right now. Please try again."
      );
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const resetForm = () => {
    setFullName("");
    setPhoneNumber("");
    setRoleType("TECHNICAL");
    setRoleName("Technician");
    setSalaryType("FIXED");
    setBasicSalary("");
    setCommissionPercentage("");
    setPerDayRate("");
    setActive(true);
    setNotes("");
    setIdNumber("");
    setEditingId("");
  };

  const parseNumber = (value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isFormValid) return;
    setIsSaving(true);
    setError("");
    setSuccessMessage("");
    const payload = {
      fullName: fullName.trim(),
      phoneNumber: phoneNumber.trim(),
      roleType,
      roleName,
      salaryType,
      basicSalary: parseNumber(basicSalary),
      commissionPercentage: parseNumber(commissionPercentage),
      perDayRate: parseNumber(perDayRate),
      active,
      idNumber: idNumber.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    try {
      if (editingId) {
        await api.patch(`/staff/${editingId}`, payload);
        setSuccessMessage("Staff updated successfully.");
      } else {
        await api.post("/staff", payload);
        setSuccessMessage("Staff created successfully.");
      }
      await loadStaff();
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
          "Unable to save staff details. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (member) => {
    setEditingId(member._id || member.id);
    setFullName(member.fullName || "");
    setPhoneNumber(member.phoneNumber || "");
    setRoleType(member.roleType || "TECHNICAL");
    setRoleName(
      member.roleName ||
        (member.roleType === "OFFICE" ? "Manager" : "Technician")
    );
    setSalaryType(member.salaryType || "FIXED");
    setBasicSalary(
      member.basicSalary !== undefined && member.basicSalary !== null
        ? String(member.basicSalary)
        : ""
    );
    setCommissionPercentage(
      member.commissionPercentage !== undefined &&
        member.commissionPercentage !== null
        ? String(member.commissionPercentage)
        : ""
    );
    setPerDayRate(
      member.perDayRate !== undefined && member.perDayRate !== null
        ? String(member.perDayRate)
        : ""
    );
    setActive(member.active !== undefined ? Boolean(member.active) : true);
    setNotes(member.notes || "");
    setIdNumber(member.idNumber || "");
  };

  const handleDelete = async (staffId) => {
    if (!window.confirm("Delete this staff record?")) return;
    setIsSaving(true);
    setError("");
    try {
      await api.delete(`/staff/${staffId}`);
      await loadStaff();
      if (editingId === staffId) {
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
          "Unable to delete staff. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const roleNameOptions = ROLE_NAMES[roleType] || [];

  const paySummary = (member) => {
    const typeLabel =
      SALARY_TYPES.find((option) => option.value === member.salaryType)
        ?.label || member.salaryType;
    const parts = [typeLabel || "Fixed"];
    if (member.basicSalary) parts.push(`Base: ${member.basicSalary}`);
    if (member.commissionPercentage)
      parts.push(`Comm: ${member.commissionPercentage}%`);
    if (member.perDayRate) parts.push(`Per day: ${member.perDayRate}`);
    return parts.join(" | ");
  };

  return (
    <div className="workers-page">
      <div className="workers-header">
        <div>
          <PageHeader title="Staff" />
          <p className="workers-subtitle">
            Manage staff profiles, roles, and compensation.
          </p>
        </div>
      </div>

      {error ? <p className="workers-error">{error}</p> : null}
      {successMessage ? (
        <p className="workers-success">{successMessage}</p>
      ) : null}

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>{editingId ? "Edit Staff" : "Add Staff"}</h2>
          <p>Store role, salary type, and contact details.</p>
        </div>
        <form className="workers-form" onSubmit={handleSubmit}>
          <div className="workers-grid">
            <div className="workers-field">
              <label htmlFor="staff-name">Full Name</label>
              <input
                id="staff-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
            </div>
            <div className="workers-field">
              <label htmlFor="staff-phone">Phone Number</label>
              <input
                id="staff-phone"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                required
              />
            </div>
            <div className="workers-field">
              <label htmlFor="staff-role-type">Role Type</label>
              <select
                id="staff-role-type"
                value={roleType}
                onChange={(event) => {
                  const nextType = event.target.value;
                  setRoleType(nextType);
                  const nextRoles = ROLE_NAMES[nextType] || [];
                  setRoleName(nextRoles[0] || "");
                }}
              >
                {ROLE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="workers-field">
              <label htmlFor="staff-role-name">Role Name</label>
              <select
                id="staff-role-name"
                value={roleName}
                onChange={(event) => setRoleName(event.target.value)}
              >
                {roleNameOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="workers-field">
              <label htmlFor="staff-salary-type">Salary Type</label>
              <select
                id="staff-salary-type"
                value={salaryType}
                onChange={(event) => setSalaryType(event.target.value)}
              >
                {SALARY_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {["FIXED", "HYBRID"].includes(salaryType) ? (
              <div className="workers-field">
                <label htmlFor="staff-basic-salary">Base Salary</label>
                <input
                  id="staff-basic-salary"
                  type="number"
                  min="0"
                  value={basicSalary}
                  onChange={(event) => setBasicSalary(event.target.value)}
                />
              </div>
            ) : null}
            {["COMMISSION", "HYBRID"].includes(salaryType) ? (
              <div className="workers-field">
                <label htmlFor="staff-commission">Commission %</label>
                <input
                  id="staff-commission"
                  type="number"
                  min="0"
                  max="100"
                  value={commissionPercentage}
                  onChange={(event) =>
                    setCommissionPercentage(event.target.value)
                  }
                />
              </div>
            ) : null}
            {salaryType === "PER_DAY" ? (
              <div className="workers-field">
                <label htmlFor="staff-per-day">Per Day Rate</label>
                <input
                  id="staff-per-day"
                  type="number"
                  min="0"
                  value={perDayRate}
                  onChange={(event) => setPerDayRate(event.target.value)}
                />
              </div>
            ) : null}
            <div className="workers-field">
              <label htmlFor="staff-id-number">ID Number</label>
              <input
                id="staff-id-number"
                value={idNumber}
                onChange={(event) => setIdNumber(event.target.value)}
                placeholder="NIC / ID card number"
              />
            </div>
            <div className="workers-field workers-field--notes">
              <label htmlFor="staff-notes">Notes</label>
              <textarea
                id="staff-notes"
                rows="3"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional internal notes."
              />
            </div>
            <label className="workers-toggle">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              Active
            </label>
          </div>

          <div className="workers-actions">
            {editingId ? (
              <button type="button" onClick={resetForm}>
                Cancel
              </button>
            ) : null}
            <button type="submit" disabled={!isFormValid || isSaving}>
              {editingId ? "Save Changes" : "Create Staff"}
            </button>
          </div>
        </form>
      </section>

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>Staff Directory</h2>
          <p>Activate, edit, or disable staff from here.</p>
        </div>
        {staff.length === 0 ? (
          <p className="workers-empty">No staff added yet.</p>
        ) : (
          <div className="workers-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Role Type</th>
                  <th>Role Name</th>
                  <th>Pay Plan</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member._id || member.id}>
                    <td>{member.fullName}</td>
                    <td>{member.phoneNumber}</td>
                    <td>{member.roleType || "TECHNICAL"}</td>
                    <td>{member.roleName || "-"}</td>
                    <td>{paySummary(member)}</td>
                    <td>
                      <span
                        className={`workers-status ${
                          member.active ? "" : "workers-status--inactive"
                        }`}
                      >
                        {member.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="workers-actions-cell">
                      <button type="button" onClick={() => handleEdit(member)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="workers-danger"
                        onClick={() => handleDelete(member._id || member.id)}
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

export default Staff;
