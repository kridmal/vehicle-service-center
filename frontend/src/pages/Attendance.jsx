import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Attendance.css";

const DEFAULT_WORKING_DAYS = 26;

const toMonthValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const parseMonthValue = (value) => {
  if (!value) return null;
  const [year, month] = value.split("-").map((part) => Number(part));
  if (!year || !month) return null;
  return { year, month };
};

const hasBaseSalary = (salaryType) =>
  ["FIXED", "PER_DAY", "HYBRID"].includes(
    String(salaryType || "").toUpperCase()
  );

const formatSalaryType = (value) =>
  String(value || "-").replaceAll("_", " ");

function Attendance() {
  const [staff, setStaff] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [lockedStaffIds, setLockedStaffIds] = useState(new Set());
  const [selectedMonth, setSelectedMonth] = useState(() =>
    toMonthValue(new Date())
  );
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [workingInputs, setWorkingInputs] = useState({});
  const [presentInputs, setPresentInputs] = useState({});
  const [halfInputs, setHalfInputs] = useState({});
  const [leaveInputs, setLeaveInputs] = useState({});
  const [editingStaffId, setEditingStaffId] = useState("");
  const [savingStaffId, setSavingStaffId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const loadStaff = async () => {
      setError("");
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
            "Unable to load staff list. Please try again."
        );
      }
    };
    loadStaff();
  }, [navigate]);

  useEffect(() => {
    const loadAttendance = async () => {
      const monthInfo = parseMonthValue(selectedMonth);
      if (!monthInfo) return;
      setError("");
      setMessage("");
      try {
        const params = {
          month: monthInfo.month,
          year: monthInfo.year,
        };
        if (selectedStaffId) {
          params.staffId = selectedStaffId;
        }
        const { data } = await api.get("/attendance", { params });
        const records = Array.isArray(data?.records) ? data.records : [];
        setAttendanceRecords(records);
        const locked = new Set(
          Array.isArray(data?.lockedStaffIds) ? data.lockedStaffIds : []
        );
        setLockedStaffIds(locked);
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
            "Unable to load attendance. Please try again."
        );
      }
    };
    loadAttendance();
  }, [navigate, selectedMonth, selectedStaffId]);

  const activeStaff = useMemo(
    () => staff.filter((member) => member.active !== false),
    [staff]
  );

  const filteredStaff = useMemo(() => {
    if (!selectedStaffId) return activeStaff;
    return activeStaff.filter(
      (member) => String(member._id || member.id) === selectedStaffId
    );
  }, [activeStaff, selectedStaffId]);

  const attendanceMap = useMemo(() => {
    return attendanceRecords.reduce((acc, record) => {
      acc[String(record.staffId)] = record;
      return acc;
    }, {});
  }, [attendanceRecords]);

  useEffect(() => {
    const nextWorkingInputs = {};
    const nextPresentInputs = {};
    const nextHalfInputs = {};
    const nextLeaveInputs = {};
    filteredStaff.forEach((member) => {
      const staffId = String(member._id || member.id);
      const record = attendanceMap[staffId];
      if (!hasBaseSalary(member.salaryType)) {
        nextWorkingInputs[staffId] = "";
        nextPresentInputs[staffId] = "";
        nextHalfInputs[staffId] = "";
        nextLeaveInputs[staffId] = "";
        return;
      }
      if (record) {
        nextWorkingInputs[staffId] = String(
          record.workingDays ?? DEFAULT_WORKING_DAYS
        );
        nextPresentInputs[staffId] = String(record.presentDays ?? "");
        nextHalfInputs[staffId] = String(record.halfDays ?? "");
        nextLeaveInputs[staffId] = String(record.approvedLeaveDays ?? "");
        return;
      }
      nextWorkingInputs[staffId] = String(DEFAULT_WORKING_DAYS);
      nextPresentInputs[staffId] = "";
      nextHalfInputs[staffId] = "";
      nextLeaveInputs[staffId] = "";
    });
    setWorkingInputs(nextWorkingInputs);
    setPresentInputs(nextPresentInputs);
    setHalfInputs(nextHalfInputs);
    setLeaveInputs(nextLeaveInputs);
    setEditingStaffId("");
  }, [filteredStaff, attendanceMap]);

  const clampInput = (value, maxValue) => {
    const sanitized = value.replace(/[^0-9]/g, "");
    const numeric = Number(sanitized || 0);
    const capped = Number.isFinite(maxValue) ? Math.min(numeric, maxValue) : numeric;
    return sanitized === "" ? "" : String(capped);
  };

  const handleWorkingChange = (staffId, value) => {
    setWorkingInputs((prev) => ({
      ...prev,
      [staffId]: clampInput(value, 31),
    }));
  };

  const handlePresentChange = (staffId, value, maxDays) => {
    setPresentInputs((prev) => ({
      ...prev,
      [staffId]: clampInput(value, maxDays),
    }));
  };

  const handleHalfChange = (staffId, value, maxDays) => {
    setHalfInputs((prev) => ({
      ...prev,
      [staffId]: clampInput(value, maxDays),
    }));
  };

  const handleLeaveChange = (staffId, value, maxDays) => {
    setLeaveInputs((prev) => ({
      ...prev,
      [staffId]: clampInput(value, maxDays),
    }));
  };

  const handleSave = async (member) => {
    const staffId = String(member._id || member.id);
    if (!hasBaseSalary(member.salaryType)) return;
    if (lockedStaffIds.has(staffId)) {
      setMessage("");
      setError("Attendance is locked for this period.");
      return;
    }

    const monthInfo = parseMonthValue(selectedMonth);
    if (!monthInfo) return;

    const record = attendanceMap[staffId];
    const workingDays = Number(workingInputs[staffId] || record?.workingDays || DEFAULT_WORKING_DAYS);
    const presentDays = Number(presentInputs[staffId] || 0);
    const halfDays = Number(halfInputs[staffId] || 0);
    const approvedLeaveDays = Number(leaveInputs[staffId] || 0);
    const totalDays = presentDays + approvedLeaveDays + halfDays * 0.5;
    if (totalDays > workingDays) {
      setError("Attendance days cannot exceed working days.");
      return;
    }

    setSavingStaffId(staffId);
    setMessage("");
    setError("");
    try {
      const payload = {
        staffId,
        month: monthInfo.month,
        year: monthInfo.year,
        workingDays,
        presentDays,
        halfDays,
        approvedLeaveDays,
      };
      const { data } = await api.post("/attendance", payload);
      setAttendanceRecords((prev) => {
        const exists = prev.some((record) => String(record.staffId) === staffId);
        if (exists) {
          return prev.map((record) =>
            String(record.staffId) === staffId ? data : record
          );
        }
        return [data, ...prev];
      });
      setWorkingInputs((prev) => ({
        ...prev,
        [staffId]: String(data.workingDays ?? workingDays),
      }));
      setPresentInputs((prev) => ({
        ...prev,
        [staffId]: String(data.presentDays),
      }));
      setHalfInputs((prev) => ({
        ...prev,
        [staffId]: String(data.halfDays ?? halfDays),
      }));
      setLeaveInputs((prev) => ({
        ...prev,
        [staffId]: String(data.approvedLeaveDays ?? approvedLeaveDays),
      }));
      setEditingStaffId("");
      setMessage("Attendance saved.");
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Unable to save attendance. Please try again."
      );
    } finally {
      setSavingStaffId("");
    }
  };

  return (
    <div className="attendance-page">
      <div className="attendance-header">
        <div>
          <PageHeader title="Attendance" />
          <p className="attendance-subtitle">
            Monthly attendance tracking for staff with base salaries.
          </p>
        </div>
      </div>

      {error ? <p className="attendance-error">{error}</p> : null}
      {message ? <p className="attendance-success">{message}</p> : null}

      <section className="attendance-card">
        <div className="attendance-card__head">
          <h2>Filters</h2>
          <p>Select a month and optionally filter by staff member.</p>
        </div>
        <div className="attendance-filters">
          <div className="attendance-field">
            <label htmlFor="attendance-month">Month</label>
            <input
              id="attendance-month"
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
          </div>
          <div className="attendance-field">
            <label htmlFor="attendance-staff">Staff</label>
            <select
              id="attendance-staff"
              value={selectedStaffId}
              onChange={(event) => setSelectedStaffId(event.target.value)}
            >
              <option value="">All staff</option>
              {activeStaff.map((member) => (
                <option key={member._id || member.id} value={member._id || member.id}>
                  {member.fullName} - {member.roleName || "Role"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="attendance-card">
        <div className="attendance-card__head">
          <h2>Attendance Register</h2>
          <p>Working days default to {DEFAULT_WORKING_DAYS} per month.</p>
        </div>
        {filteredStaff.length === 0 ? (
          <p className="attendance-muted">No staff available.</p>
        ) : (
          <div className="attendance-table-wrapper">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th>Role</th>
                  <th>Salary Type</th>
                  <th>Working Days</th>
                  <th>Present Days</th>
                  <th>Half Days</th>
                  <th>Leave Days</th>
                  <th>Absent Days</th>
                  <th>LOP Days</th>
                  <th>LOP Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((member) => {
                  const staffId = String(member._id || member.id);
                  const record = attendanceMap[staffId];
                  const workingValue =
                    workingInputs[staffId] ??
                    String(record?.workingDays ?? DEFAULT_WORKING_DAYS);
                  const presentValue = presentInputs[staffId] ?? "";
                  const halfValue = halfInputs[staffId] ?? "";
                  const leaveValue = leaveInputs[staffId] ?? "";
                  const workingDays = Number(workingValue || 0);
                  const presentNumber = Number(presentValue || 0);
                  const halfNumber = Number(halfValue || 0);
                  const leaveNumber = Number(leaveValue || 0);
                  const totalDays =
                    presentNumber + leaveNumber + halfNumber * 0.5;
                  const normalizedSalaryType = String(
                    member.salaryType || ""
                  ).toUpperCase();
                  const isPerDay = normalizedSalaryType === "PER_DAY";
                  const absentDays = isPerDay
                    ? 0
                    : Math.max(0, workingDays - totalDays);
                  const lopDays = isPerDay ? 0 : Math.max(0, absentDays);
                  const baseEligible = hasBaseSalary(member.salaryType);
                  const isLocked = lockedStaffIds.has(staffId);
                  const baseSalary = Number(member.basicSalary) || 0;
                  const perDayValue =
                    workingDays > 0 ? baseSalary / workingDays : 0;
                  const isFixedSalary = ["FIXED", "HYBRID"].includes(
                    normalizedSalaryType
                  );
                  const lopAmount =
                    !isPerDay && isFixedSalary ? lopDays * perDayValue : 0;
                  const hasOverage = totalDays > workingDays;

                  return (
                    <tr key={staffId}>
                      <td>{member.fullName}</td>
                      <td>{member.roleName || "-"}</td>
                      <td>{formatSalaryType(member.salaryType)}</td>
                      <td>
                        <input
                          className="attendance-input"
                          type="number"
                          min="0"
                          max="31"
                          value={workingValue}
                          onChange={(event) =>
                            handleWorkingChange(staffId, event.target.value)
                          }
                          disabled={!baseEligible || isLocked || editingStaffId !== staffId}
                        />
                      </td>
                      <td>
                        <input
                          className="attendance-input"
                          type="number"
                          min="0"
                          max={workingDays || DEFAULT_WORKING_DAYS}
                          value={presentValue}
                          onChange={(event) =>
                            handlePresentChange(
                              staffId,
                              event.target.value,
                              workingDays || DEFAULT_WORKING_DAYS
                            )
                          }
                          disabled={!baseEligible || isLocked || editingStaffId !== staffId}
                        />
                      </td>
                      <td>
                        <input
                          className="attendance-input"
                          type="number"
                          min="0"
                          max={workingDays || DEFAULT_WORKING_DAYS}
                          value={halfValue}
                          onChange={(event) =>
                            handleHalfChange(
                              staffId,
                              event.target.value,
                              workingDays || DEFAULT_WORKING_DAYS
                            )
                          }
                          disabled={!baseEligible || isLocked || editingStaffId !== staffId}
                        />
                      </td>
                      <td>
                        <input
                          className="attendance-input"
                          type="number"
                          min="0"
                          max={workingDays || DEFAULT_WORKING_DAYS}
                          value={leaveValue}
                          onChange={(event) =>
                            handleLeaveChange(
                              staffId,
                              event.target.value,
                              workingDays || DEFAULT_WORKING_DAYS
                            )
                          }
                          disabled={!baseEligible || isLocked || editingStaffId !== staffId}
                        />
                      </td>
                      <td>
                        <span className="attendance-pill light">
                          {baseEligible ? (isPerDay ? "N/A" : absentDays) : "-"}
                        </span>
                      </td>
                      <td>
                        <span className="attendance-pill light">
                          {baseEligible ? (isPerDay ? "N/A" : lopDays) : "-"}
                        </span>
                      </td>
                      <td>
                        <span className="attendance-pill light">
                          {baseEligible
                            ? isPerDay
                              ? "N/A"
                              : lopAmount.toFixed(2)
                            : "-"}
                        </span>
                      </td>
                      <td>
                        <div className="attendance-actions">
                          <button
                            type="button"
                            className="attendance-action attendance-action--secondary"
                            onClick={() => setEditingStaffId(staffId)}
                            disabled={!baseEligible || isLocked}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="attendance-action"
                            onClick={() => handleSave(member)}
                            disabled={
                              !baseEligible ||
                              isLocked ||
                              savingStaffId === staffId
                            }
                          >
                            Save
                          </button>
                        </div>
                        {!baseEligible ? (
                          <span className="attendance-note">Not required</span>
                        ) : null}
                        {hasOverage ? (
                          <span className="attendance-note warning">
                            Attendance days exceed working days
                          </span>
                        ) : null}
                        {isLocked ? (
                          <span className="attendance-note">Locked</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default Attendance;
