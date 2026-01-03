import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../services/api.js";
import "./Attendance.css";

const TABS = [
  { id: "daily", label: "Daily Attendance" },
  { id: "leaves", label: "Leave Management" },
  { id: "labor", label: "Labor Hours" },
  { id: "summary", label: "Monthly Summary" },
];

const ATTENDANCE_TYPES = [
  "WORK_FULL",
  "WORK_HALF",
  "LEAVE_FULL",
  "LEAVE_HALF",
  "ABSENT",
];

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

const formatDateValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const parseTimeToMinutes = (value) => {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const getOtHours = (inTime, outTime) => {
  const startMinutes = parseTimeToMinutes(inTime);
  const endMinutes = parseTimeToMinutes(outTime);
  if (startMinutes === null || endMinutes === null) return null;
  if (endMinutes <= startMinutes) return null;
  const hours = (endMinutes - startMinutes) / 60;
  return Math.max(0, hours - 8);
};

const formatSalaryType = (value) =>
  String(value || "-").replaceAll("_", " ");

const formatStatus = (value) => String(value || "-").replaceAll("_", " ");

const getTotalDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

const countWeeklyOffs = (year, month, pattern) => {
  if (pattern === "CUSTOM") return 0;
  const totalDays = getTotalDaysInMonth(year, month);
  let count = 0;
  for (let day = 1; day <= totalDays; day += 1) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday === 0) {
      count += 1;
    } else if (pattern === "SAT_SUN" && weekday === 6) {
      count += 1;
    }
  }
  return count;
};

const clampNumber = (value, min, max) => {
  if (!Number.isFinite(value)) return null;
  return Math.min(Math.max(value, min), max);
};

