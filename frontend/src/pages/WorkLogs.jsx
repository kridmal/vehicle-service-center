import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./WorkLogs.css";

const todayKey = () => new Date().toISOString().slice(0, 10);
const monthStartKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

const formatHours = (value) => Number(value || 0).toFixed(2);

function WorkLogs() {
  const [rows, setRows] = useState([]);
  const [staffRows, setStaffRows] = useState([]);
  const [filters, setFilters] = useState({
    from: monthStartKey(),
    to: todayKey(),
    staffId: "",
    q: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState({ count: 0, totalLaborHours: 0 });

  const load = async () => {
    const params = {};
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.staffId) params.staffId = filters.staffId;
    if (filters.q.trim()) params.q = filters.q.trim();
    params.limit = 500;

    const [workLogRes, staffRes] = await Promise.all([
      api.get("/worklogs", { params }),
      api.get("/staff", { params: { active: true } }),
    ]);
    const payload = workLogRes.data || {};
    setRows(Array.isArray(payload.rows) ? payload.rows : []);
    setMeta({
      count: Number(payload.count || 0),
      totalLaborHours: Number(payload.totalLaborHours || 0),
    });
    setStaffRows(Array.isArray(staffRes.data) ? staffRes.data : []);
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    load()
      .catch((err) =>
        setError(err.response?.data?.message || "Unable to load work logs.")
      )
      .finally(() => setLoading(false));
  }, [filters.from, filters.to, filters.staffId, filters.q]);

  const groupedDaily = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const key = `${row.date}__${row.staffId}`;
      const current = map.get(key) || {
        key,
        date: row.date,
        staffName: row.staffName || "-",
        employeeNo: row.employeeNo || "-",
        hours: 0,
        taskCount: 0,
      };
      current.hours += Number(row.laborHours || 0);
      current.taskCount += 1;
      map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.date === b.date) return a.staffName.localeCompare(b.staffName);
      return a.date < b.date ? 1 : -1;
    });
  }, [rows]);

  return (
    <div className="worklogs-page">
      <div className="worklogs-header">
        <PageHeader title="Work Logs" />
        <p className="worklogs-subtitle">
          Daily labor-hour details by employee from completed Job Cards.
        </p>
      </div>

      {error ? <p className="worklogs-error">{error}</p> : null}

      <section className="worklogs-card">
        <div className="worklogs-grid">
          <div className="worklogs-field">
            <label>From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, from: event.target.value }))
              }
            />
          </div>
          <div className="worklogs-field">
            <label>To</label>
            <input
              type="date"
              value={filters.to}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, to: event.target.value }))
              }
            />
          </div>
          <div className="worklogs-field">
            <label>Staff</label>
            <select
              value={filters.staffId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, staffId: event.target.value }))
              }
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
          <div className="worklogs-field">
            <label>Search</label>
            <input
              type="search"
              value={filters.q}
              placeholder="Emp no, name, job card, task"
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, q: event.target.value }))
              }
            />
          </div>
        </div>
      </section>

      <section className="worklogs-card">
        <div className="worklogs-summary">
          <div>
            <span>Total Rows</span>
            <strong>{meta.count}</strong>
          </div>
          <div>
            <span>Total Labor Hours</span>
            <strong>{formatHours(meta.totalLaborHours)}</strong>
          </div>
          <div>
            <span>Daily Staff Buckets</span>
            <strong>{groupedDaily.length}</strong>
          </div>
        </div>
      </section>

      <section className="worklogs-card">
        <div className="worklogs-card__head">
          <h2>Daily Summary (Staff x Date)</h2>
          <p>{loading ? "Loading..." : `${groupedDaily.length} entries`}</p>
        </div>
        {!groupedDaily.length ? (
          <p className="worklogs-muted">No daily work logs found for selected filters.</p>
        ) : (
          <div className="worklogs-table-wrap">
            <table className="worklogs-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee No</th>
                  <th>Staff</th>
                  <th>Tasks</th>
                  <th>Labor Hours</th>
                </tr>
              </thead>
              <tbody>
                {groupedDaily.map((row) => (
                  <tr key={row.key}>
                    <td data-label="Date">{row.date}</td>
                    <td data-label="Employee No">{row.employeeNo}</td>
                    <td data-label="Staff">{row.staffName}</td>
                    <td data-label="Tasks">{row.taskCount}</td>
                    <td data-label="Labor Hours">{formatHours(row.hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="worklogs-card">
        <div className="worklogs-card__head">
          <h2>Task-Level Logs</h2>
          <p>{loading ? "Loading..." : `${rows.length} entries`}</p>
        </div>
        {!rows.length ? (
          <p className="worklogs-muted">No task logs found for selected filters.</p>
        ) : (
          <div className="worklogs-table-wrap">
            <table className="worklogs-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee No</th>
                  <th>Staff</th>
                  <th>Job Card</th>
                  <th>Service</th>
                  <th>Task</th>
                  <th>Hours</th>
                  <th>Billable</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id}>
                    <td data-label="Date">{row.date}</td>
                    <td data-label="Employee No">{row.employeeNo || "-"}</td>
                    <td data-label="Staff">{row.staffName || "-"}</td>
                    <td data-label="Job Card">{row.jobCardNo || "-"}</td>
                    <td data-label="Service">{row.serviceTypeName || "-"}</td>
                    <td data-label="Task">{row.taskName || "-"}</td>
                    <td data-label="Hours">{formatHours(row.laborHours)}</td>
                    <td data-label="Billable">{row.billable ? "Yes" : "No"}</td>
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

export default WorkLogs;

