import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Attendance.css";

const STATUS_OPTIONS = ["present", "absent", "half-day", "late", "on-leave"];
const STATUS_COLOR = {
  present: "#16a34a",
  absent: "#dc2626",
  "half-day": "#eab308",
  "on-leave": "#2563eb",
  late: "#f97316",
  off: "#94a3b8",
};

const toMonthValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const toDateValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const monthDays = (monthValue) => {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(year, month, 0).getDate();
};

const csvDownload = (filename, rows) => {
  const csv = rows.map((row) => row.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

function Attendance() {
  const [tab, setTab] = useState("daily");
  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDate, setSelectedDate] = useState(toDateValue(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(toMonthValue(new Date()));
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [rows, setRows] = useState([]);
  const [monthRows, setMonthRows] = useState([]);
  const [dailyRecords, setDailyRecords] = useState([]);
  const [calendarConfig, setCalendarConfig] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [settings, setSettings] = useState({
    lateThresholdTime: "09:00",
    halfDayMinimumHours: 4,
    defaultWorkingHours: 8,
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedMonthForDate = selectedDate.slice(0, 7);

  const loadBase = async () => {
    const [staffRes, depRes, settingsRes] = await Promise.all([
      api.get("/staff", { params: { status: "active" } }),
      api.get("/organization/departments"),
      api.get("/settings"),
    ]);
    setStaff(Array.isArray(staffRes.data) ? staffRes.data : []);
    setDepartments(Array.isArray(depRes.data) ? depRes.data : []);
    setSettings(settingsRes.data?.attendanceRules || settings);
  };

  const loadDaily = async () => {
    const { data } = await api.get("/attendance", {
      params: { date: selectedDate, department: departmentFilter || undefined },
    });
    setRows(Array.isArray(data?.rows) ? data.rows : []);
  };

  const loadMonthly = async () => {
    const { data } = await api.get("/attendance", {
      params: {
        month: Number(selectedMonth.slice(5, 7)),
        year: Number(selectedMonth.slice(0, 4)),
      },
    });
    setMonthRows(Array.isArray(data?.records) ? data.records : []);
    setDailyRecords(Array.isArray(data?.dailyRecords) ? data.dailyRecords : []);
  };

  const loadCalendarConfig = async (month = selectedMonthForDate) => {
    const { data } = await api.get(`/work-calendars/${month}`);
    setCalendarConfig(data);
  };

  useEffect(() => {
    loadBase().catch((err) => setError(err.response?.data?.message || "Unable to load attendance."));
  }, []);

  useEffect(() => {
    loadDaily().catch(() => {});
    loadCalendarConfig().catch(() => {});
  }, [selectedDate, departmentFilter]);

  useEffect(() => {
    loadMonthly().catch(() => {});
  }, [selectedMonth]);

  const updateRow = (employeeId, key, value) => {
    setRows((prev) =>
      prev.map((row) => (String(row.employeeId) === String(employeeId) ? { ...row, [key]: value } : row))
    );
  };

  const markAllPresent = () => {
    setRows((prev) => prev.map((row) => ({ ...row, status: row.isLocked ? row.status : "present" })));
  };

  const saveDaily = async () => {
    setError("");
    setMessage("");
    try {
      await api.post("/attendance", {
        date: selectedDate,
        entries: rows.map((row) => ({
          staffId: row.employeeId,
          status: row.status,
          checkInTime: row.checkInTime,
          checkOutTime: row.checkOutTime,
          notes: row.notes,
        })),
      });
      setMessage("Attendance saved.");
      await loadDaily();
      await loadMonthly();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save attendance.");
    }
  };

  const openCalendarModal = async () => {
    await loadCalendarConfig(selectedMonthForDate);
    setCalendarOpen(true);
  };

  const saveCalendar = async () => {
    if (!calendarConfig?.month) return;
    setError("");
    setMessage("");
    try {
      await api.put(`/work-calendars/${calendarConfig.month}`, calendarConfig);
      setMessage("Work Calendar saved.");
      setCalendarOpen(false);
      await loadCalendarConfig(selectedMonthForDate);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save calendar.");
    }
  };

  const dayColumns = useMemo(() => Array.from({ length: monthDays(selectedMonth) }, (_, i) => i + 1), [selectedMonth]);
  const dailyMap = useMemo(() => {
    const map = new Map();
    dailyRecords.forEach((entry) => {
      map.set(`${entry.staffId}-${entry.date}`, entry);
    });
    return map;
  }, [dailyRecords]);

  const employeesForMonth = useMemo(() => {
    return staff.filter((entry) => {
      if (!departmentFilter) return true;
      return String(entry.departmentId || "") === String(departmentFilter);
    });
  }, [staff, departmentFilter]);

  const reportRows = useMemo(() => {
    return monthRows
      .filter((row) => (selectedEmployeeId ? String(row.staffId) === selectedEmployeeId : true))
      .map((row) => {
        const netPayPreview = Number(row.netSalary || 0);
        return {
          employeeName: row.staffSnapshot?.name || row.employeeName || "-",
          present: row.presentDays || 0,
          absent: row.absentDays || 0,
          leave: row.approvedLeaveDays || 0,
          late: row.lateDays || 0,
          half: row.halfDays || 0,
          lop: row.lopDays || 0,
          netPayPreview,
        };
      });
  }, [monthRows, selectedEmployeeId]);

  const exportSummary = () => {
    csvDownload(
      `attendance-summary-${selectedMonth}.csv`,
      [
        ["Employee", "Present", "Absent", "Leave", "Late", "Half Day", "LOP", "Net Pay Preview"],
        ...reportRows.map((r) => [
          r.employeeName,
          r.present,
          r.absent,
          r.leave,
          r.late,
          r.half,
          r.lop,
          r.netPayPreview,
        ]),
      ]
    );
  };

  const printEmployeeReport = () => {
    window.print();
  };

  const isHolidayOrOff = useMemo(() => {
    if (!calendarConfig) return false;
    const dayOfWeek = new Date(selectedDate).getDay();
    const dateStr = selectedDate;
    if ((calendarConfig.holidayDates || []).includes(dateStr)) return true;
    if ((calendarConfig.customOffDates || []).includes(dateStr)) return true;
    if (calendarConfig.weeklyOffPattern === "sunday") return dayOfWeek === 0;
    if (calendarConfig.weeklyOffPattern === "saturday-sunday") return dayOfWeek === 0 || dayOfWeek === 6;
    if (calendarConfig.weeklyOffPattern === "custom") {
      const map = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      return (calendarConfig.customWeeklyOffDays || []).includes(map[dayOfWeek]);
    }
    return false;
  }, [calendarConfig, selectedDate]);

  return (
    <div className="attendance-page">
      <div className="attendance-header">
        <div>
          <PageHeader title="Attendance" />
          <p className="attendance-subtitle">Daily marking, calendar view, and monthly reports.</p>
        </div>
      </div>
      {error ? <p className="attendance-error">{error}</p> : null}
      {message ? <p className="attendance-success">{message}</p> : null}

      <section className="attendance-card">
        <div className="attendance-actions">
          <button type="button" className="attendance-action--secondary attendance-action" onClick={() => setTab("daily")}>
            Daily
          </button>
          <button type="button" className="attendance-action--secondary attendance-action" onClick={() => setTab("calendar")}>
            Calendar View
          </button>
          <button type="button" className="attendance-action--secondary attendance-action" onClick={() => setTab("reports")}>
            Reports
          </button>
          <button type="button" className="attendance-action" onClick={openCalendarModal}>
            Work Calendar
          </button>
        </div>
      </section>

      {tab === "daily" ? (
        <>
          <section className="attendance-card">
            <div className="attendance-card__head">
              <h2>Daily Marking</h2>
              <p>{isHolidayOrOff ? "Selected date is holiday/off day." : "Regular working day."}</p>
            </div>
            <div className="attendance-filters">
              <div className="attendance-field">
                <label>Date</label>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              </div>
              <div className="attendance-field">
                <label>Department</label>
                <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                  <option value="">All</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>
          <section className="attendance-card">
            <div className="attendance-actions">
              <button type="button" className="attendance-action--secondary attendance-action" onClick={markAllPresent}>
                Mark All Present
              </button>
              <button type="button" className="attendance-action" onClick={saveDaily}>
                Save
              </button>
            </div>
            <div className="attendance-table-wrapper">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Role</th>
                    <th>Dept</th>
                    <th>Status</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                    <th>Notes</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.employeeId}>
                      <td>{row.employeeName}</td>
                      <td>{row.role || "-"}</td>
                      <td>{departments.find((d) => String(d._id) === String(row.department))?.name || "-"}</td>
                      <td>
                        <select
                          className="attendance-input"
                          value={row.status}
                          onChange={(e) => updateRow(row.employeeId, "status", e.target.value)}
                          disabled={row.isLocked}
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="attendance-input"
                          type="time"
                          value={row.checkInTime || ""}
                          onChange={(e) => updateRow(row.employeeId, "checkInTime", e.target.value)}
                          disabled={row.isLocked}
                        />
                      </td>
                      <td>
                        <input
                          className="attendance-input"
                          type="time"
                          value={row.checkOutTime || ""}
                          onChange={(e) => updateRow(row.employeeId, "checkOutTime", e.target.value)}
                          disabled={row.isLocked}
                        />
                      </td>
                      <td>
                        <input
                          className="attendance-input"
                          value={row.notes || ""}
                          onChange={(e) => updateRow(row.employeeId, "notes", e.target.value)}
                          disabled={row.isLocked}
                        />
                      </td>
                      <td>{row.isLocked ? "Locked - Payroll approved" : "Editable"}</td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr><td colSpan={8}>No employees.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {tab === "calendar" ? (
        <section className="attendance-card">
          <div className="attendance-card__head">
            <h2>Attendance Calendar Grid</h2>
          </div>
          <div className="attendance-filters">
            <div className="attendance-field">
              <label>Month</label>
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            </div>
          </div>
          <div className="attendance-table-wrapper">
            <table className="attendance-table" style={{ minWidth: "1700px" }}>
              <thead>
                <tr>
                  <th>Employee</th>
                  {dayColumns.map((day) => (
                    <th key={day}>{day}</th>
                  ))}
                  <th>P</th>
                  <th>A</th>
                  <th>H</th>
                  <th>L</th>
                  <th>OL</th>
                </tr>
              </thead>
              <tbody>
                {employeesForMonth.map((employee) => {
                  const employeeId = String(employee._id || employee.id);
                  const stats = { present: 0, absent: 0, "half-day": 0, late: 0, "on-leave": 0 };
                  return (
                    <tr key={employeeId}>
                      <td>{employee.fullName}</td>
                      {dayColumns.map((day) => {
                        const date = `${selectedMonth}-${String(day).padStart(2, "0")}`;
                        const record = dailyMap.get(`${employeeId}-${date}`);
                        const status = record?.status || "absent";
                        stats[status] += 1;
                        return (
                          <td key={date}>
                            <button
                              type="button"
                              style={{
                                border: "none",
                                borderRadius: "6px",
                                width: "26px",
                                height: "26px",
                                color: "#fff",
                                background: STATUS_COLOR[status] || "#64748b",
                                cursor: record?.isLocked ? "not-allowed" : "pointer",
                              }}
                              title={status}
                              disabled={record?.isLocked}
                              onClick={async () => {
                                const currentIndex = STATUS_OPTIONS.indexOf(status);
                                const nextStatus = STATUS_OPTIONS[(currentIndex + 1) % STATUS_OPTIONS.length];
                                await api.post("/attendance", {
                                  date,
                                  staffId: employeeId,
                                  status: nextStatus,
                                });
                                await loadMonthly();
                              }}
                            >
                              {status[0].toUpperCase()}
                            </button>
                          </td>
                        );
                      })}
                      <td>{stats.present}</td>
                      <td>{stats.absent}</td>
                      <td>{stats["half-day"]}</td>
                      <td>{stats.late}</td>
                      <td>{stats["on-leave"]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "reports" ? (
        <>
          <section className="attendance-card">
            <div className="attendance-card__head">
              <h2>Attendance Reports</h2>
              <p>Employee-wise and summary views with export.</p>
            </div>
            <div className="attendance-filters">
              <div className="attendance-field">
                <label>Month</label>
                <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
              </div>
              <div className="attendance-field">
                <label>Employee</label>
                <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
                  <option value="">All</option>
                  {staff.map((entry) => (
                    <option key={entry._id || entry.id} value={entry._id || entry.id}>{entry.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="attendance-field">
                <label>Department</label>
                <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                  <option value="">All</option>
                  {departments.map((entry) => (
                    <option key={entry._id} value={entry._id}>{entry.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="attendance-actions" style={{ marginTop: "12px" }}>
              <button type="button" className="attendance-action--secondary attendance-action" onClick={printEmployeeReport}>
                Export Employee PDF
              </button>
              <button type="button" className="attendance-action" onClick={exportSummary}>
                Export Summary CSV
              </button>
            </div>
          </section>
          <section className="attendance-card">
            <div className="attendance-table-wrapper">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Leave</th>
                    <th>Late</th>
                    <th>Half Day</th>
                    <th>LOP</th>
                    <th>Net Pay Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row, index) => (
                    <tr key={`${row.employeeName}-${index}`}>
                      <td>{row.employeeName}</td>
                      <td>{row.present}</td>
                      <td>{row.absent}</td>
                      <td>{row.leave}</td>
                      <td>{row.late}</td>
                      <td>{row.half}</td>
                      <td>{row.lop}</td>
                      <td>{Number(row.netPayPreview || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {reportRows.length === 0 ? (
                    <tr><td colSpan={8}>No data for selected filters.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {calendarOpen && calendarConfig ? (
        <section className="attendance-card">
          <div className="attendance-card__head">
            <h2>Work Calendar - {calendarConfig.month}</h2>
          </div>
          <div className="attendance-filters">
            <div className="attendance-field">
              <label>Month</label>
              <input type="month" value={calendarConfig.month} onChange={(e) => setCalendarConfig((p) => ({ ...p, month: e.target.value }))} />
            </div>
            <div className="attendance-field">
              <label>Total Days</label>
              <input type="number" min="0" value={calendarConfig.totalDays || 0} onChange={(e) => setCalendarConfig((p) => ({ ...p, totalDays: Number(e.target.value || 0) }))} />
            </div>
            <div className="attendance-field">
              <label>Weekly Off Pattern</label>
              <select value={calendarConfig.weeklyOffPattern || "sunday"} onChange={(e) => setCalendarConfig((p) => ({ ...p, weeklyOffPattern: e.target.value }))}>
                <option value="none">None</option>
                <option value="sunday">Sunday</option>
                <option value="saturday-sunday">Saturday-Sunday</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="attendance-field">
              <label>Calculated Working Days</label>
              <input value={calendarConfig.calculatedWorkingDays || 0} readOnly />
            </div>
            <div className="attendance-field">
              <label>Working Days Override</label>
              <input type="number" min="0" value={calendarConfig.workingDaysOverride || 0} onChange={(e) => setCalendarConfig((p) => ({ ...p, workingDaysOverride: Number(e.target.value || 0) }))} />
            </div>
            <div className="attendance-field">
              <label>Effective Working Days</label>
              <input value={calendarConfig.effectiveWorkingDays || 0} readOnly />
            </div>
            <div className="attendance-field">
              <label>Custom Weekly Off Days (comma)</label>
              <input
                value={(calendarConfig.customWeeklyOffDays || []).join(",")}
                onChange={(e) =>
                  setCalendarConfig((p) => ({
                    ...p,
                    customWeeklyOffDays: e.target.value.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean),
                  }))
                }
              />
            </div>
            <div className="attendance-field">
              <label>Custom Off Dates (comma YYYY-MM-DD)</label>
              <input
                value={(calendarConfig.customOffDates || []).join(",")}
                onChange={(e) =>
                  setCalendarConfig((p) => ({
                    ...p,
                    customOffDates: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                  }))
                }
              />
            </div>
            <div className="attendance-field">
              <label>Holiday Dates (comma YYYY-MM-DD)</label>
              <input
                value={(calendarConfig.holidayDates || []).join(",")}
                onChange={(e) =>
                  setCalendarConfig((p) => ({
                    ...p,
                    holidayDates: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                  }))
                }
              />
            </div>
          </div>
          <div className="attendance-actions" style={{ marginTop: "12px" }}>
            <button type="button" className="attendance-action--secondary attendance-action" onClick={() => setCalendarOpen(false)}>
              Close
            </button>
            <button type="button" className="attendance-action" onClick={saveCalendar}>
              Save Calendar
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default Attendance;