const WEEKDAY_LABELS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function Attendance() {
  const [activeTab, setActiveTab] = useState("daily");
  const [staff, setStaff] = useState([]);
  const [dailyMonth, setDailyMonth] = useState(() => toMonthValue(new Date()));
  const [dailyStaffId, setDailyStaffId] = useState("");
  const [dailyRecords, setDailyRecords] = useState([]);
  const [dailyForm, setDailyForm] = useState({
    staffId: "",
    date: "",
    attendanceType: "WORK_FULL",
    leaveType: "",
    inTime: "",
    outTime: "",
    source: "MANUAL",
    remarks: "",
  });
  const [dailyMessage, setDailyMessage] = useState("");
  const [dailyError, setDailyError] = useState("");
  const [dailySaving, setDailySaving] = useState(false);
  const [dailyRefresh, setDailyRefresh] = useState(0);

  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveList, setLeaveList] = useState([]);
  const [leaveForm, setLeaveForm] = useState({
    staffId: "",
    leaveTypeId: "",
    fromDate: "",
    toDate: "",
    dayType: "FULL",
  });
  const [leaveFilterStaffId, setLeaveFilterStaffId] = useState("");
  const [leaveFilterStatus, setLeaveFilterStatus] = useState("");
  const [leaveMessage, setLeaveMessage] = useState("");
  const [leaveError, setLeaveError] = useState("");
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [leaveRefresh, setLeaveRefresh] = useState(0);

  const [laborMonth, setLaborMonth] = useState(() => toMonthValue(new Date()));
  const [laborStaffId, setLaborStaffId] = useState("");
  const [laborRecords, setLaborRecords] = useState([]);
  const [laborError, setLaborError] = useState("");
  const [laborLoading, setLaborLoading] = useState(false);
  const [laborRefresh, setLaborRefresh] = useState(0);

  const [summaryMonth, setSummaryMonth] = useState(() =>
    toMonthValue(new Date())
  );
  const [summaryRecords, setSummaryRecords] = useState([]);
  const [summaryMessage, setSummaryMessage] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryConfirmId, setSummaryConfirmId] = useState("");
  const [summaryCheckId, setSummaryCheckId] = useState("");
  const [summaryRefresh, setSummaryRefresh] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [calendarRecord, setCalendarRecord] = useState(null);
  const [calendarForm, setCalendarForm] = useState({
    weeklyOffPattern: "SUN",
    holidays: [],
    weeklyOffDays: [],
    customOffDates: [],
    workingDaysOverride: "",
  });
  const [holidayInput, setHolidayInput] = useState("");
  const [customOffInput, setCustomOffInput] = useState("");

  const { user } = useAuth();
  const navigate = useNavigate();

  const handleAuthRedirect = (err) => {
    if (err.response?.status === 401) {
      return true;
    }
    if (err.response?.status === 403) {
      navigate("/unauthorized", { replace: true });
      return true;
    }
    return false;
  };

  useEffect(() => {
    const loadStaff = async () => {
      try {
        const { data } = await api.get("/staff");
        setStaff(Array.isArray(data) ? data : []);
      } catch (err) {
        if (handleAuthRedirect(err)) return;
      }
    };
    loadStaff();
  }, []);

  useEffect(() => {
    if (activeTab !== "daily") return;
    const loadDailyAttendance = async () => {
      const monthInfo = parseMonthValue(dailyMonth);
      if (!monthInfo) return;
      setDailyError("");
      setDailyMessage("");
      try {
        const params = { month: monthInfo.month, year: monthInfo.year };
        if (dailyStaffId) {
          params.staffId = dailyStaffId;
        }
        const { data } = await api.get("/daily-attendance", { params });
        setDailyRecords(Array.isArray(data) ? data : []);
      } catch (err) {
        if (handleAuthRedirect(err)) return;
        setDailyError(
          err.response?.data?.message ||
            "Unable to load daily attendance."
        );
      }
    };
    loadDailyAttendance();
  }, [activeTab, dailyMonth, dailyStaffId, dailyRefresh]);

  useEffect(() => {
    if (activeTab !== "leaves") return;
    const loadLeaves = async () => {
      setLeaveError("");
      setLeaveMessage("");
      try {
        const params = {};
        if (leaveFilterStaffId) params.staffId = leaveFilterStaffId;
        if (leaveFilterStatus) params.status = leaveFilterStatus;
        const { data } = await api.get("/leaves", { params });
        setLeaveList(Array.isArray(data) ? data : []);
      } catch (err) {
        if (handleAuthRedirect(err)) return;
        setLeaveError(
          err.response?.data?.message ||
            "Unable to load leave requests."
        );
      }
    };
    loadLeaves();
  }, [activeTab, leaveFilterStaffId, leaveFilterStatus, leaveRefresh]);

  useEffect(() => {
    if (activeTab !== "leaves") return;
    if (leaveTypes.length > 0) return;
    const loadLeaveTypes = async () => {
      try {
        const { data } = await api.get("/leave-types");
        setLeaveTypes(Array.isArray(data) ? data : []);
      } catch (err) {
        if (handleAuthRedirect(err)) return;
      }
    };
    loadLeaveTypes();
  }, [activeTab, leaveTypes.length]);

  useEffect(() => {
    if (activeTab !== "labor") return;
    const loadLaborDetails = async () => {
      if (!laborMonth) return;
      setLaborLoading(true);
      setLaborError("");
      try {
        const params = { month: laborMonth };
        if (laborStaffId) params.staffId = laborStaffId;
        const { data } = await api.get("/labor-hour-logs", { params });
        setLaborRecords(Array.isArray(data) ? data : []);
      } catch (err) {
        if (handleAuthRedirect(err)) return;
        setLaborError(
          err.response?.data?.message ||
            "Unable to load labor hour details."
        );
      } finally {
        setLaborLoading(false);
      }
    };
    loadLaborDetails();
  }, [activeTab, laborMonth, laborStaffId, laborRefresh]);

  useEffect(() => {
    if (activeTab !== "summary") return;
    const loadSummaries = async () => {
      const monthInfo = parseMonthValue(summaryMonth);
      if (!monthInfo) return;
      setSummaryLoading(true);
      setSummaryError("");
      try {
        const { data } = await api.get("/monthly-summaries", {
          params: { month: monthInfo.month, year: monthInfo.year },
        });
        setSummaryRecords(Array.isArray(data) ? data : []);
      } catch (err) {
        if (handleAuthRedirect(err)) return;
        setSummaryError(
          err.response?.data?.message ||
            "Unable to load monthly summaries."
        );
      } finally {
        setSummaryLoading(false);
      }
    };
    loadSummaries();
  }, [activeTab, summaryMonth, summaryRefresh]);

  const staffNameMap = useMemo(() => {
    return staff.reduce((acc, member) => {
      acc[String(member._id || member.id)] = member.fullName;
      return acc;
    }, {});
  }, [staff]);

  const activeStaff = Array.isArray(staff)
    ? staff.filter((member) => member.active !== false)
    : [];

  const laborHoursTotal = useMemo(() => {
    return laborRecords.reduce(
      (sum, record) => sum + (Number(record.laborHours) || 0),
      0
    );
  }, [laborRecords]);

  const canManageCalendar =
    user?.role === "OWNER" || user?.role === "ADMIN";
  const canCheckAttendance =
    user?.role === "OWNER" || user?.role === "OPERATOR";
  const canConfirmAttendance =
    user?.role === "OWNER" || user?.role === "ADMIN";

  const calendarMonthInfo = useMemo(
    () => parseMonthValue(summaryMonth),
    [summaryMonth]
  );

  const totalDaysForCalendar = calendarMonthInfo
    ? getTotalDaysInMonth(calendarMonthInfo.year, calendarMonthInfo.month)
    : 0;

  const calculatedWorkingDays = calendarMonthInfo
    ? (() => {
        const year = calendarMonthInfo.year;
        const month = calendarMonthInfo.month;
        const holidaySet = new Set(calendarForm.holidays);
        if (calendarForm.weeklyOffPattern !== "CUSTOM") {
          const weeklyOffs = countWeeklyOffs(
            year,
            month,
            calendarForm.weeklyOffPattern
          );
          return Math.max(
            totalDaysForCalendar - weeklyOffs - holidaySet.size,
            0
          );
        }
        const offSet = new Set();
        const totalDays = totalDaysForCalendar;
        for (let day = 1; day <= totalDays; day += 1) {
          const date = new Date(year, month - 1, day);
          if (calendarForm.weeklyOffDays.includes(date.getDay())) {
            offSet.add(formatDateValue(date));
          }
        }
        calendarForm.customOffDates.forEach((date) => offSet.add(date));
        const union = new Set([...holidaySet, ...offSet]);
        return Math.max(totalDays - union.size, 0);
      })()
    : 0;

  const effectiveWorkingDays = (() => {
    const overrideRaw = String(calendarForm.workingDaysOverride ?? "").trim();
    if (!overrideRaw) return calculatedWorkingDays;
    const parsed = Number(overrideRaw);
    const clamped = clampNumber(parsed, 0, totalDaysForCalendar);
    return clamped === null ? calculatedWorkingDays : clamped;
  })();

  const loadCalendarForMonth = async () => {
    if (!summaryMonth) return;
    setCalendarLoading(true);
    setCalendarError("");
    try {
      const { data } = await api.get("/work-calendars", {
        params: { month: summaryMonth },
      });
      setCalendarRecord(data);
      setCalendarForm({
        weeklyOffPattern: data.weeklyOffPattern || "SUN",
        holidays: Array.isArray(data.holidays)
          ? data.holidays.map((value) => formatDateValue(value))
          : [],
        weeklyOffDays: Array.isArray(data.weeklyOffDays)
          ? data.weeklyOffDays
          : [],
        customOffDates: Array.isArray(data.customOffDates)
          ? data.customOffDates.map((value) => formatDateValue(value))
          : [],
        workingDaysOverride:
          data.workingDaysOverride !== undefined &&
          data.workingDaysOverride !== null
            ? String(data.workingDaysOverride)
            : "",
      });
    } catch (err) {
      if (handleAuthRedirect(err)) return;
      if (err.response?.status === 404) {
        setCalendarRecord(null);
        setCalendarForm({
          weeklyOffPattern: "SUN",
          holidays: [],
          weeklyOffDays: [],
          customOffDates: [],
          workingDaysOverride: "",
        });
        return;
      }
      setCalendarError(
        err.response?.data?.message || "Unable to load work calendar."
      );
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleOpenCalendar = async () => {
    setCalendarOpen(true);
    await loadCalendarForMonth();
  };

  const handleCloseCalendar = () => {
    setCalendarOpen(false);
    setCalendarError("");
    setHolidayInput("");
  };

  const handleCalendarField = (field, value) => {
    setCalendarForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddHoliday = () => {
    if (!holidayInput || !calendarMonthInfo) return;
    const date = new Date(holidayInput);
    if (Number.isNaN(date.getTime())) return;
    if (
      date.getFullYear() !== calendarMonthInfo.year ||
      date.getMonth() !== calendarMonthInfo.month - 1
    ) {
      setCalendarError("Holiday must be within the selected month.");
      return;
    }
    const key = formatDateValue(date);
    if (!key) return;
    setCalendarForm((prev) => {
      if (prev.holidays.includes(key)) return prev;
      return { ...prev, holidays: [...prev.holidays, key].sort() };
    });
    setHolidayInput("");
    setCalendarError("");
  };

  const handleAddCustomOffDate = () => {
    if (!customOffInput || !calendarMonthInfo) return;
    const date = new Date(customOffInput);
    if (Number.isNaN(date.getTime())) return;
    if (
      date.getFullYear() !== calendarMonthInfo.year ||
      date.getMonth() !== calendarMonthInfo.month - 1
    ) {
      setCalendarError("Custom off date must be within the selected month.");
      return;
    }
    const key = formatDateValue(date);
    if (!key) return;
    setCalendarForm((prev) => {
      if (prev.customOffDates.includes(key)) return prev;
      return { ...prev, customOffDates: [...prev.customOffDates, key].sort() };
    });
    setCustomOffInput("");
    setCalendarError("");
  };

  const handleRemoveHoliday = (value) => {
    setCalendarForm((prev) => ({
      ...prev,
      holidays: prev.holidays.filter((date) => date !== value),
    }));
  };

  const handleRemoveCustomOffDate = (value) => {
    setCalendarForm((prev) => ({
      ...prev,
      customOffDates: prev.customOffDates.filter((date) => date !== value),
    }));
  };

  const toggleWeeklyOffDay = (day) => {
    setCalendarForm((prev) => {
      const next = new Set(prev.weeklyOffDays);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return { ...prev, weeklyOffDays: Array.from(next).sort() };
    });
  };

  const handleSaveCalendar = async () => {
    if (!summaryMonth) return;
    setCalendarSaving(true);
    setCalendarError("");
    try {
      const overrideRaw = String(calendarForm.workingDaysOverride ?? "").trim();
      const overrideValue =
        overrideRaw && Number.isFinite(Number(overrideRaw))
          ? Number(overrideRaw)
          : null;
      const { data } = await api.post("/work-calendars", {
        month: summaryMonth,
        weeklyOffPattern: calendarForm.weeklyOffPattern,
        holidays: calendarForm.holidays,
        weeklyOffDays: calendarForm.weeklyOffDays,
        customOffDates: calendarForm.customOffDates,
        workingDaysOverride: overrideValue,
        workingDays: effectiveWorkingDays,
      });
      setCalendarRecord(data);
      setCalendarForm((prev) => ({
        ...prev,
        workingDaysOverride:
          data.workingDaysOverride !== undefined &&
          data.workingDaysOverride !== null
            ? String(data.workingDaysOverride)
            : prev.workingDaysOverride,
      }));
    } catch (err) {
      if (handleAuthRedirect(err)) return;
      setCalendarError(
        err.response?.data?.message || "Unable to save work calendar."
      );
    } finally {
      setCalendarSaving(false);
    }
  };

  const handleLockCalendar = async () => {
    if (!calendarRecord?._id) return;
    setCalendarSaving(true);
    setCalendarError("");
    try {
      const { data } = await api.patch(
        `/work-calendars/${calendarRecord._id}/lock`
      );
      setCalendarRecord(data);
    } catch (err) {
      if (handleAuthRedirect(err)) return;
      setCalendarError(
        err.response?.data?.message || "Unable to lock work calendar."
      );
    } finally {
      setCalendarSaving(false);
    }
  };
  const handleDailyFormChange = (field, value) => {
    setDailyForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetDailyForm = () => {
    setDailyForm({
      staffId: "",
      date: "",
      attendanceType: "WORK_FULL",
      leaveType: "",
      inTime: "",
      outTime: "",
      source: "MANUAL",
      remarks: "",
    });
  };

  const handleDailyEdit = (entry) => {
    if (entry.isSystemGenerated) return;
    setDailyForm({
      staffId: String(entry.staffId || ""),
      date: formatDateValue(entry.date),
      attendanceType: entry.attendanceType || "WORK_FULL",
      leaveType: entry.leaveType || "",
      inTime: entry.inTime || "",
      outTime: entry.outTime || "",
      source: entry.source || "MANUAL",
      remarks: entry.remarks || "",
    });
  };

  const handleSaveDailyAttendance = async () => {
    if (!dailyForm.staffId || !dailyForm.date || !dailyForm.attendanceType) {
      setDailyError("Staff, date, and attendance type are required.");
      return;
    }
    if (
      dailyForm.attendanceType.startsWith("LEAVE") &&
      !dailyForm.leaveType
    ) {
      setDailyError("Leave type is required for leave attendance.");
      return;
    }

    setDailySaving(true);
    setDailyMessage("");
    setDailyError("");
    try {
      await api.post("/daily-attendance", {
        staffId: dailyForm.staffId,
        date: dailyForm.date,
        attendanceType: dailyForm.attendanceType,
        leaveType: dailyForm.leaveType || null,
        inTime: dailyForm.inTime || null,
        outTime: dailyForm.outTime || null,
        source: dailyForm.source,
        remarks: dailyForm.remarks || "",
      });
      setDailyMessage("Daily attendance saved.");
      setDailyRefresh((prev) => prev + 1);
      resetDailyForm();
    } catch (err) {
      if (handleAuthRedirect(err)) return;
      setDailyError(
        err.response?.data?.message || "Unable to save daily attendance."
      );
    } finally {
      setDailySaving(false);
    }
  };

  const handleCreateLeave = async () => {
    if (
      !leaveForm.staffId ||
      !leaveForm.leaveTypeId ||
      !leaveForm.fromDate ||
      !leaveForm.toDate
    ) {
      setLeaveError("All leave fields are required.");
      return;
    }
    setLeaveSaving(true);
    setLeaveMessage("");
    setLeaveError("");
    try {
      await api.post("/leaves", {
        staffId: leaveForm.staffId,
        leaveTypeId: leaveForm.leaveTypeId,
        fromDate: leaveForm.fromDate,
        toDate: leaveForm.toDate,
        dayType: leaveForm.dayType,
      });
      setLeaveMessage("Leave request created.");
      setLeaveForm({
        staffId: "",
        leaveTypeId: "",
        fromDate: "",
        toDate: "",
        dayType: "FULL",
      });
      setLeaveRefresh((prev) => prev + 1);
    } catch (err) {
      if (handleAuthRedirect(err)) return;
      setLeaveError(
        err.response?.data?.message || "Unable to create leave request."
      );
    } finally {
      setLeaveSaving(false);
    }
  };

  const handleLeaveAction = async (leaveId, action) => {
    if (!leaveId) return;
    setLeaveMessage("");
    setLeaveError("");
    try {
      const endpoint =
        action === "APPROVE"
          ? `/leaves/${leaveId}/approve`
          : `/leaves/${leaveId}/reject`;
      const { data } = await api.patch(endpoint);
      if (action === "APPROVE") {
        setLeaveMessage(
          `Leave approved. ${data?.created ?? 0} attendance rows created, ${
            data?.skipped ?? 0
          } skipped.`
        );
      } else {
        setLeaveMessage("Leave rejected.");
      }
      setLeaveRefresh((prev) => prev + 1);
    } catch (err) {
      if (handleAuthRedirect(err)) return;
      setLeaveError(
        err.response?.data?.message || "Unable to update leave status."
      );
    }
  };

  const handleLoadMonthlySummary = async () => {
    const monthInfo = parseMonthValue(summaryMonth);
    if (!monthInfo) return;
    setSummaryMessage("");
    setSummaryError("");
    setSummaryLoading(true);
    try {
      const { data } = await api.post("/monthly-summaries/load", {
        month: monthInfo.month,
        year: monthInfo.year,
      });
      setSummaryMessage(
        `Monthly summaries loaded: ${data?.updated ?? 0} updated, ${
          data?.skipped ?? 0
        } skipped.`
      );
      setSummaryRefresh((prev) => prev + 1);
    } catch (err) {
      if (handleAuthRedirect(err)) return;
      setSummaryError(
        err.response?.data?.message || "Unable to load monthly summaries."
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleCheckAttendance = async (summaryId) => {
    if (!summaryId) return;
    setSummaryMessage("");
    setSummaryError("");
    setSummaryCheckId(summaryId);
    try {
      await api.post(`/attendance/monthly/${summaryId}/check`);
      setSummaryMessage("Attendance checked.");
      setSummaryRefresh((prev) => prev + 1);
    } catch (err) {
      if (handleAuthRedirect(err)) return;
      setSummaryError(
        err.response?.data?.message || "Unable to check attendance."
      );
    } finally {
      setSummaryCheckId("");
    }
  };

  const handleConfirmAttendance = async (summaryId) => {
    if (!summaryId) return;
    setSummaryMessage("");
    setSummaryError("");
    setSummaryConfirmId(summaryId);
    try {
      await api.post(`/attendance/monthly/${summaryId}/confirm`);
      setSummaryMessage("Attendance confirmed.");
      setSummaryRefresh((prev) => prev + 1);
    } catch (err) {
      if (handleAuthRedirect(err)) return;
      setSummaryError(
        err.response?.data?.message || "Unable to confirm attendance."
      );
    } finally {
      setSummaryConfirmId("");
    }
  };

  return (
    <div className="attendance-page">
      <div className="attendance-header">
        <div>
          <PageHeader title="Attendance" />
          <p className="attendance-subtitle">
            Daily attendance, leave, labor hours, and monthly summaries.
          </p>
        </div>
      </div>

      <div className="attendance-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`attendance-tab${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>


      {activeTab === "daily" ? (
        <>
          {dailyError ? <p className="attendance-error">{dailyError}</p> : null}
          {dailyMessage ? (
            <p className="attendance-success">{dailyMessage}</p>
          ) : null}
          <section className="attendance-card">
            <div className="attendance-card__head">
              <h2>Daily Attendance Filters</h2>
              <p>Mark attendance at a daily level for each staff member.</p>
            </div>
            <div className="attendance-filters">
              <div className="attendance-field">
                <label htmlFor="daily-month">Month</label>
                <input
                  id="daily-month"
                  type="month"
                  value={dailyMonth}
                  onChange={(event) => setDailyMonth(event.target.value)}
                />
              </div>
              <div className="attendance-field">
                <label htmlFor="daily-staff-filter">Staff</label>
                <select
                  id="daily-staff-filter"
                  value={dailyStaffId}
                  onChange={(event) => setDailyStaffId(event.target.value)}
                >
                  <option value="">All staff</option>
                  {activeStaff.map((member) => (
                    <option
                      key={member._id || member.id}
                      value={member._id || member.id}
                    >
                      {member.fullName} - {member.roleName || "Role"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="attendance-card">
            <div className="attendance-card__head">
              <h2>Daily Attendance Entry</h2>
              <p>Manual entry today, biometric-ready for future use.</p>
            </div>
            <div className="attendance-form-grid">
              <div className="attendance-field">
                <label htmlFor="daily-staff">Staff</label>
                <select
                  id="daily-staff"
                  value={dailyForm.staffId}
                  onChange={(event) =>
                    handleDailyFormChange("staffId", event.target.value)
                  }
                >
                  <option value="">Select staff</option>
                  {activeStaff.map((member) => (
                    <option
                      key={member._id || member.id}
                      value={member._id || member.id}
                    >
                      {member.fullName} - {member.roleName || "Role"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="attendance-field">
                <label htmlFor="daily-date">Date</label>
                <input
                  id="daily-date"
                  type="date"
                  value={dailyForm.date}
                  onChange={(event) =>
                    handleDailyFormChange("date", event.target.value)
                  }
                />
              </div>
              <div className="attendance-field">
                <label htmlFor="daily-type">Attendance Type</label>
                <select
                  id="daily-type"
                  value={dailyForm.attendanceType}
                  onChange={(event) =>
                    handleDailyFormChange("attendanceType", event.target.value)
                  }
                >
                  {ATTENDANCE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {formatStatus(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="attendance-field">
                <label htmlFor="daily-in-time">In Time</label>
                <input
                  id="daily-in-time"
                  type="time"
                  value={dailyForm.inTime}
                  onChange={(event) =>
                    handleDailyFormChange("inTime", event.target.value)
                  }
                />
              </div>
              <div className="attendance-field">
                <label htmlFor="daily-out-time">Out Time</label>
                <input
                  id="daily-out-time"
                  type="time"
                  value={dailyForm.outTime}
                  onChange={(event) =>
                    handleDailyFormChange("outTime", event.target.value)
                  }
                />
              </div>
              <div className="attendance-field">
                <label htmlFor="daily-leave-type">Leave Type</label>
                <input
                  id="daily-leave-type"
                  type="text"
                  placeholder="Leave type"
                  value={dailyForm.leaveType}
                  onChange={(event) =>
                    handleDailyFormChange("leaveType", event.target.value)
                  }
                  disabled={!dailyForm.attendanceType.startsWith("LEAVE")}
                />
              </div>
              <div className="attendance-field">
                <label htmlFor="daily-source">Source</label>
                <select
                  id="daily-source"
                  value={dailyForm.source}
                  onChange={(event) =>
                    handleDailyFormChange("source", event.target.value)
                  }
                >
                  <option value="MANUAL">Manual</option>
                  <option value="BIOMETRIC">Biometric</option>
                </select>
              </div>
              <div className="attendance-field">
                <label htmlFor="daily-remarks">Remarks</label>
                <input
                  id="daily-remarks"
                  type="text"
                  placeholder="Notes"
                  value={dailyForm.remarks}
                  onChange={(event) =>
                    handleDailyFormChange("remarks", event.target.value)
                  }
                />
              </div>
            </div>
            <div className="attendance-actions attendance-actions--end">
              <button
                type="button"
                className="attendance-action attendance-action--secondary"
                onClick={resetDailyForm}
              >
                Clear
              </button>
              <button
                type="button"
                className="attendance-action"
                onClick={handleSaveDailyAttendance}
                disabled={dailySaving}
              >
                Save Daily Attendance
              </button>
            </div>
          </section>

          <section className="attendance-card">
            <div className="attendance-card__head">
              <h2>Daily Attendance Log</h2>
              <p>System-generated leave rows are locked.</p>
            </div>
            {dailyRecords.length === 0 ? (
              <p className="attendance-muted">No daily attendance entries.</p>
            ) : (
              <div className="attendance-table-wrapper">
                <table className="attendance-table attendance-table--compact">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Staff</th>
                      <th>Type</th>
                      <th>In Time</th>
                      <th>Out Time</th>
                      <th>OT Hours</th>
                      <th>Leave Type</th>
                      <th>Source</th>
                      <th>Remarks</th>
                      <th>System</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRecords.map((entry) => {
                      const staffLabel =
                        entry.staffName ||
                        staffNameMap[String(entry.staffId)] ||
                        "Staff";
                      const otHours = getOtHours(entry.inTime, entry.outTime);
                      return (
                        <tr key={entry._id}>
                          <td>{formatDateValue(entry.date)}</td>
                          <td>{staffLabel}</td>
                          <td>{formatStatus(entry.attendanceType)}</td>
                          <td>{entry.inTime || "-"}</td>
                          <td>{entry.outTime || "-"}</td>
                          <td>
                            {otHours === null ? "-" : otHours.toFixed(2)}
                          </td>
                          <td>{entry.leaveType || "-"}</td>
                          <td>{formatStatus(entry.source)}</td>
                          <td>{entry.remarks || "-"}</td>
                          <td>
                            <span
                              className={`attendance-pill light${
                                entry.isSystemGenerated ? " is-warning" : ""
                              }`}
                            >
                              {entry.isSystemGenerated ? "Yes" : "No"}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="attendance-action attendance-action--secondary"
                              onClick={() => handleDailyEdit(entry)}
                              disabled={entry.isSystemGenerated}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
      {activeTab === "leaves" ? (
        <>
          {leaveError ? <p className="attendance-error">{leaveError}</p> : null}
          {leaveMessage ? (
            <p className="attendance-success">{leaveMessage}</p>
          ) : null}
          <section className="attendance-card">
            <div className="attendance-card__head">
              <h2>New Leave Request</h2>
              <p>Approved leaves automatically populate daily attendance.</p>
            </div>
            <div className="attendance-form-grid">
              <div className="attendance-field">
                <label htmlFor="leave-staff">Staff</label>
                <select
                  id="leave-staff"
                  value={leaveForm.staffId}
                  onChange={(event) =>
                    setLeaveForm((prev) => ({
                      ...prev,
                      staffId: event.target.value,
                    }))
                  }
                >
                  <option value="">Select staff</option>
                  {activeStaff.map((member) => (
                    <option
                      key={member._id || member.id}
                      value={member._id || member.id}
                    >
                      {member.fullName} - {member.roleName || "Role"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="attendance-field">
                <label htmlFor="leave-type">Leave Type</label>
                <select
                  id="leave-type"
                  value={leaveForm.leaveTypeId}
                  onChange={(event) =>
                    setLeaveForm((prev) => ({
                      ...prev,
                      leaveTypeId: event.target.value,
                    }))
                  }
                >
                  <option value="">Select leave type</option>
                  {leaveTypes.map((type) => (
                    <option key={type._id || type.id} value={type._id || type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="attendance-field">
                <label htmlFor="leave-from">From</label>
                <input
                  id="leave-from"
                  type="date"
                  value={leaveForm.fromDate}
                  onChange={(event) =>
                    setLeaveForm((prev) => ({
                      ...prev,
                      fromDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="attendance-field">
                <label htmlFor="leave-to">To</label>
                <input
                  id="leave-to"
                  type="date"
                  value={leaveForm.toDate}
                  onChange={(event) =>
                    setLeaveForm((prev) => ({
                      ...prev,
                      toDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="attendance-field">
                <label htmlFor="leave-day-type">Day Type</label>
                <select
                  id="leave-day-type"
                  value={leaveForm.dayType}
                  onChange={(event) =>
                    setLeaveForm((prev) => ({
                      ...prev,
                      dayType: event.target.value,
                    }))
                  }
                >
                  <option value="FULL">Full Day</option>
                  <option value="HALF">Half Day</option>
                </select>
              </div>
            </div>
            <div className="attendance-actions attendance-actions--end">
              <button
                type="button"
                className="attendance-action"
                onClick={handleCreateLeave}
                disabled={leaveSaving}
              >
                Submit Leave
              </button>
            </div>
          </section>

          <section className="attendance-card">
            <div className="attendance-card__head">
              <h2>Leave Requests</h2>
              <p>Approve or reject leave requests.</p>
            </div>
            <div className="attendance-filters">
              <div className="attendance-field">
                <label htmlFor="leave-filter-staff">Staff</label>
                <select
                  id="leave-filter-staff"
                  value={leaveFilterStaffId}
                  onChange={(event) => setLeaveFilterStaffId(event.target.value)}
                >
                  <option value="">All staff</option>
                  {activeStaff.map((member) => (
                    <option
                      key={member._id || member.id}
                      value={member._id || member.id}
                    >
                      {member.fullName} - {member.roleName || "Role"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="attendance-field">
                <label htmlFor="leave-filter-status">Status</label>
                <select
                  id="leave-filter-status"
                  value={leaveFilterStatus}
                  onChange={(event) => setLeaveFilterStatus(event.target.value)}
                >
                  <option value="">All</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </div>
            {leaveList.length === 0 ? (
              <p className="attendance-muted">No leave requests.</p>
            ) : (
              <div className="attendance-table-wrapper">
                <table className="attendance-table attendance-table--compact">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Leave Type</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Day Type</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveList.map((leave) => (
                      <tr key={leave._id}>
                        <td>
                          {staffNameMap[String(leave.staffId)] || "Staff"}
                        </td>
                        <td>{leave.leaveType}</td>
                        <td>{formatDateValue(leave.fromDate)}</td>
                        <td>{formatDateValue(leave.toDate)}</td>
                        <td>{formatStatus(leave.dayType)}</td>
                        <td>
                          <span
                            className={`attendance-pill status-${String(
                              leave.status || "PENDING"
                            ).toLowerCase()}`}
                          >
                            {formatStatus(leave.status)}
                          </span>
                        </td>
                        <td>
                          {leave.status === "PENDING" ? (
                            <div className="attendance-actions">
                              <button
                                type="button"
                                className="attendance-action"
                                onClick={() =>
                                  handleLeaveAction(leave._id, "APPROVE")
                                }
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="attendance-action attendance-action--secondary"
                                onClick={() =>
                                  handleLeaveAction(leave._id, "REJECT")
                                }
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="attendance-note">No actions</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
      {activeTab === "labor" ? (
        <>
          {laborError ? <p className="attendance-error">{laborError}</p> : null}
          <section className="attendance-card">
            <div className="attendance-card__head">
              <h2>Labor Hour Details</h2>
              <p>Immutable task-based hours derived from completed job cards.</p>
            </div>
            <div className="attendance-filters">
              <div className="attendance-field">
                <label htmlFor="labor-month">Month</label>
                <input
                  id="labor-month"
                  type="month"
                  value={laborMonth}
                  onChange={(event) => setLaborMonth(event.target.value)}
                />
              </div>
              <div className="attendance-field">
                <label htmlFor="labor-staff">Staff</label>
                <select
                  id="labor-staff"
                  value={laborStaffId}
                  onChange={(event) => setLaborStaffId(event.target.value)}
                >
                  <option value="">All staff</option>
                  {activeStaff.map((member) => (
                    <option
                      key={member._id || member.id}
                      value={member._id || member.id}
                    >
                      {member.fullName} - {member.roleName || "Role"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="attendance-summary">
              <span>Total Labor Hours (Month)</span>
              <strong>{laborHoursTotal.toFixed(2)}</strong>
            </div>
            {laborLoading ? (
              <p className="attendance-muted">Loading labor details...</p>
            ) : laborRecords.length === 0 ? (
              <p className="attendance-muted">No labor hour details found.</p>
            ) : (
              <div className="attendance-table-wrapper">
                <table className="attendance-table attendance-table--compact">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Staff</th>
                      <th>Job Card</th>
                      <th>Labor Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laborRecords.map((entry) => (
                      <tr key={entry._id}>
                        <td>{formatDateValue(entry.date)}</td>
                        <td>{entry.staffName || "Staff"}</td>
                        <td>{String(entry.jobCardId || "-")}</td>
                        <td>{Number(entry.laborHours || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
      {activeTab === "summary" ? (
        <>
          {summaryError ? (
            <p className="attendance-error">{summaryError}</p>
          ) : null}
          {summaryMessage ? (
            <p className="attendance-success">{summaryMessage}</p>
          ) : null}
          <section className="attendance-card">
            <div className="attendance-card__head">
              <h2>Monthly Summary</h2>
              <p>Derived monthly totals. Edit attendance daily and reload.</p>
            </div>
            <div className="attendance-filters">
              <div className="attendance-field">
                <label htmlFor="summary-month">Month</label>
                <input
                  id="summary-month"
                  type="month"
                  value={summaryMonth}
                  onChange={(event) => setSummaryMonth(event.target.value)}
                />
              </div>
              <div className="attendance-field">
                <button
                  type="button"
                  className="attendance-action"
                  onClick={handleLoadMonthlySummary}
                  disabled={summaryLoading}
                >
                  Load Monthly Data
                </button>
              </div>
              {canManageCalendar ? (
                <div className="attendance-field">
                  <button
                    type="button"
                    className="attendance-action attendance-action--outline"
                    onClick={handleOpenCalendar}
                  >
                    Set Working Days
                  </button>
                </div>
              ) : null}
            </div>
            {summaryLoading ? (
              <p className="attendance-muted">Loading monthly summaries...</p>
            ) : summaryRecords.length === 0 ? (
              <p className="attendance-muted">No monthly summaries yet.</p>
            ) : (
              <div className="attendance-table-wrapper">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Role</th>
                      <th>Salary Type</th>
                      <th>Working</th>
                      <th>Present</th>
                      <th>Half</th>
                      <th>Leave</th>
                      <th>Absent</th>
                      <th>Target Hours</th>
                      <th>Labor Hours</th>
                      <th>OT Hours</th>
                      <th>Incentive Hours</th>
                      <th>LOP Days</th>
                      <th>LOP Amount</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRecords.map((summary) => (
                      <tr key={summary._id}>
                        <td>{summary.staffName || "Staff"}</td>
                        <td>{summary.role || "-"}</td>
                        <td>{formatSalaryType(summary.salaryType)}</td>
                        <td>{summary.workingDays}</td>
                        <td>{summary.presentDays}</td>
                        <td>{summary.halfDays}</td>
                        <td>{summary.leaveDays}</td>
                        <td>{summary.absentDays}</td>
                        <td>{Number(summary.validLaborHours || 0).toFixed(2)}</td>
                        <td>{Number(summary.actualLaborHours || 0).toFixed(2)}</td>
                        <td>{Number(summary.otHours || 0).toFixed(2)}</td>
                        <td>
                          {Number(summary.incentiveEligibleHours || 0).toFixed(2)}
                        </td>
                        <td>
                          {["PENDING", "COMPLETED", "LOCKED"].includes(
                            summary.status
                          )
                            ? summary.lopDays ?? 0
                            : "—"}
                        </td>
                        <td>
                          {["PENDING", "COMPLETED", "LOCKED"].includes(
                            summary.status
                          )
                            ? Number(summary.lopAmount || 0).toFixed(2)
                            : "—"}
                        </td>
                        <td>
                          <span
                            className={`attendance-pill status-${String(
                              summary.status || "DRAFT"
                            ).toLowerCase()}`}
                          >
                            {formatStatus(summary.status)}
                          </span>
                        </td>
                        <td>
                          <div className="attendance-actions">
                            {summary.status === "DRAFT" ? (
                              canCheckAttendance ? (
                                <button
                                  type="button"
                                  className="attendance-action attendance-action--secondary"
                                  onClick={() => handleCheckAttendance(summary._id)}
                                  disabled={summaryCheckId === summary._id}
                                >
                                  Check Attendance
                                </button>
                              ) : (
                                <span className="attendance-note">
                                  Awaiting review
                                </span>
                              )
                            ) : summary.status === "PENDING" ? (
                              canConfirmAttendance ? (
                                <button
                                  type="button"
                                  className="attendance-action"
                                  onClick={() =>
                                    handleConfirmAttendance(summary._id)
                                  }
                                  disabled={summaryConfirmId === summary._id}
                                >
                                  Confirm Attendance
                                </button>
                              ) : (
                                <span className="attendance-note">
                                  Pending approval
                                </span>
                              )
                            ) : summary.status === "COMPLETED" ? (
                              <span className="attendance-note">
                                Attendance Approved ✔
                              </span>
                            ) : (
                              <span className="attendance-note">
                                Used in Payroll 🔒
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
      {calendarOpen ? (
        <div className="attendance-modal__overlay" role="dialog" aria-modal="true">
          <div className="attendance-modal">
            <div className="attendance-modal__head">
              <div>
                <h2>Work Calendar</h2>
                <p>Configure working days for the selected month.</p>
              </div>
              <button
                type="button"
                className="attendance-modal__close"
                onClick={handleCloseCalendar}
              >
                Close
              </button>
            </div>
            {calendarError ? (
              <p className="attendance-error">{calendarError}</p>
            ) : null}
            <div className="attendance-modal__grid">
              <div className="attendance-field">
                <label>Month</label>
                <input type="month" value={summaryMonth} disabled />
              </div>
              <div className="attendance-field">
                <label>Total Days</label>
                <input type="number" value={totalDaysForCalendar} disabled />
              </div>
              <div className="attendance-field">
                <label>Weekly Off Pattern</label>
                <select
                  value={calendarForm.weeklyOffPattern}
                  onChange={(event) =>
                    handleCalendarField("weeklyOffPattern", event.target.value)
                  }
                  disabled={calendarRecord?.locked}
                >
                  <option value="SUN">SUN</option>
                  <option value="SAT_SUN">SAT + SUN</option>
                  <option value="CUSTOM">CUSTOM</option>
                </select>
              </div>
              <div className="attendance-field">
                <label>Calculated Working Days</label>
                <input type="number" value={calculatedWorkingDays} disabled />
              </div>
              <div className="attendance-field">
                <label>Working Days Override</label>
                <input
                  type="number"
                  min="0"
                  value={calendarForm.workingDaysOverride}
                  onChange={(event) =>
                    handleCalendarField("workingDaysOverride", event.target.value)
                  }
                  disabled={calendarRecord?.locked}
                />
              </div>
              <div className="attendance-field">
                <label>Effective Working Days</label>
                <input type="number" value={effectiveWorkingDays} disabled />
              </div>
            </div>
            {calendarForm.weeklyOffPattern === "CUSTOM" ? (
              <div className="attendance-modal__custom">
                <div className="attendance-modal__custom-head">
                  <h3>Custom Weekly Off</h3>
                  <p>Select weekly off days and optional off dates.</p>
                </div>
                <div className="attendance-modal__weekday-list">
                  {WEEKDAY_LABELS.map((day) => (
                    <label key={day.value} className="attendance-modal__weekday">
                      <input
                        type="checkbox"
                        checked={calendarForm.weeklyOffDays.includes(day.value)}
                        onChange={() => toggleWeeklyOffDay(day.value)}
                        disabled={calendarRecord?.locked}
                      />
                      <span>{day.label}</span>
                    </label>
                  ))}
                </div>
                <div className="attendance-modal__custom-dates">
                  <div className="attendance-modal__custom-dates-head">
                    <span>Custom Off Dates</span>
                    <div className="attendance-modal__holiday-input">
                      <input
                        type="date"
                        value={customOffInput}
                        onChange={(event) =>
                          setCustomOffInput(event.target.value)
                        }
                        disabled={calendarRecord?.locked}
                      />
                      <button
                        type="button"
                        className="attendance-action"
                        onClick={handleAddCustomOffDate}
                        disabled={calendarRecord?.locked || calendarLoading}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  {calendarForm.customOffDates.length === 0 ? (
                    <p className="attendance-muted">
                      No custom off dates added.
                    </p>
                  ) : (
                    <div className="attendance-modal__holiday-list">
                      {calendarForm.customOffDates.map((date) => (
                        <div
                          key={date}
                          className="attendance-modal__holiday-chip"
                        >
                          <span>{date}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomOffDate(date)}
                            disabled={calendarRecord?.locked}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            <div className="attendance-modal__holidays">
              <div className="attendance-modal__holidays-head">
                <div>
                  <h3>Holiday Dates</h3>
                  <p>Add holidays within the selected month.</p>
                </div>
                <div className="attendance-modal__holiday-input">
                  <input
                    type="date"
                    value={holidayInput}
                    onChange={(event) => setHolidayInput(event.target.value)}
                    disabled={calendarRecord?.locked}
                  />
                  <button
                    type="button"
                    className="attendance-action"
                    onClick={handleAddHoliday}
                    disabled={calendarRecord?.locked || calendarLoading}
                  >
                    Add
                  </button>
                </div>
              </div>
              {calendarLoading ? (
                <p className="attendance-muted">Loading calendar...</p>
              ) : calendarForm.holidays.length === 0 ? (
                <p className="attendance-muted">No holidays added yet.</p>
              ) : (
                <div className="attendance-modal__holiday-list">
                  {calendarForm.holidays.map((date) => (
                    <div key={date} className="attendance-modal__holiday-chip">
                      <span>{date}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveHoliday(date)}
                        disabled={calendarRecord?.locked}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {calendarRecord?.locked ? (
              <p className="attendance-note">
                This calendar is locked and cannot be edited.
              </p>
            ) : null}
            <div className="attendance-modal__actions">
              <button
                type="button"
                className="attendance-action"
                onClick={handleSaveCalendar}
                disabled={calendarSaving || calendarLoading || calendarRecord?.locked}
              >
                Save
              </button>
              <button
                type="button"
                className="attendance-action"
                onClick={handleLockCalendar}
                disabled={
                  calendarSaving ||
                  calendarLoading ||
                  calendarRecord?.locked ||
                  !calendarRecord?._id
                }
              >
                Lock
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Attendance;
