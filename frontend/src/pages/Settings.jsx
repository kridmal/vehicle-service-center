import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Workers.css";

function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    attendanceRules: {
      lateThresholdTime: "09:00",
      halfDayMinimumHours: 4,
      defaultWorkingHours: 8,
    },
    payrollSettings: {
      standardDailyHours: 8,
      otRatePerHour: 0,
    },
    salaryComponents: {
      allowances: [],
      deductions: [],
    },
  });
  const [calendars, setCalendars] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    const [settingsRes, calendarRes] = await Promise.all([
      api.get("/settings"),
      api.get("/work-calendars"),
    ]);
    setSettings(settingsRes.data || settings);
    setCalendars(Array.isArray(calendarRes.data) ? calendarRes.data : []);
  };

  useEffect(() => {
    load().catch((err) =>
      setError(err.response?.data?.message || "Unable to load settings.")
    );
  }, []);

  const save = async () => {
    setError("");
    setMessage("");
    try {
      await api.put("/settings", settings);
      setMessage("Settings saved.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save settings.");
    }
  };

  return (
    <div className="workers-page">
      <div className="workers-header">
        <div>
          <PageHeader title="Settings" />
          <p className="workers-subtitle">Attendance rules and salary components.</p>
        </div>
      </div>

      {error ? <p className="workers-error">{error}</p> : null}
      {message ? <p className="workers-success">{message}</p> : null}

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>Attendance Rules</h2>
        </div>
        <div className="workers-grid">
          <div className="workers-field">
            <label>Late Threshold</label>
            <input
              type="time"
              value={settings.attendanceRules?.lateThresholdTime || "09:00"}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  attendanceRules: {
                    ...prev.attendanceRules,
                    lateThresholdTime: e.target.value,
                  },
                }))
              }
            />
          </div>
          <div className="workers-field">
            <label>Half-Day Minimum Hours</label>
            <input
              type="number"
              min="0"
              value={settings.attendanceRules?.halfDayMinimumHours || 4}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  attendanceRules: {
                    ...prev.attendanceRules,
                    halfDayMinimumHours: Number(e.target.value || 0),
                  },
                }))
              }
            />
          </div>
          <div className="workers-field">
            <label>Default Working Hours</label>
            <input
              type="number"
              min="0"
              value={settings.attendanceRules?.defaultWorkingHours || 8}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  attendanceRules: {
                    ...prev.attendanceRules,
                    defaultWorkingHours: Number(e.target.value || 0),
                  },
                }))
              }
            />
          </div>
        </div>
      </section>

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>Payroll Settings</h2>
        </div>
        <div className="workers-grid">
          <div className="workers-field">
            <label>Standard Daily Hours</label>
            <input
              type="number"
              min="0"
              step="0.25"
              value={settings.payrollSettings?.standardDailyHours ?? 8}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  payrollSettings: {
                    ...prev.payrollSettings,
                    standardDailyHours: Number(e.target.value || 0),
                  },
                }))
              }
            />
          </div>
          <div className="workers-field">
            <label>Default OT Rate Per Hour (LKR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={settings.payrollSettings?.otRatePerHour ?? 0}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  payrollSettings: {
                    ...prev.payrollSettings,
                    otRatePerHour: Number(e.target.value || 0),
                  },
                }))
              }
            />
          </div>
        </div>
      </section>

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>Salary Components</h2>
        </div>
        <div className="workers-actions-cell">
          <button
            type="button"
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                salaryComponents: {
                  ...prev.salaryComponents,
                  allowances: [
                    ...(prev.salaryComponents?.allowances || []),
                    { id: String(Date.now()), name: "", defaultAmount: 0 },
                  ],
                },
              }))
            }
          >
            Add Allowance
          </button>
          <button
            type="button"
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                salaryComponents: {
                  ...prev.salaryComponents,
                  deductions: [
                    ...(prev.salaryComponents?.deductions || []),
                    { id: String(Date.now()), name: "", defaultAmount: 0 },
                  ],
                },
              }))
            }
          >
            Add Deduction
          </button>
        </div>
        <div className="workers-table">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Default Amount</th>
              </tr>
            </thead>
            <tbody>
              {(settings.salaryComponents?.allowances || []).map((entry, index) => (
                <tr key={`a-${index}`}>
                  <td>Allowance</td>
                  <td>
                    <input
                      value={entry.name || ""}
                      onChange={(e) =>
                        setSettings((prev) => {
                          const rows = [...(prev.salaryComponents?.allowances || [])];
                          rows[index] = { ...rows[index], name: e.target.value };
                          return {
                            ...prev,
                            salaryComponents: { ...prev.salaryComponents, allowances: rows },
                          };
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={entry.defaultAmount || 0}
                      onChange={(e) =>
                        setSettings((prev) => {
                          const rows = [...(prev.salaryComponents?.allowances || [])];
                          rows[index] = {
                            ...rows[index],
                            defaultAmount: Number(e.target.value || 0),
                          };
                          return {
                            ...prev,
                            salaryComponents: { ...prev.salaryComponents, allowances: rows },
                          };
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
              {(settings.salaryComponents?.deductions || []).map((entry, index) => (
                <tr key={`d-${index}`}>
                  <td>Deduction</td>
                  <td>
                    <input
                      value={entry.name || ""}
                      onChange={(e) =>
                        setSettings((prev) => {
                          const rows = [...(prev.salaryComponents?.deductions || [])];
                          rows[index] = { ...rows[index], name: e.target.value };
                          return {
                            ...prev,
                            salaryComponents: { ...prev.salaryComponents, deductions: rows },
                          };
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={entry.defaultAmount || 0}
                      onChange={(e) =>
                        setSettings((prev) => {
                          const rows = [...(prev.salaryComponents?.deductions || [])];
                          rows[index] = {
                            ...rows[index],
                            defaultAmount: Number(e.target.value || 0),
                          };
                          return {
                            ...prev,
                            salaryComponents: { ...prev.salaryComponents, deductions: rows },
                          };
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>Work Calendar</h2>
          <p>Configured months and quick access from Attendance.</p>
        </div>
        <div className="workers-table">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Working Days</th>
                <th>Override</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {calendars.map((entry) => (
                <tr key={entry._id}>
                  <td>{entry.month}</td>
                  <td>{entry.effectiveWorkingDays}</td>
                  <td>{entry.workingDaysOverride || 0}</td>
                  <td>
                    <button type="button" onClick={() => navigate("/attendance")}>
                      Open Attendance
                    </button>
                  </td>
                </tr>
              ))}
              {calendars.length === 0 ? (
                <tr>
                  <td colSpan={4}>No configured months.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workers-card">
        <div className="workers-actions">
          <button type="button" onClick={save}>
            Save Settings
          </button>
        </div>
      </section>
    </div>
  );
}

export default Settings;
