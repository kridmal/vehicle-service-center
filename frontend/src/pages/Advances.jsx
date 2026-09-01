import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Advances.css";

const ADVANCE_STATUS_OPTIONS = [
  "",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "PAID_OUT",
  "SETTLED",
];

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDateTime = (value) => {
  
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
};

const todayIso = () => new Date().toISOString().slice(0, 10);

function Advances() {
  const [rows, setRows] = useState([]);
  const [staffRows, setStaffRows] = useState([]);
  const [filterStaffId, setFilterStaffId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [form, setForm] = useState({
    staffId: "",
    requestDate: todayIso(),
    amount: "",
    reason: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    const params = {};
    if (filterStaffId) params.staffId = filterStaffId;
    if (filterStatus) params.status = filterStatus;
    const [advRes, staffRes] = await Promise.all([
      api.get("/advances", { params }),
      api.get("/staff", { params: { active: true } }),
    ]);
    setRows(Array.isArray(advRes.data) ? advRes.data : []);
    setStaffRows(Array.isArray(staffRes.data) ? staffRes.data : []);
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    load()
      .catch((err) => setError(err.response?.data?.message || "Unable to load advances."))
      .finally(() => setLoading(false));
  }, [filterStaffId, filterStatus]);

  const staffMap = useMemo(
    () =>
      new Map(
        staffRows.map((row) => [
          String(row._id || row.id),
          {
            employeeNo: row.employeeNo || row.employeeId || "",
            name: row.name || row.fullName || "",
          },
        ])
      ),
    [staffRows]
  );

  const resolveStaffLabel = (row) => {
    const staff = row?.staffId;
    if (staff && typeof staff === "object") {
      const employeeNo = String(staff.employeeId || "").trim();
      const name = String(staff.fullName || "").trim();
      return [employeeNo, name].filter(Boolean).join(" - ") || "-";
    }
    const fallback = staffMap.get(String(staff || ""));
    if (!fallback) return "-";
    return [fallback.employeeNo, fallback.name].filter(Boolean).join(" - ") || "-";
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.post("/advances", {
        staffId: form.staffId,
        requestDate: form.requestDate,
        amount: Number(form.amount || 0),
        reason: form.reason.trim(),
        notes: form.notes.trim(),
      });
      setForm({
        staffId: "",
        requestDate: todayIso(),
        amount: "",
        reason: "",
        notes: "",
      });
      setMessage("Advance request created.");
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to create advance request.");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (id, action, successMessage) => {
    if (!id) return;
    setError("");
    setMessage("");
    try {
      await api.patch(`/advances/${id}/${action}`);
      setMessage(successMessage);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to update advance.");
    }
  };

  return (
    <div className="advances-page">
      <div className="advances-header">
        <PageHeader title="Advances" />
        <p className="advances-subtitle">Request, approve, payout, and track outstanding balances.</p>
      </div>

      {error ? <p className="advances-error">{error}</p> : null}
      {message ? <p className="advances-success">{message}</p> : null}

      <section className="advances-card">
        <div className="advances-card__head">
          <h2>Create Advance Request</h2>
        </div>
        <form className="advances-form" onSubmit={handleCreate}>
          <div className="advances-grid">
            <div className="advances-field">
              <label>Staff</label>
              <select
                value={form.staffId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, staffId: event.target.value }))
                }
                required
              >
                <option value="">Select staff</option>
                {staffRows.map((row) => (
                  <option key={row._id || row.id} value={row._id || row.id}>
                    {`${row.employeeNo || row.employeeId || "-"} - ${
                      row.name || row.fullName || "Unknown"
                    }`}
                  </option>
                ))}
              </select>
            </div>
            <div className="advances-field">
              <label>Request Date</label>
              <input
                type="date"
                value={form.requestDate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, requestDate: event.target.value }))
                }
                required
              />
            </div>
            <div className="advances-field">
              <label>Amount (LKR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, amount: event.target.value }))
                }
                required
              />
            </div>
            <div className="advances-field advances-field--wide">
              <label>Reason</label>
              <input
                value={form.reason}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, reason: event.target.value }))
                }
                placeholder="Reason for advance request"
              />
            </div>
            <div className="advances-field advances-field--wide">
              <label>Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Optional notes"
              />
            </div>
          </div>
          <div className="advances-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Create Request"}
            </button>
          </div>
        </form>
      </section>

      <section className="advances-card">
        <div className="advances-card__head">
          <h2>Advance Requests</h2>
          <p>{loading ? "Loading..." : `${rows.length} records`}</p>
        </div>
        <div className="advances-grid advances-grid--filters">
          <div className="advances-field">
            <label>Staff Filter</label>
            <select
              value={filterStaffId}
              onChange={(event) => setFilterStaffId(event.target.value)}
            >
              <option value="">All Staff</option>
              {staffRows.map((row) => (
                <option key={row._id || row.id} value={row._id || row.id}>
                  {`${row.employeeNo || row.employeeId || "-"} - ${
                    row.name || row.fullName || "Unknown"
                  }`}
                </option>
              ))}
            </select>
          </div>
          <div className="advances-field">
            <label>Status Filter</label>
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
            >
              {ADVANCE_STATUS_OPTIONS.map((option) => (
                <option key={option || "ALL"} value={option}>
                  {option || "ALL"}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!rows.length ? (
          <p className="advances-muted">No advance records found.</p>
        ) : (
          <div className="advances-table-wrap">
            <table className="advances-table">
              <thead>
                <tr>
                  <th>Request Date</th>
                  <th>Staff</th>
                  <th>Amount</th>
                  <th>Outstanding</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Approved</th>
                  <th>Paid Out</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id}>
                    <td data-label="Request Date">{formatDateTime(row.requestDate)}</td>
                    <td data-label="Staff">{resolveStaffLabel(row)}</td>
                    <td data-label="Amount">{formatMoney(row.amount)}</td>
                    <td data-label="Outstanding">{formatMoney(row.outstandingAmount)}</td>
                    <td data-label="Status">{row.status}</td>
                    <td data-label="Reason">{row.reason || "-"}</td>
                    <td data-label="Approved">{formatDateTime(row.approvedAt)}</td>
                    <td data-label="Paid Out">{formatDateTime(row.paidOutAt)}</td>
                    <td data-label="Actions">
                      <div className="advances-row-actions">
                        {row.status === "PENDING" ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                runAction(row._id, "approve", "Advance approved.")
                              }
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="advances-btn-secondary"
                              onClick={() =>
                                runAction(row._id, "reject", "Advance rejected.")
                              }
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
                        {row.status === "APPROVED" ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                runAction(row._id, "payout", "Advance paid out.")
                              }
                            >
                              Mark Paid Out
                            </button>
                            <button
                              type="button"
                              className="advances-btn-secondary"
                              onClick={() =>
                                runAction(row._id, "reject", "Advance rejected.")
                              }
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
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

export default Advances;
