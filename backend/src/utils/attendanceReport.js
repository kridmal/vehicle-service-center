const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (value) => String(value).padStart(2, "0");

export const toDateStringLocal = (date = new Date()) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const resolveMonthlyCutoff = ({ year, month, today = new Date() }) => {
  const requestValue = Number(year) * 100 + Number(month);
  const todayValue = today.getFullYear() * 100 + (today.getMonth() + 1);

  if (requestValue > todayValue) {
    return { isFutureMonth: true, cutoffDate: null };
  }

  if (requestValue === todayValue) {
    return { isFutureMonth: false, cutoffDate: toDateStringLocal(today) };
  }

  const endDay = new Date(Number(year), Number(month), 0).getDate();
  return {
    isFutureMonth: false,
    cutoffDate: `${year}-${pad2(month)}-${pad2(endDay)}`,
  };
};

export const normalizeAttendanceStatus = (value) => String(value || "").trim().toLowerCase();

const isLeaveStatus = (status) => status === "on-leave" || status === "leave";
const isPresentStatus = (status) =>
  status === "present" || status === "late" || status === "half-day";
const isAbsentStatus = (status) => status === "absent";

const isUnpaidLeave = (entry, unpaidLeaveTypeIds) => {
  if (typeof entry?.isPaidLeave === "boolean") {
    return entry.isPaidLeave === false;
  }
  const leaveTypeId = String(entry?.leaveTypeId || "");
  return leaveTypeId ? unpaidLeaveTypeIds.has(leaveTypeId) : false;
};

export const summarizeEvaluatedAttendance = ({
  evaluatedDates = [],
  attendanceByDate = new Map(),
  unpaidLeaveTypeIds = new Set(),
}) => {
  let presentCount = 0;
  let absentCount = 0;
  let leaveCount = 0;
  let unmarkedCount = 0;
  let lopDays = 0;

  evaluatedDates.forEach((date) => {
    if (!DATE_RE.test(String(date || ""))) return;
    const entry = attendanceByDate.get(date);
    if (!entry) {
      unmarkedCount += 1;
      return;
    }
    const status = normalizeAttendanceStatus(entry.status);
    if (isPresentStatus(status)) {
      presentCount += 1;
      return;
    }
    if (isAbsentStatus(status)) {
      absentCount += 1;
      lopDays += 1;
      return;
    }
    if (isLeaveStatus(status)) {
      leaveCount += 1;
      if (isUnpaidLeave(entry, unpaidLeaveTypeIds)) {
        lopDays += 1;
      }
      return;
    }
    unmarkedCount += 1;
  });

  return {
    workingDaysEvaluated: evaluatedDates.length,
    presentCount,
    absentCount,
    leaveCount,
    unmarkedCount,
    lopDays,
  };
};
