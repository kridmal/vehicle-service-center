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

const WEEKDAY_OPTIONS = [
  { code: "MON", label: "Mon" },
  { code: "TUE", label: "Tue" },
  { code: "WED", label: "Wed" },
  { code: "THU", label: "Thu" },
  { code: "FRI", label: "Fri" },
  { code: "SAT", label: "Sat" },
  { code: "SUN", label: "Sun" },
];

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
  const [dailyRecords, setDailyRecords] = useState([]);
  const [dailyCalendarDay, setDailyCalendarDay] = useState(null);
  const [dailyCanMark, setDailyCanMark] = useState(true);
  const [dailyCalendarMissing, setDailyCalendarMissing] = useState(false);
  const [dailyCalendarMessage, setDailyCalendarMessage] = useState("");
  const [reportRows, setReportRows] = useState([]);
  const [reportCutoffDate, setReportCutoffDate] = useState("");
  const [reportFutureMonth, setReportFutureMonth] = useState(false);
  const [reportServerMessage, setReportServerMessage] = useState("");
  const [workCalendarMonth, setWorkCalendarMonth] = useState(toMonthValue(new Date()));
  const [workPreset, setWorkPreset] = useState("SAT_SUN");
  const [customOffDays, setCustomOffDays] = useState(["SAT", "SUN"]);
  const [workCalendarRows, setWorkCalendarRows] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [editCalendarDay, setEditCalendarDay] = useState(null);
  const [calendarDayForm, setCalendarDayForm] = useState({
    isWorkingDay: true,
    offType: "PUBLIC",
    offName: "",
    notes: "",
  });
  const [settings, setSettings] = useState({
    lateThresholdTime: "09:00",
    halfDayMinimumHours: 4,
    defaultWorkingHours: 8,
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
    const { data } = await api.get("/attendance/day", {
      params: { date: selectedDate, department: departmentFilter || undefined },
    });
    setRows(Array.isArray(data?.rows) ? data.rows : []);
    setDailyCalendarDay(data?.calendarDay || null);
    setDailyCanMark(Boolean(data?.canMark));
    setDailyCalendarMissing(Boolean(data?.calendarMissing));
    setDailyCalendarMessage(data?.calendarMessage || "");
  };

  const loadMonthlyGrid = async () => {
    const { data } = await api.get("/attendance", {
      params: {
        month: Number(selectedMonth.slice(5, 7)),
        year: Number(selectedMonth.slice(0, 4)),
      },
    });
    setDailyRecords(Array.isArray(data?.dailyRecords) ? data.dailyRecords : []);
  };

  const loadMonthlyReport = async () => {
    const { data } = await api.get("/attendance/report/month", {
      params: {
        month: Number(selectedMonth.slice(5, 7)),
        year: Number(selectedMonth.slice(0, 4)),
        department: departmentFilter || undefined,
      },
    });
    setReportRows(Array.isArray(data?.records) ? data.records : []);
    setReportCutoffDate(data?.cutoffDate || "");
    setReportFutureMonth(Boolean(data?.isFutureMonth));
    setReportServerMessage(data?.message || "");
  };

  useEffect(() => {
    loadBase().catch((err) => setError(err.response?.data?.message || "Unable to load attendance."));
  }, []);

  useEffect(() => {
    loadDaily().catch(() => {});
  }, [selectedDate, departmentFilter]);

  useEffect(() => {
    loadMonthlyGrid().catch(() => {});
  }, [selectedMonth]);

  useEffect(() => {
    loadMonthlyReport().catch(() => {});
  }, [selectedMonth, departmentFilter]);

  useEffect(() => {
    loadWorkCalendarMonth(workCalendarMonth).catch(() => {});
  }, [workCalendarMonth]);

  const updateRow = (employeeId, key, value) => {
    setRows((prev) =>
      prev.map((row) => (String(row.employeeId) === String(employeeId) ? { ...row, [key]: value } : row))
    );
  };

  const markAllPresent = () => {
    setRows((prev) => prev.map((row) => ({ ...row, status: row.isLocked ? row.status : "present" })));
  };

  const saveDaily = async () => {
    if (!dailyCanMark) return;
    setError("");
    setMessage("");
    try {
      await api.post("/attendance/day", {
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
      await loadMonthlyGrid();
      await loadMonthlyReport();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save attendance.");
    }
  };

  const parseMonthValue = (monthValue) => ({
    year: Number(monthValue.slice(0, 4)),
    month: Number(monthValue.slice(5, 7)),
  });

  const loadWorkCalendarMonth = async (monthValue = workCalendarMonth) => {
    const monthInfo = parseMonthValue(monthValue);
    const { data } = await api.get("/work-calendar", { params: monthInfo });
    setWorkCalendarRows(Array.isArray(data) ? data : []);
  };

  const generateCalendar = async () => {
    const confirmOverwrite = window.confirm(
      "This will reset and overwrite all calendar settings for this month. Continue?"
    );
    if (!confirmOverwrite) return;
    if (workPreset === "CUSTOM" && customOffDays.length === 0) {
      setError("Select at least one custom off day.");
      setMessage("");
      return;
    }

    setError("");
    setMessage("");
    setCalendarLoading(true);
    try {
      const monthInfo = parseMonthValue(workCalendarMonth);
      const payload = {
        ...monthInfo,
        preset: workPreset,
      };
      if (workPreset === "CUSTOM") {
        payload.customOffDays = customOffDays;
      }
      await api.post("/work-calendar/generate", payload);
      setMessage("Work calendar generated.");
      await loadWorkCalendarMonth(workCalendarMonth);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to generate work calendar.");
    } finally {
      setCalendarLoading(false);
    }
  };

  const openEditCalendarDay = (day) => {
    setEditCalendarDay(day);
    setCalendarDayForm({
      isWorkingDay: Boolean(day?.isWorkingDay),
      offType: day?.offType || "PUBLIC",
      offName: day?.offName || "",
      notes: day?.notes || "",
    });
  };

  const saveCalendarDay = async () => {
    if (!editCalendarDay?.date) return;
    setError("");
    setMessage("");
    try {
      await api.put("/work-calendar/day", {
        date: editCalendarDay.date,
        isWorkingDay: calendarDayForm.isWorkingDay,
        offType: calendarDayForm.isWorkingDay ? null : calendarDayForm.offType,
        offName: calendarDayForm.isWorkingDay ? "" : calendarDayForm.offName,
        notes: calendarDayForm.notes,
      });
      setMessage("Calendar day updated.");
      setEditCalendarDay(null);
      await loadWorkCalendarMonth(workCalendarMonth);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to update calendar day.");
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

  const filteredReportRows = useMemo(() => {
    return (reportRows || []).filter((row) =>
      selectedEmployeeId ? String(row.staffId) === selectedEmployeeId : true
    );
  }, [reportRows, selectedEmployeeId]);

  const exportSummary = () => {
    csvDownload(
      `attendance-summary-${selectedMonth}.csv`,
      [
        [
          "Employee",
          "Working Days (Evaluated)",
          "Present",
          "Absent",
          "Leave",
          "Unmarked",
          "LOP Days",
        ],
        ...filteredReportRows.map((r) => [
          r.staffName,
          r.workingDaysEvaluated,
          r.presentCount,
          r.absentCount,
          r.leaveCount,
          r.unmarkedCount,
          r.lopDays,
        ]),
      ]
    );
  };

  const printEmployeeReport = () => {
    window.print();
  };

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
          <button type="button" className="attendance-action" onClick={() => setTab("work-calendar")}>
            Work Calendar
          </button>
        </div>
      </section>

      {tab === "daily" ? (
        <>
          <section className="attendance-card">
            <div className="attendance-card__head">
              <h2>Daily Marking</h2>
              <p>
                {dailyCalendarMissing
                  ? dailyCalendarMessage
                  : dailyCanMark
                  ? "Regular working day."
                  : `Holiday/Off day: ${dailyCalendarDay?.offName || dailyCalendarDay?.offType || "Off Day"}`}
              </p>
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
            {!dailyCanMark ? <p className="attendance-note warning">{dailyCalendarMessage}</p> : null}
          </section>
          <section className="attendance-card">
            <div className="attendance-actions">
              <button
                type="button"
                className="attendance-action--secondary attendance-action"
                onClick={markAllPresent}
                disabled={!dailyCanMark}
              >
                Mark All Present
              </button>
              <button type="button" className="attendance-action" onClick={saveDaily} disabled={!dailyCanMark}>
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
                          disabled={row.isLocked || !dailyCanMark}
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
                          disabled={row.isLocked || !dailyCanMark}
                        />
                      </td>
                      <td>
                        <input
                          className="attendance-input"
                          type="time"
                          value={row.checkOutTime || ""}
                          onChange={(e) => updateRow(row.employeeId, "checkOutTime", e.target.value)}
                          disabled={row.isLocked || !dailyCanMark}
                        />
                      </td>
                      <td>
                        <input
                          className="attendance-input"
                          value={row.notes || ""}
                          onChange={(e) => updateRow(row.employeeId, "notes", e.target.value)}
                          disabled={row.isLocked || !dailyCanMark}
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
                                try {
                                  const currentIndex = STATUS_OPTIONS.indexOf(status);
                                  const nextStatus = STATUS_OPTIONS[(currentIndex + 1) % STATUS_OPTIONS.length];
                                  await api.post("/attendance", {
                                    date,
                                    staffId: employeeId,
                                    status: nextStatus,
                                  });
                                  await loadMonthlyGrid();
                                  await loadMonthlyReport();
                                } catch (err) {
                                  setError(err.response?.data?.message || "Unable to update attendance.");
                                }
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
              <p>Calendar-based monthly summary (evaluated working days only).</p>
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
            {reportCutoffDate ? (
              <p className="attendance-note">Evaluated up to: {reportCutoffDate}</p>
            ) : null}
            {reportServerMessage ? (
              <p className="attendance-note warning">{reportServerMessage}</p>
            ) : null}
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
                    <th>Staff</th>
                    <th>Working Days (Evaluated)</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Leave</th>
                    <th>Unmarked</th>
                    <th>LOP Days</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReportRows.map((row) => (
                    <tr key={row.staffId}>
                      <td>{row.staffName}</td>
                      <td>{row.workingDaysEvaluated}</td>
                      <td>{row.presentCount}</td>
                      <td>{row.absentCount}</td>
                      <td>{row.leaveCount}</td>
                      <td>{row.unmarkedCount}</td>
                      <td>{row.lopDays}</td>
                    </tr>
                  ))}
                  {filteredReportRows.length === 0 ? (
                    <tr><td colSpan={7}>{reportFutureMonth ? "Future month selected." : "No data for selected filters."}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {tab === "work-calendar" ? (
        <section className="attendance-card">
          <div className="attendance-card__head">
            <h2>Work Calendar</h2>
            <p>Generate and maintain company-wide working/off day setup by month.</p>
          </div>
          <div className="attendance-filters">
            <div className="attendance-field">
              <label>Month</label>
              <input
                type="month"
                value={workCalendarMonth}
                onChange={(e) => setWorkCalendarMonth(e.target.value)}
              />
            </div>
            <div className="attendance-field">
              <label>Preset</label>
              <select value={workPreset} onChange={(e) => setWorkPreset(e.target.value)}>
                <option value="SUN_ONLY">Sunday Off</option>
                <option value="SAT_SUN">Saturday + Sunday Off</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
          </div>
          {workPreset === "CUSTOM" ? (
            <div className="attendance-calendar-weekdays">
              {WEEKDAY_OPTIONS.map((entry) => (
                <label key={entry.code} className="attendance-calendar-checkbox">
                  <input
                    type="checkbox"
                    checked={customOffDays.includes(entry.code)}
                    onChange={() => {
                      setCustomOffDays((prev) =>
                        prev.includes(entry.code)
                          ? prev.filter((item) => item !== entry.code)
                          : [...prev, entry.code]
                      );
                    }}
                  />
                  {entry.label}
                </label>
              ))}
            </div>
          ) : null}
          <div className="attendance-actions" style={{ marginTop: "12px" }}>
            <button
              type="button"
              className="attendance-action"
              onClick={generateCalendar}
              disabled={calendarLoading}
            >
              Generate Calendar
            </button>
          </div>

          <div className="attendance-table-wrapper">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Status</th>
                  <th>Off Type</th>
                  <th>Off Name</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {workCalendarRows.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{DAY_LABELS[row.dayOfWeek] || "-"}</td>
                    <td>
                      <span className={`attendance-pill${row.isWorkingDay ? " light" : ""}`}>
                        {row.isWorkingDay ? "Working" : "Off"}
                      </span>
                    </td>
                    <td>{row.offType || "-"}</td>
                    <td>{row.offName || "-"}</td>
                    <td>{row.notes || "-"}</td>
                    <td>
                      <button
                        type="button"
                        className="attendance-action attendance-action--secondary"
                        onClick={() => openEditCalendarDay(row)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {workCalendarRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No calendar generated for selected month.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {editCalendarDay ? (
        <section className="attendance-modal-backdrop">
          <div className="attendance-modal">
            <div className="attendance-card__head">
              <h2>Edit Calendar Day</h2>
              <p>{editCalendarDay.date}</p>
            </div>
            <div className="attendance-filters">
              <div className="attendance-field">
                <label>Status</label>
                <select
                  value={calendarDayForm.isWorkingDay ? "working" : "off"}
                  onChange={(e) =>
                    setCalendarDayForm((prev) => ({
                      ...prev,
                      isWorkingDay: e.target.value === "working",
                    }))
                  }
                >
                  <option value="working">Working Day</option>
                  <option value="off">Off Day</option>
                </select>
              </div>
              {!calendarDayForm.isWorkingDay ? (
                <>
                  <div className="attendance-field">
                    <label>Off Type</label>
                    <select
                      value={calendarDayForm.offType}
                      onChange={(e) =>
                        setCalendarDayForm((prev) => ({ ...prev, offType: e.target.value }))
                      }
                    >
                      <option value="PUBLIC">PUBLIC</option>
                      <option value="CUSTOM">CUSTOM</option>
                      <option value="WEEKEND">WEEKEND</option>
                    </select>
                  </div>
                  <div className="attendance-field">
                    <label>Off Name</label>
                    <input
                      value={calendarDayForm.offName}
                      onChange={(e) =>
                        setCalendarDayForm((prev) => ({ ...prev, offName: e.target.value }))
                      }
                      placeholder="Holiday or off-day name"
                    />
                  </div>
                </>
              ) : null}
              <div className="attendance-field">
                <label>Notes</label>
                <input
                  value={calendarDayForm.notes}
                  onChange={(e) =>
                    setCalendarDayForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Optional notes"
                />
              </div>
            </div>
            <div className="attendance-actions" style={{ marginTop: "12px" }}>
              <button
                type="button"
                className="attendance-action attendance-action--secondary"
                onClick={() => setEditCalendarDay(null)}
              >
                Cancel
              </button>
              <button type="button" className="attendance-action" onClick={saveCalendarDay}>
                Save
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default Attendance;
