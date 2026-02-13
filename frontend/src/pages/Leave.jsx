import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Workers.css";

const toMonthValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

function Leave() {
  const [tab, setTab] = useState("requests");
  const [staff, setStaff] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(toMonthValue(new Date()));
  const [statusFilter, setStatusFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    staffId: "",
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    totalDays: "",
    reason: "",
    attachmentUrl: "",
  });
  const [leaveTypeForm, setLeaveTypeForm] = useState({
    name: "",
    allocationPerYear: "",
    allocationPerMonth: "",
    carryForwardAllowed: false,
    isPaid: true,
    requiresDocument: false,
    applicableTo: "all",
    isActive: true,
  });

  const loadBase = async () => {
    const [staffRes, typeRes] = await Promise.all([
      api.get("/staff"),
      api.get("/leave-types"),
    ]);
    setStaff(Array.isArray(staffRes.data) ? staffRes.data : []);
    setLeaveTypes(Array.isArray(typeRes.data) ? typeRes.data : []);
  };

  const loadRequests = async () => {
    const params = {};
    if (statusFilter !== "all") params.status = statusFilter.toUpperCase();
    if (staffFilter) params.staffId = staffFilter;
    const { data } = await api.get("/leave-requests", { params });
    setRequests(Array.isArray(data) ? data : []);
  };

  const loadBalances = async () => {
    const year = Number(selectedMonth.slice(0, 4));
    const { data } = await api.get("/leave-requests/balances", { params: { year } });
    setBalances(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    const run = async () => {
      try {
        await loadBase();
        await loadRequests();
        await loadBalances();
      } catch (err) {
        setError(err.response?.data?.message || "Unable to load leave data.");
      }
    };
    run();
  }, []);

  useEffect(() => {
    loadRequests().catch(() => {});
  }, [statusFilter, staffFilter]);

  useEffect(() => {
    loadBalances().catch(() => {});
  }, [selectedMonth]);

  const filteredRequests = useMemo(() => {
    return requests.filter((entry) => {
      const month = new Date(entry.startDate).toISOString().slice(0, 7);
      return month === selectedMonth;
    });
  }, [requests, selectedMonth]);

  const submitLeaveRequest = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.post("/leave-requests", {
        ...form,
        totalDays: Number(form.totalDays || 0),
        days: Number(form.totalDays || 0),
      });
      setForm({
        staffId: "",
        leaveTypeId: "",
        startDate: "",
        endDate: "",
        totalDays: "",
        reason: "",
        attachmentUrl: "",
      });
      await loadRequests();
      setMessage("Leave request submitted.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to submit request.");
    }
  };

  const reviewRequest = async (id, action) => {
    setError("");
    setMessage("");
    try {
      if (action === "approve") {
        await api.put(`/leave-requests/${id}/approve`, {});
      } else {
        await api.put(`/leave-requests/${id}/reject`, {});
      }
      await loadRequests();
      await loadBalances();
      setMessage(`Request ${action}d.`);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to review request.");
    }
  };

  const createLeaveType = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.post("/leave-types", {
        ...leaveTypeForm,
        maxDaysPerYear: Number(leaveTypeForm.allocationPerYear || 0),
        allocationPerYear: Number(leaveTypeForm.allocationPerYear || 0),
        allocationPerMonth: Number(leaveTypeForm.allocationPerMonth || 0),
      });
      setLeaveTypeForm({
        name: "",
        allocationPerYear: "",
        allocationPerMonth: "",
        carryForwardAllowed: false,
        isPaid: true,
        requiresDocument: false,
        applicableTo: "all",
        isActive: true,
      });
      await loadBase();
      await loadBalances();
      setMessage("Leave type saved.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save leave type.");
    }
  };

  return (
    <div className="workers-page">
      <div className="workers-header">
        <div>
          <PageHeader title="Leave Management" />
          <p className="workers-subtitle">Requests, balances, and leave policies.</p>
        </div>
      </div>

      {error ? <p className="workers-error">{error}</p> : null}
      {message ? <p className="workers-success">{message}</p> : null}

      <section className="workers-card">
        <div className="workers-actions-cell">
          <button type="button" onClick={() => setTab("requests")}>Requests</button>
          <button type="button" onClick={() => setTab("balances")}>Balances</button>
          <button type="button" onClick={() => setTab("types")}>Leave Types</button>
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
        </div>
      </section>

      {tab === "requests" ? (
        <>
          <section className="workers-card">
            <div className="workers-card__head">
              <h2>Submit Request</h2>
            </div>
            <form className="workers-form" onSubmit={submitLeaveRequest}>
              <div className="workers-grid">
                <div className="workers-field">
                  <label>Employee</label>
                  <select
                    value={form.staffId}
                    onChange={(e) => setForm((p) => ({ ...p, staffId: e.target.value }))}
                    required
                  >
                    <option value="">Select</option>
                    {staff.map((entry) => (
                      <option value={entry._id || entry.id} key={entry._id || entry.id}>
                        {entry.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="workers-field">
                  <label>Leave Type</label>
                  <select
                    value={form.leaveTypeId}
                    onChange={(e) => setForm((p) => ({ ...p, leaveTypeId: e.target.value }))}
                    required
                  >
                    <option value="">Select</option>
                    {leaveTypes.filter((t) => t.isActive !== false).map((entry) => (
                      <option value={entry._id} key={entry._id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="workers-field">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                    required
                  />
                </div>
                <div className="workers-field">
                  <label>End Date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                    required
                  />
                </div>
                <div className="workers-field">
                  <label>Total Days</label>
                  <input
                    type="number"
                    min="0"
                    value={form.totalDays}
                    onChange={(e) => setForm((p) => ({ ...p, totalDays: e.target.value }))}
                  />
                </div>
                <div className="workers-field">
                  <label>Attachment URL</label>
                  <input
                    value={form.attachmentUrl}
                    onChange={(e) => setForm((p) => ({ ...p, attachmentUrl: e.target.value }))}
                  />
                </div>
                <div className="workers-field workers-field--notes">
                  <label>Reason</label>
                  <textarea
                    rows={3}
                    value={form.reason}
                    onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                  />
                </div>
              </div>
              <div className="workers-actions">
                <button type="submit">Submit Request</button>
              </div>
            </form>
          </section>

          <section className="workers-card">
            <div className="workers-card__head">
              <h2>Requests</h2>
              <p>Approve or reject pending requests.</p>
            </div>
            <div className="workers-actions-cell">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="pending">Pending</option>
              </select>
              <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
                <option value="">All Employees</option>
                {staff.map((entry) => (
                  <option key={entry._id || entry.id} value={entry._id || entry.id}>
                    {entry.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="workers-table">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Dates</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((entry) => (
                    <tr key={entry._id}>
                      <td>{entry.employeeName || entry.staffId?.fullName}</td>
                      <td>{entry.leaveTypeName || entry.leaveTypeId?.name}</td>
                      <td>
                        {new Date(entry.startDate).toLocaleDateString()} -{" "}
                        {new Date(entry.endDate).toLocaleDateString()}
                      </td>
                      <td>{entry.totalDays || entry.days}</td>
                      <td>{entry.status}</td>
                      <td className="workers-actions-cell">
                        {entry.status === "PENDING" ? (
                          <>
                            <button type="button" onClick={() => reviewRequest(entry._id, "approve")}>
                              Approve
                            </button>
                            <button type="button" onClick={() => reviewRequest(entry._id, "reject")}>
                              Reject
                            </button>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6}>No requests for selected month.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {tab === "balances" ? (
        <section className="workers-card">
          <div className="workers-card__head">
            <h2>Leave Balances</h2>
          </div>
          <div className="workers-table">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Leave Type</th>
                  <th>Allocated</th>
                  <th>Used</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((entry) => (
                  <tr key={entry._id}>
                    <td>{entry.employeeId?.fullName || "-"}</td>
                    <td>{entry.leaveTypeId?.name || "-"}</td>
                    <td>{entry.allocated}</td>
                    <td>{entry.used}</td>
                    <td>{entry.remaining}</td>
                  </tr>
                ))}
                {balances.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No balances for selected year.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "types" ? (
        <section className="workers-card">
          <div className="workers-card__head">
            <h2>Leave Types</h2>
          </div>
          <form className="workers-form" onSubmit={createLeaveType}>
            <div className="workers-grid">
              <div className="workers-field">
                <label>Name</label>
                <input
                  value={leaveTypeForm.name}
                  onChange={(e) => setLeaveTypeForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="workers-field">
                <label>Allocation / Year</label>
                <input
                  type="number"
                  min="0"
                  value={leaveTypeForm.allocationPerYear}
                  onChange={(e) =>
                    setLeaveTypeForm((p) => ({ ...p, allocationPerYear: e.target.value }))
                  }
                />
              </div>
              <div className="workers-field">
                <label>Allocation / Month</label>
                <input
                  type="number"
                  min="0"
                  value={leaveTypeForm.allocationPerMonth}
                  onChange={(e) =>
                    setLeaveTypeForm((p) => ({ ...p, allocationPerMonth: e.target.value }))
                  }
                />
              </div>
              <div className="workers-field">
                <label>Applicable To</label>
                <select
                  value={leaveTypeForm.applicableTo}
                  onChange={(e) =>
                    setLeaveTypeForm((p) => ({ ...p, applicableTo: e.target.value }))
                  }
                >
                  <option value="all">All</option>
                  <option value="permanent">Permanent</option>
                  <option value="daily-paid">Daily Paid</option>
                </select>
              </div>
              <label className="workers-toggle">
                <input
                  type="checkbox"
                  checked={leaveTypeForm.carryForwardAllowed}
                  onChange={(e) =>
                    setLeaveTypeForm((p) => ({ ...p, carryForwardAllowed: e.target.checked }))
                  }
                />
                Carry Forward Allowed
              </label>
              <label className="workers-toggle">
                <input
                  type="checkbox"
                  checked={leaveTypeForm.isPaid}
                  onChange={(e) =>
                    setLeaveTypeForm((p) => ({ ...p, isPaid: e.target.checked }))
                  }
                />
                Paid Leave
              </label>
              <label className="workers-toggle">
                <input
                  type="checkbox"
                  checked={leaveTypeForm.requiresDocument}
                  onChange={(e) =>
                    setLeaveTypeForm((p) => ({ ...p, requiresDocument: e.target.checked }))
                  }
                />
                Requires Document
              </label>
            </div>
            <div className="workers-actions">
              <button type="submit">Add Leave Type</button>
            </div>
          </form>
          <div className="workers-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Year</th>
                  <th>Month</th>
                  <th>Paid</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {leaveTypes.map((entry) => (
                  <tr key={entry._id}>
                    <td>{entry.name}</td>
                    <td>{entry.allocationPerYear || entry.maxDaysPerYear || 0}</td>
                    <td>{entry.allocationPerMonth || 0}</td>
                    <td>{entry.isPaid ? "Yes" : "No"}</td>
                    <td>{entry.isActive !== false ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default Leave;
