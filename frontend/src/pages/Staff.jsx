import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Workers.css";

const EMPTY_FORM = {
  employeeId: "",
  fullName: "",
  NIC: "",
  address: "",
  phoneNumber: "",
  email: "",
  employeeType: "technical",
  employmentType: "permanent",
  departmentId: "",
  roleId: "",
  shiftId: "",
  joinDate: "",
  status: "active",
  roleType: "TECHNICAL",
  roleName: "Technician",
  salaryType: "FIXED",
  basicSalary: "",
  perDayRate: "",
  otRatePerHourOverride: "",
  commissionPercentage: "",
  notes: "",
  documents: [],
};

function Staff() {
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [payrollRows, setPayrollRows] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [salaryConfig, setSalaryConfig] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detailTab, setDetailTab] = useState("profile");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const loadBase = async () => {
    const [staffRes, roleRes, depRes, shiftRes] = await Promise.all([
      api.get("/staff"),
      api.get("/roles"),
      api.get("/organization/departments"),
      api.get("/organization/shifts"),
    ]);
    setRows(Array.isArray(staffRes.data) ? staffRes.data : []);
    setRoles(Array.isArray(roleRes.data) ? roleRes.data : []);
    setDepartments(Array.isArray(depRes.data) ? depRes.data : []);
    setShifts(Array.isArray(shiftRes.data) ? shiftRes.data : []);
  };

  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([
          api.post("/roles/seed"),
          api.post("/organization/departments/seed"),
          api.post("/organization/shifts/seed"),
          api.post("/leave-types/seed"),
          api.post("/settings/seed"),
        ]);
      } catch {
        // no-op
      }
      try {
        await loadBase();
      } catch (err) {
        setError(err.response?.data?.message || "Unable to load staff.");
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const run = async () => {
      try {
        const month = new Date().toISOString().slice(0, 7);
        const [payrollRes, attendanceRes, balanceRes, salaryRes] = await Promise.all([
          api.get("/payroll", { params: { employeeId: selectedId } }),
          api.get("/attendance", {
            params: {
              month: Number(month.slice(5, 7)),
              year: Number(month.slice(0, 4)),
              staffId: selectedId,
            },
          }),
          api.get("/leave-requests/balances", {
            params: { year: new Date().getFullYear() },
          }),
          api.get(`/salary-configs/${selectedId}`),
        ]);
        setPayrollRows(Array.isArray(payrollRes.data?.records) ? payrollRes.data.records : []);
        setAttendanceRows(Array.isArray(attendanceRes.data?.dailyRecords) ? attendanceRes.data.dailyRecords : []);
        const balances = Array.isArray(balanceRes.data) ? balanceRes.data : [];
        setLeaveBalances(
          balances.filter((entry) => String(entry.employeeId?._id || entry.employeeId) === selectedId)
        );
        setSalaryConfig(salaryRes.data || null);
      } catch {
        // no-op
      }
    };
    run();
  }, [selectedId]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (departmentFilter && String(row.departmentId || "") !== departmentFilter) return false;
      if (roleFilter && String(row.roleId || "") !== roleFilter) return false;
      if (employmentTypeFilter && row.employmentType !== employmentTypeFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        String(row.fullName || "").toLowerCase().includes(q) ||
        String(row.employeeId || "").toLowerCase().includes(q) ||
        String(row.NIC || row.idNumber || "").toLowerCase().includes(q)
      );
    });
  }, [rows, departmentFilter, roleFilter, employmentTypeFilter, statusFilter, search]);

  const selectedEmployee = useMemo(
    () => rows.find((row) => String(row._id || row.id) === selectedId) || null,
    [rows, selectedId]
  );

  const setFormField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        ...form,
        employeeId: String(form.employeeId || "").trim() || undefined,
        basicSalary: Number(form.basicSalary || 0),
        perDayRate: Number(form.perDayRate || 0),
        otRatePerHourOverride:
          form.otRatePerHourOverride === "" || form.otRatePerHourOverride === null
            ? null
            : Number(form.otRatePerHourOverride || 0),
        commissionPercentage: Number(form.commissionPercentage || 0),
      };
      if (editingId) {
        await api.patch(`/staff/${editingId}`, payload);
        setMessage("Employee updated.");
      } else {
        await api.post("/staff", payload);
        setMessage("Employee added.");
      }
      await loadBase();
      resetForm();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save employee.");
    } finally {
      setSaving(false);
    }
  };

  const editEmployee = (row) => {
    setEditingId(String(row._id || row.id));
    setForm({
      employeeId: row.employeeId || row.employeeNo || "",
      fullName: row.fullName || "",
      NIC: row.NIC || row.idNumber || "",
      address: row.address || "",
      phoneNumber: row.phoneNumber || row.phone || "",
      email: row.email || "",
      employeeType: row.employeeType || "technical",
      employmentType: row.employmentType || "permanent",
      departmentId: row.departmentId || "",
      roleId: row.roleId || "",
      shiftId: row.shiftId || "",
      joinDate: row.joinDate ? String(row.joinDate).slice(0, 10) : "",
      status: row.status || (row.active === false ? "inactive" : "active"),
      roleType: row.roleType || "TECHNICAL",
      roleName: row.roleName || "Technician",
      salaryType: row.salaryType || "FIXED",
      basicSalary: row.basicSalary ?? "",
      perDayRate: row.perDayRate ?? "",
      otRatePerHourOverride: row.otRatePerHourOverride ?? "",
      commissionPercentage: row.commissionPercentage ?? "",
      notes: row.notes || "",
      documents: Array.isArray(row.documents) ? row.documents : [],
    });
  };

  const toggleStatus = async (row) => {
    const id = String(row._id || row.id);
    const nextStatus = row.status === "inactive" || row.active === false ? "active" : "inactive";
    try {
      await api.patch(`/staff/${id}`, {
        status: nextStatus,
        active: nextStatus === "active",
      });
      await loadBase();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to toggle status.");
    }
  };

  const saveSalaryConfig = async () => {
    if (!selectedId) return;
    try {
      await api.put(`/salary-configs/${selectedId}`, salaryConfig || {});
      setMessage("Salary configuration saved.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save salary config.");
    }
  };

  return (
    <div className="workers-page">
      <div className="workers-header">
        <div>
          <PageHeader title="Staff" />
          <p className="workers-subtitle">Employee setup, role assignment, and payroll profile.</p>
        </div>
      </div>
      {error ? <p className="workers-error">{error}</p> : null}
      {message ? <p className="workers-success">{message}</p> : null}

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>{editingId ? "Edit Employee" : "Add Employee"}</h2>
          <p>Manage employee records without replacing existing data.</p>
        </div>
        <form className="workers-form" onSubmit={submit}>
          <div className="workers-grid">
            <div className="workers-field"><label>Employee No</label><input value={form.employeeId} onChange={(e) => setFormField("employeeId", e.target.value)} placeholder="e.g. 8071302" /></div>
            <div className="workers-field"><label>Full Name</label><input value={form.fullName} onChange={(e) => setFormField("fullName", e.target.value)} required /></div>
            <div className="workers-field"><label>NIC</label><input value={form.NIC} onChange={(e) => setFormField("NIC", e.target.value)} /></div>
            <div className="workers-field"><label>Address</label><input value={form.address} onChange={(e) => setFormField("address", e.target.value)} /></div>
            <div className="workers-field"><label>Phone</label><input value={form.phoneNumber} onChange={(e) => setFormField("phoneNumber", e.target.value)} required /></div>
            <div className="workers-field"><label>Email</label><input value={form.email} onChange={(e) => setFormField("email", e.target.value)} /></div>
            <div className="workers-field">
              <label>Employee Type</label>
              <select value={form.employeeType} onChange={(e) => setFormField("employeeType", e.target.value)}>
                <option value="office">Office</option>
                <option value="technical">Technical</option>
              </select>
            </div>
            <div className="workers-field">
              <label>Employment Type</label>
              <select value={form.employmentType} onChange={(e) => setFormField("employmentType", e.target.value)}>
                <option value="permanent">Permanent</option>
                <option value="daily-paid">Daily Paid</option>
                <option value="contract">Contract</option>
              </select>
            </div>
            <div className="workers-field">
              <label>Department</label>
              <select value={form.departmentId} onChange={(e) => setFormField("departmentId", e.target.value)}>
                <option value="">Select</option>
                {departments.map((entry) => (
                  <option key={entry._id} value={entry._id}>{entry.name}</option>
                ))}
              </select>
            </div>
            <div className="workers-field">
              <label>Role</label>
              <select value={form.roleId} onChange={(e) => setFormField("roleId", e.target.value)}>
                <option value="">Select</option>
                {roles.map((entry) => (
                  <option key={entry._id} value={entry._id}>{entry.roleName}</option>
                ))}
              </select>
            </div>
            <div className="workers-field">
              <label>Shift</label>
              <select value={form.shiftId} onChange={(e) => setFormField("shiftId", e.target.value)}>
                <option value="">Select</option>
                {shifts.map((entry) => (
                  <option key={entry._id} value={entry._id}>{entry.name}</option>
                ))}
              </select>
            </div>
            <div className="workers-field">
              <label>Join Date</label>
              <input type="date" value={form.joinDate} onChange={(e) => setFormField("joinDate", e.target.value)} />
            </div>
            <div className="workers-field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setFormField("status", e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="workers-field">
              <label>Salary Type</label>
              <select value={form.salaryType} onChange={(e) => setFormField("salaryType", e.target.value)}>
                <option value="FIXED">Fixed</option>
                <option value="PER_DAY">Per Day</option>
                <option value="COMMISSION">Commission</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
            <div className="workers-field"><label>Basic Salary</label><input type="number" min="0" value={form.basicSalary} onChange={(e) => setFormField("basicSalary", e.target.value)} /></div>
            <div className="workers-field"><label>Daily Rate</label><input type="number" min="0" value={form.perDayRate} onChange={(e) => setFormField("perDayRate", e.target.value)} /></div>
            <div className="workers-field"><label>OT Rate Override</label><input type="number" min="0" step="0.01" value={form.otRatePerHourOverride} onChange={(e) => setFormField("otRatePerHourOverride", e.target.value)} /></div>
            <div className="workers-field"><label>Commission %</label><input type="number" min="0" max="100" value={form.commissionPercentage} onChange={(e) => setFormField("commissionPercentage", e.target.value)} /></div>
            <div className="workers-field workers-field--notes">
              <label>Documents (URL list)</label>
              <textarea
                rows={2}
                value={(form.documents || []).map((d) => `${d.type}|${d.name}|${d.url}`).join("\n")}
                onChange={(e) =>
                  setFormField(
                    "documents",
                    e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line) => {
                        const [type, name, url] = line.split("|");
                        return {
                          type: type || "certificate",
                          name: name || "Document",
                          url: url || "",
                          uploadedAt: new Date().toISOString(),
                        };
                      })
                  )
                }
                placeholder="type|name|url"
              />
            </div>
            <div className="workers-field workers-field--notes"><label>Notes</label><textarea rows={3} value={form.notes} onChange={(e) => setFormField("notes", e.target.value)} /></div>
          </div>
          <div className="workers-actions">
            {editingId ? <button type="button" onClick={resetForm}>Cancel</button> : null}
            <button type="submit" disabled={saving}>{editingId ? "Save Changes" : "Add Employee"}</button>
          </div>
        </form>
      </section>

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>Employee Directory</h2>
          <p>Search and filter by department, role, employment, and status.</p>
        </div>
        <div className="workers-grid">
          <div className="workers-field"><label>Search</label><input value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="workers-field">
            <label>Department</label>
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
              <option value="">All</option>
              {departments.map((d) => <option value={d._id} key={d._id}>{d.name}</option>)}
            </select>
          </div>
          <div className="workers-field">
            <label>Role</label>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All</option>
              {roles.map((r) => <option value={r._id} key={r._id}>{r.roleName}</option>)}
            </select>
          </div>
          <div className="workers-field">
            <label>Employment Type</label>
            <select value={employmentTypeFilter} onChange={(e) => setEmploymentTypeFilter(e.target.value)}>
              <option value="">All</option>
              <option value="permanent">Permanent</option>
              <option value="daily-paid">Daily Paid</option>
              <option value="contract">Contract</option>
            </select>
          </div>
          <div className="workers-field">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div className="workers-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Department</th>
                <th>Type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row._id || row.id}>
                  <td>{row.fullName}</td>
                  <td>{row.roleName || "-"}</td>
                  <td>{departments.find((d) => String(d._id) === String(row.departmentId))?.name || "-"}</td>
                  <td>{row.employmentType || "-"}</td>
                  <td>{row.status || (row.active === false ? "inactive" : "active")}</td>
                  <td className="workers-actions-cell">
                    <button type="button" onClick={() => editEmployee(row)}>Edit</button>
                    <button type="button" onClick={() => setSelectedId(String(row._id || row.id))}>View</button>
                    <button type="button" onClick={() => toggleStatus(row)}>Toggle Status</button>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr><td colSpan={6}>No employees found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedEmployee ? (
        <section className="workers-card">
          <div className="workers-card__head">
            <h2>Employee Detail: {selectedEmployee.fullName}</h2>
            <p>ID: {selectedEmployee.employeeId || selectedEmployee._id}</p>
          </div>
          <div className="workers-actions-cell">
            <button type="button" onClick={() => setDetailTab("profile")}>Profile</button>
            <button type="button" onClick={() => setDetailTab("documents")}>Documents</button>
            <button type="button" onClick={() => setDetailTab("attendance")}>Attendance Summary</button>
            <button type="button" onClick={() => setDetailTab("leave")}>Leave Balance</button>
            <button type="button" onClick={() => setDetailTab("payroll")}>Payroll History</button>
            <button type="button" onClick={() => setDetailTab("salary")}>Salary</button>
          </div>
          {detailTab === "profile" ? (
            <div className="workers-grid">
              <div className="workers-field"><label>NIC</label><input value={selectedEmployee.NIC || ""} readOnly /></div>
              <div className="workers-field"><label>Email</label><input value={selectedEmployee.email || ""} readOnly /></div>
              <div className="workers-field"><label>Phone</label><input value={selectedEmployee.phoneNumber || ""} readOnly /></div>
              <div className="workers-field"><label>Address</label><input value={selectedEmployee.address || ""} readOnly /></div>
            </div>
          ) : null}
          {detailTab === "documents" ? (
            <div className="workers-table">
              <table>
                <thead><tr><th>Type</th><th>Name</th><th>URL</th><th>Uploaded</th></tr></thead>
                <tbody>
                  {(selectedEmployee.documents || []).map((doc, index) => (
                    <tr key={index}>
                      <td>{doc.type}</td>
                      <td>{doc.name}</td>
                      <td><a href={doc.url} target="_blank" rel="noreferrer">Open</a></td>
                      <td>{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                  {(selectedEmployee.documents || []).length === 0 ? (
                    <tr><td colSpan={4}>No documents uploaded.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
          {detailTab === "attendance" ? (
            <div className="workers-table">
              <table>
                <thead><tr><th>Date</th><th>Status</th><th>Check In</th><th>Check Out</th><th>Notes</th></tr></thead>
                <tbody>
                  {attendanceRows.map((entry) => (
                    <tr key={entry._id}>
                      <td>{entry.date}</td>
                      <td>{entry.status}</td>
                      <td>{entry.checkInTime || "-"}</td>
                      <td>{entry.checkOutTime || "-"}</td>
                      <td>{entry.notes || "-"}</td>
                    </tr>
                  ))}
                  {attendanceRows.length === 0 ? <tr><td colSpan={5}>No records.</td></tr> : null}
                </tbody>
              </table>
            </div>
          ) : null}
          {detailTab === "leave" ? (
            <div className="workers-table">
              <table>
                <thead><tr><th>Leave Type</th><th>Allocated</th><th>Used</th><th>Remaining</th></tr></thead>
                <tbody>
                  {leaveBalances.map((entry) => (
                    <tr key={entry._id}>
                      <td>{entry.leaveTypeId?.name || "-"}</td>
                      <td>{entry.allocated}</td>
                      <td>{entry.used}</td>
                      <td>{entry.remaining}</td>
                    </tr>
                  ))}
                  {leaveBalances.length === 0 ? <tr><td colSpan={4}>No leave balances.</td></tr> : null}
                </tbody>
              </table>
            </div>
          ) : null}
          {detailTab === "payroll" ? (
            <div className="workers-table">
              <table>
                <thead><tr><th>Month</th><th>Status</th><th>Net</th><th>Generated</th></tr></thead>
                <tbody>
                  {payrollRows.map((entry) => (
                    <tr key={entry._id}>
                      <td>{entry.month}</td>
                      <td>{entry.status}</td>
                      <td>{Number(entry.netSalary || 0).toFixed(2)}</td>
                      <td>{entry.generatedAt ? new Date(entry.generatedAt).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                  {payrollRows.length === 0 ? <tr><td colSpan={4}>No payroll records.</td></tr> : null}
                </tbody>
              </table>
            </div>
          ) : null}
          {detailTab === "salary" ? (
            <div>
              <div className="workers-grid">
                <div className="workers-field">
                  <label>Salary Model</label>
                  <select
                    value={salaryConfig?.salaryModel || "fixed"}
                    onChange={(e) =>
                      setSalaryConfig((prev) => ({ ...(prev || {}), salaryModel: e.target.value }))
                    }
                  >
                    <option value="fixed">Fixed</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
                <div className="workers-field">
                  <label>Basic Salary</label>
                  <input
                    type="number"
                    min="0"
                    value={salaryConfig?.basicSalary || 0}
                    onChange={(e) =>
                      setSalaryConfig((prev) => ({
                        ...(prev || {}),
                        basicSalary: Number(e.target.value || 0),
                      }))
                    }
                  />
                </div>
                <div className="workers-field">
                  <label>Daily Rate</label>
                  <input
                    type="number"
                    min="0"
                    value={salaryConfig?.dailyRate || 0}
                    onChange={(e) =>
                      setSalaryConfig((prev) => ({
                        ...(prev || {}),
                        dailyRate: Number(e.target.value || 0),
                      }))
                    }
                  />
                </div>
              </div>
              <div className="workers-actions">
                <button type="button" onClick={saveSalaryConfig}>Save Salary Configuration</button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export default Staff;
